import type { GeoLabel } from "./geo";

/**
 * Label culling.
 *
 * The label set is ~7.5k entries so that zooming into somewhere actually shows
 * local towns. Handing all of them to the globe is not an option: every HTML
 * marker is a DOM node the renderer repositions on every frame, so the whole
 * set would cost far more than it shows. Instead only the labels that could
 * genuinely be on screen are materialised, capped at a budget.
 */

const MAX_LABELS = 320;
const DEG = Math.PI / 180;

/**
 * Angular radius of the sphere's visible cap for a camera at `altitude`
 * globe-radii above the surface: acos(R / d) where d = R(1 + altitude).
 */
export function horizonRadiusDeg(altitude: number): number {
  const cos = 1 / (1 + Math.max(altitude, 0.001));
  return Math.acos(Math.min(1, Math.max(-1, cos))) / DEG;
}

/** Great-circle separation in degrees. */
function angularDistanceDeg(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const p1 = lat1 * DEG;
  const p2 = lat2 * DEG;
  const dl = (lng2 - lng1) * DEG;
  const cos = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl);
  return Math.acos(Math.min(1, Math.max(-1, cos))) / DEG;
}

export function visibleLabels(
  labels: GeoLabel[],
  pov: { lat: number; lng: number; altitude: number }
): GeoLabel[] {
  const radius = horizonRadiusDeg(pov.altitude) * 1.05; // a little margin
  const inView: GeoLabel[] = [];
  for (const label of labels) {
    // Each label declares the altitude it is allowed to appear at, which is
    // what keeps the planet from turning into a wall of text when zoomed out.
    if (pov.altitude > label.zoom) continue;
    if (angularDistanceDeg(pov.lat, pov.lng, label.lat, label.lng) > radius) continue;
    inView.push(label);
  }
  // Over budget, keep the most significant ones (higher zoom = shows earlier).
  if (inView.length > MAX_LABELS) {
    inView.sort((a, b) => b.zoom - a.zoom);
    inView.length = MAX_LABELS;
  }
  return inView;
}

/**
 * Identity for a camera position, coarse enough that ordinary drifting does
 * not rebuild the DOM but fine enough that the label set stays correct.
 */
export function viewKey(pov: { lat: number; lng: number; altitude: number }): string {
  const radius = horizonRadiusDeg(pov.altitude);
  const cell = Math.max(radius / 3, 0.5);
  return [
    Math.round(Math.log2(Math.max(pov.altitude, 0.01)) * 4),
    Math.round(pov.lat / cell),
    Math.round(pov.lng / cell),
  ].join("|");
}
