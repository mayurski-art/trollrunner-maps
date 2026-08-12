-- ============================================================================
-- TROLLRUNNER MAPS — where each troll is from. Run ONCE in Supabase → SQL
-- Editor. Idempotent, safe to re-run.
-- ============================================================================
-- One row per user, keyed by their auth id. Powers maps.trollrunner.net and
-- the location line on profiles across every TrollRunner site.
--
-- PRIVACY MODEL
--   * `is_visible` is the user's own switch. When false the row still exists
--     (so they don't lose their pin) but NOBODY else can read it — that is
--     enforced by the RLS policy below, not by frontend filtering, so a
--     hidden pin never leaves the database even to a crafted client.
--   * Coordinates are stored SNAPPED to ~1 km (3 decimals) and are meant to
--     be a city, not a doorstep. The upsert function rounds server-side, so a
--     client cannot record a more precise location than that.
--   * Nothing here is required. A user with no row simply has no pin.
-- ----------------------------------------------------------------------------

create table if not exists public.troll_locations (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  lat          double precision not null check (lat between -90 and 90),
  lng          double precision not null check (lng between -180 and 180),
  label        text not null check (char_length(label) between 1 and 120),
  country      text check (char_length(country) <= 80),
  country_code text check (country_code ~ '^[A-Za-z]{2}$'),
  is_visible   boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists troll_locations_visible_idx
  on public.troll_locations (is_visible) where is_visible;

create index if not exists troll_locations_country_idx
  on public.troll_locations (country_code) where is_visible;

alter table public.troll_locations enable row level security;

-- Read: your own row always; everyone else's only while they keep it visible.
drop policy if exists troll_locations_read on public.troll_locations;
create policy troll_locations_read on public.troll_locations
  for select to anon, authenticated
  using (is_visible or auth.uid() = user_id);

-- Owners may flip visibility or delete their pin directly. Coordinates only
-- move through troll_set_location() so they are always validated + rounded.
drop policy if exists troll_locations_update on public.troll_locations;
create policy troll_locations_update on public.troll_locations
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists troll_locations_delete on public.troll_locations;
create policy troll_locations_delete on public.troll_locations
  for delete to authenticated
  using (auth.uid() = user_id);

revoke all on public.troll_locations from anon, authenticated;
grant select on public.troll_locations to anon, authenticated;
grant update (is_visible) on public.troll_locations to authenticated;
grant delete on public.troll_locations to authenticated;

-- Public view: pins joined to live profile identity, so a pin follows a
-- username or avatar change automatically. Hidden rows are already filtered
-- out by the table's RLS because the view runs as the caller.
create or replace view public.troll_locations_view
with (security_invoker = on)
as
select l.user_id,
       l.lat,
       l.lng,
       l.label,
       l.country,
       l.country_code,
       l.updated_at,
       p.username,
       p.avatar_url,
       p.level
  from public.troll_locations l
  join public.troll_profiles p on p.id = l.user_id
 where l.is_visible;

grant select on public.troll_locations_view to anon, authenticated;

-- The ONLY door into setting a pin. Requires login, clamps precision to ~1 km,
-- and rate-limits moves so the map can't be used as a live GPS tracker.
create or replace function public.troll_set_location(
  p_lat          double precision,
  p_lng          double precision,
  p_label        text,
  p_country      text default null,
  p_country_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_label text := btrim(coalesce(p_label, ''));
  v_last  timestamptz;
  v_row   troll_locations%rowtype;
begin
  if v_uid is null then
    raise exception 'Login required to drop a pin.';
  end if;
  if p_lat is null or p_lng is null
     or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'That location is off the map.';
  end if;
  if char_length(v_label) < 1 or char_length(v_label) > 120 then
    raise exception 'Give the spot a name (up to 120 characters).';
  end if;

  select updated_at into v_last from troll_locations where user_id = v_uid;
  if v_last is not null and now() - v_last < interval '30 seconds' then
    return jsonb_build_object('saved', false, 'reason', 'too_fast');
  end if;

  insert into troll_locations as tl
    (user_id, lat, lng, label, country, country_code, updated_at)
  values
    (v_uid,
     round(p_lat::numeric, 3),
     round(p_lng::numeric, 3),
     v_label,
     nullif(btrim(coalesce(p_country, '')), ''),
     upper(nullif(btrim(coalesce(p_country_code, '')), '')),
     now())
  on conflict (user_id) do update
     set lat          = excluded.lat,
         lng          = excluded.lng,
         label        = excluded.label,
         country      = excluded.country,
         country_code = excluded.country_code,
         updated_at   = now()
  returning * into v_row;

  return jsonb_build_object(
    'saved', true,
    'lat', v_row.lat,
    'lng', v_row.lng,
    'label', v_row.label,
    'country', v_row.country,
    'country_code', v_row.country_code,
    'is_visible', v_row.is_visible
  );
end;
$$;

revoke all on function public.troll_set_location(double precision, double precision, text, text, text) from public, anon;
grant execute on function public.troll_set_location(double precision, double precision, text, text, text) to authenticated;

-- Leaderboard of where trolls are from, for the Top Cities panel. Runs as
-- definer over visible rows only, so it can aggregate without leaking who.
create or replace function public.troll_top_locations(p_limit integer default 10)
returns table (label text, country text, country_code text, trolls bigint, lat double precision, lng double precision)
language sql
security definer
set search_path = public
as $$
  select l.label,
         max(l.country)      as country,
         max(l.country_code) as country_code,
         count(*)            as trolls,
         avg(l.lat)          as lat,
         avg(l.lng)          as lng
    from troll_locations l
   where l.is_visible
   group by lower(l.label), l.label
   order by count(*) desc, l.label asc
   limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;

grant execute on function public.troll_top_locations(integer) to anon, authenticated;
