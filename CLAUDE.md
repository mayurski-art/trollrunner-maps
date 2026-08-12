# TrollRunner Maps — project instructions

## What this is
The troll world map at maps.trollrunner.net: a 3D globe (plus a 2D Mercator
toggle) where logged-in trolls drop a pin for the city they're from. Inspired
by degods.com/map. Next.js App Router + TypeScript + Tailwind v4, deployed on
Vercel like trollrunner-fitness.

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
5. No API keys. Geocoding is OpenStreetMap Nominatim (debounced to ≤1 req/s
   per their usage policy); the globe is local vector geometry, not map tiles.

## Graphics
The globe is deliberately vector, not a raster earth texture: crisp at every
zoom, and no shimmering. Two rules that keep it from looking cheap:
- The star field is CSS gradients, not `THREE.Points`. Single-pixel sprites
  crawl and alias under antialiasing, which reads as TV static.
- Land must stay clearly lighter than the ocean. Low contrast makes the
  planet read as a flat grey disc — check any material change on a screenshot.

`scripts/README.md` covers the geometry pipeline, including why ring winding
matters. Read it before regenerating `public/geo/*`.

## Setup
`supabase/troll_locations.sql` must be run once in the Supabase SQL editor
before pins work — until then the map loads and shows zero trolls.

## Workflow
Vercel auto-deploys main. Merge each completed chunk to main and push
immediately (standing rule); verify with `npm run build` first.
