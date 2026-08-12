# TrollRunner Maps — project instructions

## What this is
The troll world map at maps.trollrunner.net: a 3D globe (plus a 2D Mercator
toggle) where logged-in trolls drop a pin for the city they're from. Inspired
by degods.com/map. Next.js App Router + TypeScript + Tailwind v4.

Nothing here needs a server — Next is only a bundler. `output: "export"`
emits a plain static site into `out/`, which `.github/workflows/pages.yml`
publishes to GitHub Pages on every push to main (CNAME lives in `public/` so
it survives the export). Keep it that way: no API routes, no server actions,
no `next/image` loader. Anything added must be renderable at build time.

## Hard rules
1. **Login required to drop a pin.** Anyone can look at the map; only an
   authenticated account can place one. Enforced server-side by
   `troll_set_location()`, not just by hiding the button.
2. **Visibility is the user's switch.** `troll_locations.is_visible = false`
   hides a pin from everyone else via RLS — the row never leaves the database.
   Never filter visibility only on the client.
3. **City-level precision, never finer.** The RPC rounds to 3 decimals (~1 km)
   server-side. Don't add GPS/live-location features; this is "where you're
   from", not "where you are".
4. Accounts are the SHARED TrollRunner Supabase project. `src/lib/accounts/*`
   is copied from trollrunner-fitness — keep it in sync rather than forking
   the auth logic. Location tables use the `troll_locations` prefix.
5. No API keys anywhere. Geocoding is OpenStreetMap Nominatim (debounced to
   ≤1 req/s per their usage policy) and tiles come from OpenFreeMap. Don't
   introduce a service that needs a token or a billing account.

## The map engine
MapLibre GL JS with OpenStreetMap vector tiles from OpenFreeMap. This is the
open equivalent of what degods.com/map runs (Mapbox GL + a Studio style), and
it needs no account, token, or billing.

- **Pin MapLibre to v5.** v6 ships its tile worker as a separate chunk that
  Turbopack's static export doesn't resolve; the worker silently spawns
  against `/` (the HTML document), no tiles are ever requested, and the map
  renders as a black sphere with no error. v5 inlines the worker. If the map
  goes blank after a dependency bump, check this first.
- **2D/3D is one renderer.** `setProjection({type: 'globe' | 'mercator'})`.
  Don't reintroduce a second map component for the flat view.
- **Attribution is required** by OpenFreeMap/OpenStreetMap. Restyle the
  control, never remove it.
- **The stock dark style paints water lighter than land**, which reads as a
  flat grey wash. `REPAINT` in `map-view.tsx` fixes that and lifts the label
  and border contrast. Land must stay clearly lighter than the ocean — check
  any change on a screenshot, at both world and city zoom.

## Setup
`supabase/troll_locations.sql` must be run once in the Supabase SQL editor
before pins work — until then the map loads and shows zero trolls.

## Workflow
GitHub Pages auto-deploys main via the Actions workflow. Merge each completed
chunk to main and push immediately (standing rule); verify with
`npm run build` first, and serve `out/` if you want to check the real
artifact rather than the dev server.
