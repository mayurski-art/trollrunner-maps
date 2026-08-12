# Globe geometry pipeline

`public/geo/countries.json` and `public/geo/labels.json` are generated, not
hand-edited. Regenerate them only if you want different detail:

```bash
cd scripts
curl -sL -o ne50.json https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson
curl -sL -o places.json https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places_simple.geojson

node build-geo.mjs ne50.json countries.json 0.03   # tolerance in degrees
node build-labels.mjs                              # reads countries.json + places.json

cp countries.json labels.json ../public/geo/
```

Source data is Natural Earth (public domain).

## Two things to know before changing the tolerance

**Ring winding is load-bearing.** `build-geo.mjs` normalises every exterior
ring to clockwise. three-globe triangulates polygon caps assuming that
winding — counter-clockwise rings invert the caps and paint the ocean instead
of the land. The 2D map fills even-odd so it is winding-independent, but the
globe is not. If you touch `EXTERIOR_POSITIVE`, look at both views.

**Tolerance trades detail against payload.** Measured at 50m source:

| tolerance | vertices | raw    |
| --------- | -------- | ------ |
| 0.08      | 20k      | 348 KB |
| 0.05      | 28k      | 467 KB |
| 0.03      | 41k      | 692 KB |
| 0.02      | 48k      | 791 KB |

0.03 is what ships (~250 KB gzipped) — coastlines stay crisp when zoomed in
without a slow first paint.

## Labels

`labels.json` is ~7.5k entries (228 country centroids + the 10m populated
places), tiered by the camera altitude each one is allowed to appear at. The
density is the point: at the 110m places set, zooming into southern California
showed two labels.

That size is only viable because of the culling in `src/lib/globe/visible.ts`.
Every HTML marker is a DOM node the globe repositions each frame, so only the
few hundred labels that could actually be on screen are ever built. If you add
labels, don't remove that — hand the globe the whole file and it will crawl.
