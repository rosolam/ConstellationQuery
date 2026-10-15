import type { StarField } from './catalog';
import { project } from './fit';
import { dot, normalize, type Vec3 } from './vec';
import { chartBasis } from './visibility';

export interface ClutterParams {
  /** The figure's region is the members' convex hull grown by this fraction of the span. */
  marginFrac: number;
  /** A non-member intrudes when it is brighter than the reference member magnitude plus this slack. */
  magSlack: number;
  /** Which member magnitude intruders are compared against. */
  reference: 'faintest' | 'median' | 'mean';
  /** Faintest background star counted in the stand-out light share. */
  backgroundMag: number;
}

/**
 * Calibrated against 28 standard figures (npm run calibrate:clutter): with these settings 23 of them have no
 * intruders and all stand out at 62% or more, while same-shape rival matches have a median of 24 intruders and
 * a median stand-out of 9%.
 */
export const DEFAULT_CLUTTER: ClutterParams = { marginFrac: 0.1, magSlack: 0, reference: 'faintest', backgroundMag: 5 };

const MAX_LISTED_INTRUDERS = 25;

export interface Clutter {
  /** Non-member stars inside the figure's region that rival its members in brightness. */
  intruders: number;
  /** Catalog indices of the brightest intruders, at most MAX_LISTED_INTRUDERS. */
  intruderIdx: number[];
  /** Magnitude of the brightest intruder, or null when there is none. */
  brightestIntruderMag: number | null;
  /** Share of the light inside the region (stars to backgroundMag) that comes from members, 0–1. */
  standout: number;
}

type P2 = [number, number];

export function convexHull(pts: P2[]): P2[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: P2[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: P2[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function segmentDistance(q: P2, a: P2, b: P2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / len2)) : 0;
  return Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy);
}

/** Inside the hull, or within margin of its boundary. */
function inRegion(q: P2, hull: P2[], margin: number): boolean {
  if (hull.length >= 3) {
    let inside = true;
    for (let i = 0; i < hull.length; i++) {
      const a = hull[i];
      const b = hull[(i + 1) % hull.length];
      if ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]) < 0) {
        inside = false;
        break;
      }
    }
    if (inside) return true;
  }
  for (let i = 0; i < hull.length; i++) {
    if (segmentDistance(q, hull[i], hull[(i + 1) % hull.length]) <= margin) return true;
  }
  return false;
}

const flux = (mag: number) => 10 ** (-0.4 * mag);

/**
 * How much a figure's stars dominate their own patch of sky. Stars are compared in a gnomonic chart around the
 * figure's center at the given year; the catalog is sorted by magnitude, so the scan stops at the faintest star
 * that can matter.
 */
export function measureClutter(field: StarField, memberIdx: number[], year: number, params: ClutterParams = DEFAULT_CLUTTER): Clutter {
  const dirs = memberIdx.map((i) => field.position(i, year));
  const center = normalize(dirs.reduce<Vec3>((a, d) => [a[0] + d[0], a[1] + d[1], a[2] + d[2]], [0, 0, 0]));
  const { west, north } = chartBasis(center, year);
  const pts = dirs.map((d) => project(d, center, west, north));
  let span = 0;
  let reach = 0;
  for (let i = 0; i < pts.length; i++) {
    reach = Math.max(reach, Math.hypot(pts[i][0], pts[i][1]));
    for (let j = i + 1; j < pts.length; j++) span = Math.max(span, Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]));
  }
  const margin = params.marginFrac * span;
  const hull = convexHull(pts);
  const cosReach = Math.cos(Math.atan(reach + margin));

  const mags = memberIdx.map((i) => field.stars[i].mag).sort((a, b) => a - b);
  const refMag =
    params.reference === 'faintest'
      ? mags[mags.length - 1]
      : params.reference === 'median'
        ? mags[Math.floor(mags.length / 2)]
        : mags.reduce((a, b) => a + b, 0) / mags.length;
  const intruderMag = refMag + params.magSlack;
  const scanMag = Math.max(intruderMag, params.backgroundMag);

  const members = new Set(memberIdx);
  let intruders = 0;
  const intruderIdx: number[] = [];
  let brightestIntruderMag: number | null = null;
  let memberFlux = 0;
  for (const m of mags) memberFlux += flux(m);
  let otherFlux = 0;
  for (let i = 0; i < field.count; i++) {
    const star = field.stars[i];
    if (star.mag > scanMag) break;
    if (members.has(i)) continue;
    const v = field.position(i, year);
    if (dot(v, center) < cosReach) continue;
    if (!inRegion(project(v, center, west, north), hull, margin)) continue;
    if (star.mag <= params.backgroundMag) otherFlux += flux(star.mag);
    if (star.mag <= intruderMag) {
      intruders++;
      if (intruderIdx.length < MAX_LISTED_INTRUDERS) intruderIdx.push(i);
      if (brightestIntruderMag === null) brightestIntruderMag = star.mag;
    }
  }
  return { intruders, intruderIdx, brightestIntruderMag, standout: memberFlux / (memberFlux + otherFlux) };
}
