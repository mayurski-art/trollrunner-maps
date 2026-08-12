# TrollRunner Maps

The troll world map — a 3D globe where trolls drop a pin for the city they're
from. Lives at [maps.trollrunner.net](https://maps.trollrunner.net).

- **3D globe** on real OpenStreetMap vector tiles (MapLibre GL + OpenFreeMap),
  with a 2D toggle that's a projection switch on the same map. Street-level
  detail all the way in, and no API key or billing account anywhere.
- **Drop a pin** by searching for a city. Requires a TrollRunner account — the
  same one that works on every other TrollRunner site.
- **Your pin is yours.** Hide it at any time and it disappears from the map and
  from your profile. Coordinates are stored at city precision (~1 km), never
  finer.
- **Top Cities** ranks where trolls actually come from.

## Running it

```bash
npm install
npm run dev
```

One-time backend setup: run `supabase/troll_locations.sql` in the Supabase SQL
editor. Until then the map renders with zero pins.

## Deploying

`npm run build` emits a fully static site into `out/` — there is no server
side. Pushing to `main` builds it and publishes to GitHub Pages via
`.github/workflows/pages.yml`; the custom domain comes from `public/CNAME`.

In the repo's **Settings → Pages**, set the source to **GitHub Actions**.

## Layout

| Path                  | What's there                                        |
| --------------------- | --------------------------------------------------- |
| `src/components/`     | The map and the panel UI                            |
| `src/lib/accounts/`   | Shared TrollRunner auth + cross-subdomain SSO       |
| `src/lib/locations/`  | Pin queries, Nominatim geocoding, pin marker DOM    |
| `supabase/`           | The one migration this app needs                    |

See `CLAUDE.md` for the rules that keep the map honest and good-looking.
