// Shrinks Natural Earth country polygons for web delivery: Douglas-Peucker
// simplify, round coords, drop slivers too small to see, keep only the name.
import { readFileSync, writeFileSync } from 'node:fs';

const TOLERANCE = Number(process.argv[4] ?? 0.04); // degrees
const PREC = 3;
const MIN_RING_AREA = 0.004; // deg^2, drops specks that render as noise

const round = (n) => Math.round(n * 10 ** PREC) / 10 ** PREC;

function segDist2(p, a, b) {
  let x = a[0];
  let y = a[1];
  let dx = b[0] - x;
  let dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = b[0]; y = b[1]; }
    else if (t > 0) { x += dx * t; y += dy * t; }
  }
  dx = p[0] - x;
  dy = p[1] - y;
  return dx * dx + dy * dy;
}

function simplify(points, tol) {
  if (points.length <= 3) return points;
  const tol2 = tol * tol;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxDist = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = segDist2(points[i], points[first], points[last]);
      if (d > maxDist) { maxDist = d; index = i; }
    }
    if (maxDist > tol2 && index > 0) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function signedArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return a / 2;
}

const ringArea = (ring) => Math.abs(signedArea(ring));

// Natural Earth ships mixed ring winding. three-globe triangulates polygon
// caps assuming clockwise exteriors — feeding it counter-clockwise rings
// inverts the caps and paints the ocean instead of the land. The 2D map fills
// even-odd, so it is winding-independent and follows along either way.
const EXTERIOR_POSITIVE = false;

function orient(ring, wantPositive) {
  const positive = signedArea(ring) > 0;
  return positive === wantPositive ? ring : ring.slice().reverse();
}

function cleanRing(ring, tol) {
  const rounded = ring.map(([x, y]) => [round(x), round(y)]);
  const simplified = simplify(rounded, tol);
  if (simplified.length < 4) return null;
  const first = simplified[0];
  const last = simplified[simplified.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) simplified.push(first);
  return simplified.length >= 4 ? simplified : null;
}

function cleanPolygon(poly, tol) {
  const outer = cleanRing(poly[0], tol);
  if (!outer || ringArea(outer) < MIN_RING_AREA) return null;
  // Holes get a coarser tolerance — they matter less visually than coastlines.
  const holes = poly.slice(1)
    .map((r) => cleanRing(r, tol * 2))
    .filter((r) => r && ringArea(r) >= MIN_RING_AREA);
  return [
    orient(outer, EXTERIOR_POSITIVE),
    ...holes.map((r) => orient(r, !EXTERIOR_POSITIVE)),
  ];
}

const src = JSON.parse(readFileSync(process.argv[2], 'utf8'));

const features = [];
for (const f of src.features) {
  const name = f.properties.NAME || f.properties.name || '';
  const geom = f.geometry;
  if (!geom) continue;

  const raw = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  const polys = raw.map((p) => cleanPolygon(p, TOLERANCE)).filter(Boolean);
  if (!polys.length) continue;

  features.push({
    type: 'Feature',
    properties: { name },
    geometry: polys.length === 1
      ? { type: 'Polygon', coordinates: polys[0] }
      : { type: 'MultiPolygon', coordinates: polys },
  });
}

const out = { type: 'FeatureCollection', features };
const json = JSON.stringify(out);
writeFileSync(process.argv[3], json);
const verts = features.reduce((n, f) => {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  return n + polys.reduce((m, p) => m + p.reduce((k, r) => k + r.length, 0), 0);
}, 0);
console.log(`tol=${TOLERANCE}  ${features.length} countries  ${verts} verts  ${(json.length / 1024).toFixed(0)} KB`);
