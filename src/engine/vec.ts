export type Vec3 = [number, number, number];

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function norm(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function normalize(a: Vec3): Vec3 {
  const n = norm(a) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

/** Angle between two unit vectors, radians, accurate at small separations. */
export function angleBetween(a: Vec3, b: Vec3): number {
  return Math.atan2(norm(cross(a, b)), dot(a, b));
}

export function fromRaDec(raDeg: number, decDeg: number): Vec3 {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  const c = Math.cos(dec);
  return [c * Math.cos(ra), c * Math.sin(ra), Math.sin(dec)];
}

export function toRaDec(v: Vec3): { raDeg: number; decDeg: number } {
  const ra = Math.atan2(v[1], v[0]) * RAD;
  return { raDeg: (ra + 360) % 360, decDeg: Math.asin(Math.max(-1, Math.min(1, v[2] / (norm(v) || 1)))) * RAD };
}

export type Mat3 = [Vec3, Vec3, Vec3];

export function mulMatVec(m: Mat3, v: Vec3): Vec3 {
  return [dot(m[0], v), dot(m[1], v), dot(m[2], v)];
}

export function wrap360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export function wrap180(deg: number): number {
  const w = wrap360(deg);
  return w > 180 ? w - 360 : w;
}
