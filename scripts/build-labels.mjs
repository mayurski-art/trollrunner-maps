// Builds the globe's label layer: country names placed at their largest
// landmass centroid, plus major cities. `zoom` is the altitude below which a
// label is allowed to appear, so the globe stays readable when zoomed out.
import { readFileSync, writeFileSync } from 'node:fs';

const round = (n) => Math.round(n * 100) / 100;

function ringCentroid(ring) {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    area += cross;
    cx += (ring[j][0] + ring[i][0]) * cross;
    cy += (ring[j][1] + ring[i][1]) * cross;
  }
  area /= 2;
  if (!area) return null;
  return { lng: cx / (6 * area), lat: cy / (6 * area), area: Math.abs(area) };
}

const countriesGeo = JSON.parse(readFileSync('countries.json', 'utf8'));
const countries = [];
for (const f of countriesGeo.features) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  let best = null;
  for (const poly of polys) {
    const c = ringCentroid(poly[0]);
    if (c && (!best || c.area > best.area)) best = c;
  }
  if (!best) continue;
  countries.push({
    name: f.properties.name,
    lat: round(best.lat),
    lng: round(best.lng),
    area: best.area,
  });
}
countries.sort((a, b) => b.area - a.area);

// Biggest countries stay legible from orbit; small ones only on approach.
const countryLabels = countries.map((c, i) => ({
  name: c.name,
  lat: c.lat,
  lng: c.lng,
  kind: 'country',
  zoom: i < 25 ? 2.5 : i < 70 ? 1.2 : 0.6,
}));

const placesGeo = JSON.parse(readFileSync('places.json', 'utf8'));
const cityLabels = placesGeo.features
  .map((f) => ({
    name: f.properties.nameascii || f.properties.name,
    lat: round(f.properties.latitude),
    lng: round(f.properties.longitude),
    pop: f.properties.pop_max || 0,
    capital: f.properties.adm0cap === 1,
  }))
  .sort((a, b) => b.pop - a.pop)
  .map((c, i) => ({
    name: c.name,
    lat: c.lat,
    lng: c.lng,
    kind: 'city',
    capital: c.capital,
    zoom: i < 40 ? 1.1 : i < 120 ? 0.7 : 0.45,
  }));

const out = { labels: [...countryLabels, ...cityLabels] };
writeFileSync('labels.json', JSON.stringify(out));
console.log(`${countryLabels.length} countries + ${cityLabels.length} cities -> ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
