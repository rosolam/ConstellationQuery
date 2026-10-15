import type { Point } from './types';
import { angleBetween, dot, normalize, RAD, type Vec3, wrap360 } from './vec';
import { chartBasis } from './visibility';

export interface SimilarityFit {
  center: Vec3;
  west: Vec3;
  north: Vec3;
  /** Complex scale-rotation a = (ar, ai) and offset b = (br, bi) in the chart plane. */
  ar: number;
  ai: number;
  br: number;
  bi: number;
  /** Sky direction of every pattern point (J2000 frame). */
  predicted: Vec3[];
  /** Angular residual per pattern point, degrees; 0 for points without a target. */
  residualsDeg: number[];
  rmsDeg: number;
  maxResidualDeg: number;
  spanDeg: number;
  errorRate: number;
  rotationDeg: number;
  unitDeg: number;
  figureUp: Vec3;
}

/** Chart-plane (west, north) gnomonic coordinates of a direction around center. */
export function project(v: Vec3, center: Vec3, west: Vec3, north: Vec3): [number, number] {
  const d = dot(v, center);
  return [dot(v, west) / d, dot(v, north) / d];
}

export function unproject(x: number, y: number, center: Vec3, west: Vec3, north: Vec3): Vec3 {
  return normalize([
    center[0] + x * west[0] + y * north[0],
    center[1] + x * west[1] + y * north[1],
    center[2] + x * west[2] + y * north[2],
  ]);
}

export function maxPairwiseAngleDeg(dirs: Vec3[]): number {
  let best = 0;
  for (let i = 0; i < dirs.length; i++) {
    for (let j = i + 1; j < dirs.length; j++) best = Math.max(best, angleBetween(dirs[i], dirs[j]));
  }
  return best * RAD;
}

/**
 * Least-squares similarity (rotation, uniform scale, translation; no reflection) from pattern points to
 * sky targets in a gnomonic chart plane with west to the right and north (of date) up, i.e. the sky as seen
 * from the ground. targets[i] null means the point has no fixed target (a moving body).
 */
export function fitSimilarity(points: Point[], targets: (Vec3 | null)[], year: number): SimilarityFit {
  const fixed = targets.map((t, i) => (t ? i : -1)).filter((i) => i >= 0);
  let sum: Vec3 = [0, 0, 0];
  for (const i of fixed) {
    const t = targets[i]!;
    sum = [sum[0] + t[0], sum[1] + t[1], sum[2] + t[2]];
  }
  let center = normalize(sum);
  let fit = solve(points, targets, fixed, center, year);
  center = normalize(fit.predicted.reduce<Vec3>((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]));
  fit = solve(points, targets, fixed, center, year);
  return fit;
}

function solve(points: Point[], targets: (Vec3 | null)[], fixed: number[], center: Vec3, year: number): SimilarityFit {
  const { west, north } = chartBasis(center, year);
  const n = fixed.length;
  let zx = 0;
  let zy = 0;
  let wx = 0;
  let wy = 0;
  const w = fixed.map((i) => project(targets[i]!, center, west, north));
  fixed.forEach((i, k) => {
    zx += points[i].x;
    zy += points[i].y;
    wx += w[k][0];
    wy += w[k][1];
  });
  zx /= n;
  zy /= n;
  wx /= n;
  wy /= n;
  let num_r = 0;
  let num_i = 0;
  let den = 0;
  fixed.forEach((i, k) => {
    const px = points[i].x - zx;
    const py = points[i].y - zy;
    const qx = w[k][0] - wx;
    const qy = w[k][1] - wy;
    // conj(p) * q
    num_r += px * qx + py * qy;
    num_i += px * qy - py * qx;
    den += px * px + py * py;
  });
  const ar = den > 0 ? num_r / den : 0;
  const ai = den > 0 ? num_i / den : 0;
  const br = wx - (ar * zx - ai * zy);
  const bi = wy - (ar * zy + ai * zx);
  const predicted = points.map((p) => unproject(ar * p.x - ai * p.y + br, ar * p.y + ai * p.x + bi, center, west, north));
  const residualsDeg = points.map((_, i) => (targets[i] ? angleBetween(predicted[i], targets[i]!) * RAD : 0));
  let ss = 0;
  let maxResidualDeg = 0;
  for (const i of fixed) {
    ss += residualsDeg[i] ** 2;
    maxResidualDeg = Math.max(maxResidualDeg, residualsDeg[i]);
  }
  const rmsDeg = Math.sqrt(ss / Math.max(1, n));
  const spanDeg = maxPairwiseAngleDeg(predicted);
  const upX = -ai;
  const upY = ar;
  const upLen = Math.hypot(upX, upY) || 1;
  const figureUp = normalize([
    (upX * west[0] + upY * north[0]) / upLen,
    (upX * west[1] + upY * north[1]) / upLen,
    (upX * west[2] + upY * north[2]) / upLen,
  ]);
  return {
    center,
    west,
    north,
    ar,
    ai,
    br,
    bi,
    predicted,
    residualsDeg,
    rmsDeg,
    maxResidualDeg,
    spanDeg,
    errorRate: spanDeg > 0 ? rmsDeg / spanDeg : Infinity,
    rotationDeg: wrap360(Math.atan2(ai, ar) * RAD),
    unitDeg: Math.atan(Math.hypot(ar, ai)) * RAD,
    figureUp,
  };
}
