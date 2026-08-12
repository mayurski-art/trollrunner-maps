# TrollRunner Maps

The troll world map — a 3D globe where trolls drop a pin for the city they're
from. Lives at [maps.trollrunner.net](https://maps.trollrunner.net).

- **3D globe** built from local vector country geometry (globe.gl / three.js),
  with a 2D Mercator toggle that shares the same data and markers.
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

## Layout

| Path                     | What's there                                      |
| ------------------------ | ------------------------------------------------- |
| `src/components/`        | Globe, flat map, and the panel UI                 |
| `src/lib/accounts/`      | Shared TrollRunner auth + cross-subdomain SSO     |
| `src/lib/locations/`     | Pin queries and Nominatim geocoding               |
| `src/lib/globe/`         | Geometry loading, Mercator math, marker DOM       |
| `public/geo/`            | Generated country + label geometry                |
| `scripts/`               | The pipeline that generates `public/geo/`         |

See `CLAUDE.md` for the rules that keep the map honest and good-looking.
