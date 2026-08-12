import { getClient } from "@/lib/accounts/client";

export type TrollPin = {
  userId: string;
  lat: number;
  lng: number;
  label: string;
  country: string | null;
  countryCode: string | null;
  username: string;
  avatarUrl: string | null;
  level: number;
  updatedAt: string;
};

export type MyLocation = {
  lat: number;
  lng: number;
  label: string;
  country: string | null;
  countryCode: string | null;
  isVisible: boolean;
};

export type TopLocation = {
  label: string;
  country: string | null;
  countryCode: string | null;
  trolls: number;
  lat: number;
  lng: number;
};

type PinRow = {
  user_id: string;
  lat: number;
  lng: number;
  label: string;
  country: string | null;
  country_code: string | null;
  username: string;
  avatar_url: string | null;
  level: number;
  updated_at: string;
};

/**
 * Every visible pin. Hidden pins are filtered out by RLS on troll_locations,
 * not here — this query cannot see them even if it asked.
 */
export async function listPins(): Promise<TrollPin[]> {
  const sb = getClient();
  const { data, error } = await sb
    .from("troll_locations_view")
    .select("user_id, lat, lng, label, country, country_code, username, avatar_url, level, updated_at")
    .order("updated_at", { ascending: false })
    .limit(5000);
  if (error) throw new Error(error.message);
  return ((data as PinRow[] | null) ?? []).map((row) => ({
    userId: row.user_id,
    lat: row.lat,
    lng: row.lng,
    label: row.label,
    country: row.country,
    countryCode: row.country_code,
    username: row.username,
    avatarUrl: row.avatar_url,
    level: row.level ?? 1,
    updatedAt: row.updated_at,
  }));
}

/** The caller's own pin, visible or not. */
export async function getMyLocation(userId: string): Promise<MyLocation | null> {
  const sb = getClient();
  const { data } = await sb
    .from("troll_locations")
    .select("lat, lng, label, country, country_code, is_visible")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    lat: data.lat,
    lng: data.lng,
    label: data.label,
    country: data.country,
    countryCode: data.country_code,
    isVisible: data.is_visible,
  };
}

export async function setMyLocation(input: {
  lat: number;
  lng: number;
  label: string;
  country?: string | null;
  countryCode?: string | null;
}): Promise<void> {
  const sb = getClient();
  const { data, error } = await sb.rpc("troll_set_location", {
    p_lat: input.lat,
    p_lng: input.lng,
    p_label: input.label,
    p_country: input.country ?? null,
    p_country_code: input.countryCode ?? null,
  });
  if (error) throw new Error(error.message);
  const result = data as { saved: boolean; reason?: string } | null;
  if (result && !result.saved) {
    throw new Error(
      result.reason === "too_fast"
        ? "You just moved your pin — give it half a minute."
        : "Could not save that pin."
    );
  }
}

export async function setMyLocationVisible(userId: string, isVisible: boolean): Promise<void> {
  const sb = getClient();
  const { error } = await sb
    .from("troll_locations")
    .update({ is_visible: isVisible })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function removeMyLocation(userId: string): Promise<void> {
  const sb = getClient();
  const { error } = await sb.from("troll_locations").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function listTopLocations(limit = 10): Promise<TopLocation[]> {
  const sb = getClient();
  const { data, error } = await sb.rpc("troll_top_locations", { p_limit: limit });
  if (error) throw new Error(error.message);
  return ((data as Array<{
    label: string;
    country: string | null;
    country_code: string | null;
    trolls: number;
    lat: number;
    lng: number;
  }> | null) ?? []).map((row) => ({
    label: row.label,
    country: row.country,
    countryCode: row.country_code,
    trolls: Number(row.trolls),
    lat: row.lat,
    lng: row.lng,
  }));
}
