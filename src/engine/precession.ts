// Long-term precession: Vondrák, Capitaine & Wallace (2011), A&A 534, A22, valid for ±200,000 years.
// All vectors are expressed in the J2000.0 mean equator and equinox frame.
import { cross, type Mat3, normalize, type Vec3, RAD, angleBetween } from './vec';

const AS2R = Math.PI / (180 * 3600);
const EPS0 = 84381.406 * AS2R;

const PQPOL: [number, number][] = [
  [5851.607687, -1600.8863],
  [-0.1189, 1.1689818],
  [-0.00028913, -0.0000002],
  [0.000000101, -0.000000437],
];

const PQPER: [number, number, number, number, number][] = [
  [708.15, -5486.751211, -684.66156, 667.66673, -5523.863691],
  [2309.0, -17.127623, 2446.28388, -2354.886252, -549.74745],
  [1620.0, -617.517403, 399.671049, -428.152441, -310.998056],
  [492.2, 413.44294, -356.652376, 376.202861, 421.535876],
  [1183.0, 78.614193, -186.387003, 184.778874, -36.776172],
  [622.0, -180.732815, -316.80007, 335.321713, -145.278396],
  [882.0, -87.676083, 198.296071, -185.138669, -34.74445],
  [547.0, 46.140315, 101.135679, -120.97283, 22.885731],
];

const XYPOL: [number, number][] = [
  [5453.282155, -73750.93035],
  [0.4252841, -0.7675452],
  [-0.00037173, -0.00018725],
  [-0.000000152, 0.000000231],
];

const XYPER: [number, number, number, number, number][] = [
  [256.75, -819.940624, 75004.344875, 81491.287984, 1558.515853],
  [708.15, -8444.676815, 624.033993, 787.163481, 7774.939698],
  [274.2, 2600.009459, 1251.136893, 1251.296102, -2219.534038],
  [241.45, 2755.17563, -1102.212834, -1257.950837, -2523.969396],
  [2309.0, -167.659835, -2660.66498, -2966.79973, 247.850422],
  [492.2, 871.855056, 699.291817, 639.744522, -846.485643],
  [396.1, 44.769698, 153.16722, 131.600209, -1393.124055],
  [288.9, -512.313065, -950.865637, -445.040117, 368.526116],
  [231.1, -819.415595, 499.754645, 584.522874, 749.045012],
  [1610.0, -538.071099, -145.18821, -89.756563, 444.704518],
  [620.0, -189.793622, 558.116553, 524.42963, 235.934465],
  [157.87, -402.922932, -23.923029, -13.549067, 374.049623],
  [220.3, 179.516345, -165.405086, -210.157124, -171.33018],
  [1200.0, -9.814756, 9.344131, -44.919798, -22.899655],
];

function series(
  year: number,
  pol: [number, number][],
  per: [number, number, number, number, number][],
): [number, number] {
  const t = (year - 2000) / 100;
  let a = 0;
  let b = 0;
  const w = 2 * Math.PI * t;
  for (const [period, ca, cb, sa, sb] of per) {
    const arg = w / period;
    const s = Math.sin(arg);
    const c = Math.cos(arg);
    a += c * ca + s * sa;
    b += c * cb + s * sb;
  }
  let p = 1;
  for (const [ka, kb] of pol) {
    a += ka * p;
    b += kb * p;
    p *= t;
  }
  return [a * AS2R, b * AS2R];
}

/** Ecliptic pole of date (unit vector), year is astronomical Julian epoch. */
export function eclipticPole(year: number): Vec3 {
  const [p, q] = series(year, PQPOL, PQPER);
  const z = Math.sqrt(Math.max(1 - p * p - q * q, 0));
  const s = Math.sin(EPS0);
  const c = Math.cos(EPS0);
  return [p, -q * c - z * s, -q * s + z * c];
}

/** Mean equator pole of date (unit vector). */
export function equatorPole(year: number): Vec3 {
  const [x, y] = series(year, XYPOL, XYPER);
  const w = x * x + y * y;
  return [x, y, w < 1 ? Math.sqrt(1 - w) : 0];
}

export interface PrecessionFrame {
  year: number;
  /** Rows: equinox of date, y-axis, equator pole of date. Multiplying a J2000 vector gives coordinates of date. */
  matrix: Mat3;
  equatorPole: Vec3;
  eclipticPole: Vec3;
  equinox: Vec3;
  obliquityDeg: number;
}

const frameCache = new Map<number, PrecessionFrame>();

export function precessionFrame(year: number): PrecessionFrame {
  const cached = frameCache.get(year);
  if (cached) return cached;
  const peq = equatorPole(year);
  const pec = eclipticPole(year);
  const eqx = normalize(cross(peq, pec));
  const yAxis = cross(peq, eqx);
  const frame: PrecessionFrame = {
    year,
    matrix: [eqx, yAxis, peq],
    equatorPole: peq,
    eclipticPole: pec,
    equinox: eqx,
    obliquityDeg: angleBetween(peq, pec) * RAD,
  };
  if (frameCache.size > 5000) frameCache.clear();
  frameCache.set(year, frame);
  return frame;
}
