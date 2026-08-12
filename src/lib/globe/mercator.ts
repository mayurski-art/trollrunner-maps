/**
 * Plain Web-Mercator forward projection into a world rectangle `width` wide.
 *
 * Deliberately not d3-geo: its spherical path clipping decides "inside" from
 * ring winding, so a single malformed ring (Antarctica, which closes over the
 * pole) fills the entire sphere. Projecting each vertex directly has no such
 * failure mode, and the map is a simple rectangle anyway.
 */

/** Mercator diverges at the poles; every web map crops around here. */
export const LAT_LIMIT = 85.05;

export function clampLat(lat: number): number {
  return Math.max(-LAT_LIMIT, Math.min(LAT_LIMIT, lat));
}

export function projectX(lng: number, width: number): number {
  return ((lng + 180) / 360) * width;
}

export function projectY(lat: number, width: number, height: number): number {
  const radius = width / (2 * Math.PI);
  const phi = (clampLat(lat) * Math.PI) / 180;
  return height / 2 - radius * Math.log(Math.tan(Math.PI / 4 + phi / 2));
}
