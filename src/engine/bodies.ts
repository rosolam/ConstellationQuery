import { precessionFrame } from './precession';
import { dot, RAD, type Vec3 } from './vec';

export type BodyId = 'sun' | 'moon' | 'mercury' | 'venus' | 'mars' | 'jupiter' | 'saturn';

export interface MovingBody {
  id: BodyId;
  name: string;
  /** Largest geocentric ecliptic latitude the body reaches, degrees. */
  maxLatitudeDeg: number;
  recurrence: string;
}

export const MOVING_BODIES: MovingBody[] = [
  {
    id: 'sun',
    name: 'Sun',
    maxLatitudeDeg: 0,
    recurrence: 'Passes this point once a year, in daylight; nearby stars are only seen around heliacal rising or setting.',
  },
  {
    id: 'moon',
    name: 'Moon',
    maxLatitudeDeg: 5.3,
    recurrence:
      'Passes this ecliptic longitude every 27.3 days; reaching this latitude depends on the 18.6-year nodal cycle.',
  },
  {
    id: 'mercury',
    name: 'Mercury',
    maxLatitudeDeg: 4.9,
    recurrence: 'Passes this longitude about once a year, always close to the Sun (twilight only).',
  },
  {
    id: 'venus',
    name: 'Venus',
    maxLatitudeDeg: 8.8,
    recurrence: 'Passes this longitude about once a year; the same geometry repeats on its 8-year cycle.',
  },
  {
    id: 'mars',
    name: 'Mars',
    maxLatitudeDeg: 6.9,
    recurrence: 'Passes this longitude about every 1.9 years; the largest latitudes occur near opposition.',
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    maxLatitudeDeg: 1.7,
    recurrence: 'Passes this longitude about every 11.9 years, lingering for several weeks.',
  },
  {
    id: 'saturn',
    name: 'Saturn',
    maxLatitudeDeg: 2.8,
    recurrence: 'Passes this longitude about every 29.5 years, lingering for several months.',
  },
];

export const BODY_BY_ID: Record<BodyId, MovingBody> = Object.fromEntries(
  MOVING_BODIES.map((b) => [b.id, b]),
) as Record<BodyId, MovingBody>;

/** Ecliptic latitude of date, degrees, of a J2000-frame direction. */
export function eclipticLatitudeOfDate(v: Vec3, year: number): number {
  const pole = precessionFrame(year).eclipticPole;
  return Math.asin(Math.max(-1, Math.min(1, dot(v, pole)))) * RAD;
}

/** Bodies whose path corridor contains the direction at this epoch, widened by toleranceDeg. */
export function bodiesReaching(v: Vec3, year: number, enabled: BodyId[], toleranceDeg: number): BodyId[] {
  const beta = Math.abs(eclipticLatitudeOfDate(v, year));
  return enabled.filter((id) => beta <= BODY_BY_ID[id].maxLatitudeDeg + toleranceDeg);
}
