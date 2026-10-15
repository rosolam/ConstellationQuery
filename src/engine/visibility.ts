import { precessionFrame } from './precession';
import { cross, DEG, dot, mulMatVec, normalize, RAD, type Vec3, wrap180 } from './vec';

export interface LatitudeBand {
  minLat: number;
  maxLat: number;
}

/** Equatorial coordinates of date (degrees) for a J2000-frame direction. */
export function raDecOfDate(v: Vec3, year: number): { raDeg: number; decDeg: number } {
  const d = mulMatVec(precessionFrame(year).matrix, v);
  const ra = Math.atan2(d[1], d[0]) * RAD;
  return { raDeg: (ra + 360) % 360, decDeg: Math.asin(Math.max(-1, Math.min(1, d[2]))) * RAD };
}

/** Whether, at this latitude, some moment has every direction at or above minAltDeg. */
export function allAboveAtSomeTime(
  coords: { raDeg: number; decDeg: number }[],
  latDeg: number,
  minAltDeg: number,
): boolean {
  const sinPhi = Math.sin(latDeg * DEG);
  const cosPhi = Math.cos(latDeg * DEG);
  const sinH0 = Math.sin(minAltDeg * DEG);
  const arcs: { start: number; width: number }[] = [];
  for (const { raDeg, decDeg } of coords) {
    const sd = Math.sin(decDeg * DEG);
    const cd = Math.cos(decDeg * DEG);
    const denom = cosPhi * cd;
    if (Math.abs(denom) < 1e-12) {
      if (sinPhi * sd < sinH0) return false;
      continue;
    }
    const k = (sinH0 - sinPhi * sd) / denom;
    if (k > 1) return false;
    if (k <= -1) continue;
    const h = Math.acos(k) * RAD;
    arcs.push({ start: raDeg - h, width: 2 * h });
  }
  if (arcs.length === 0) return true;
  return arcs.some((candidate) =>
    arcs.every((arc) => {
      const offset = (((candidate.start - arc.start) % 360) + 360) % 360;
      return offset <= arc.width + 1e-9;
    }),
  );
}

export function latitudeBand(
  directions: Vec3[],
  year: number,
  minAltDeg: number,
  stepDeg = 0.25,
): LatitudeBand | null {
  const coords = directions.map((v) => raDecOfDate(v, year));
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (let lat = -90; lat <= 90 + 1e-9; lat += stepDeg) {
    if (allAboveAtSomeTime(coords, lat, minAltDeg)) {
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
  }
  return Number.isFinite(minLat) ? { minLat, maxLat } : null;
}

/** West and north unit tangent vectors at a direction, using the equator pole of date. */
export function chartBasis(center: Vec3, year: number): { west: Vec3; north: Vec3 } {
  const pole = precessionFrame(year).equatorPole;
  let east = cross(pole, center);
  if (Math.hypot(...east) < 1e-9) east = cross([1, 0, 0], center);
  east = normalize(east);
  const north = cross(center, east);
  return { west: [-east[0], -east[1], -east[2]], north };
}

export interface HorizonPhase {
  label: 'rise' | 'culmination' | 'set' | 'lower culmination';
  hourAngleDeg: number;
  altitudeDeg: number;
  /** Counterclockwise angle of the figure's +y axis from straight up (toward zenith), as seen by the observer. */
  tiltDeg: number;
}

export interface HorizonOrientation {
  latitudeDeg: number;
  kind: 'rises-and-sets' | 'circumpolar' | 'never-rises';
  phases: HorizonPhase[];
}

function zenithJ2000(latDeg: number, lstDeg: number, year: number): Vec3 {
  const m = precessionFrame(year).matrix;
  const phi = latDeg * DEG;
  const lst = lstDeg * DEG;
  const zd: Vec3 = [Math.cos(phi) * Math.cos(lst), Math.cos(phi) * Math.sin(lst), Math.sin(phi)];
  return [
    m[0][0] * zd[0] + m[1][0] * zd[1] + m[2][0] * zd[2],
    m[0][1] * zd[0] + m[1][1] * zd[1] + m[2][1] * zd[2],
    m[0][2] * zd[0] + m[1][2] * zd[1] + m[2][2] * zd[2],
  ];
}

/**
 * Orientation of the figure against the horizon at rise, culmination and set of its center.
 * figureUp is the J2000 tangent direction of the point collection's +y axis at the center.
 */
export function horizonOrientation(center: Vec3, figureUp: Vec3, year: number, latDeg: number): HorizonOrientation {
  const { raDeg, decDeg } = raDecOfDate(center, year);
  const { west, north } = chartBasis(center, year);
  const upAngle = Math.atan2(dot(figureUp, north), dot(figureUp, west)) * RAD;
  const phi = latDeg * DEG;
  const dec = decDeg * DEG;

  const phase = (label: HorizonPhase['label'], hourAngleDeg: number): HorizonPhase => {
    const zenith = zenithJ2000(latDeg, raDeg + hourAngleDeg, year);
    const zenithAngle = Math.atan2(dot(zenith, north), dot(zenith, west)) * RAD;
    const alt =
      Math.asin(
        Math.max(-1, Math.min(1, Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(hourAngleDeg * DEG))),
      ) * RAD;
    return { label, hourAngleDeg, altitudeDeg: alt, tiltDeg: wrap180(upAngle - zenithAngle) };
  };

  const denom = Math.cos(phi) * Math.cos(dec);
  const k = Math.abs(denom) < 1e-12 ? (Math.sin(phi) * Math.sin(dec) >= 0 ? -2 : 2) : (-Math.sin(phi) * Math.sin(dec)) / denom;
  if (k >= 1) return { latitudeDeg: latDeg, kind: 'never-rises', phases: [] };
  if (k <= -1) {
    return {
      latitudeDeg: latDeg,
      kind: 'circumpolar',
      phases: [phase('culmination', 0), phase('lower culmination', 180)],
    };
  }
  const h0 = Math.acos(k) * RAD;
  return {
    latitudeDeg: latDeg,
    kind: 'rises-and-sets',
    phases: [phase('rise', -h0), phase('culmination', 0), phase('set', h0)],
  };
}
