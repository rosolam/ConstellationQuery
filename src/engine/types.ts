import type { BodyId } from './bodies';
import type { LatitudeBand } from './visibility';
import type { Vec3 } from './vec';

export interface Point {
  x: number;
  y: number;
}

export interface SearchOptions {
  /** Faintest visual magnitude considered. */
  magLimit: number;
  /** Largest angular span of a fit, degrees (hard ceiling 90). */
  maxSpanDeg: number;
  /** Smallest angular span of a fit, degrees. */
  minSpanDeg: number;
  /** Every member must be at least this high at the same moment, degrees. */
  minAltitudeDeg: number;
  /** Keep fits whose RMS residual is at most this percent of the span. */
  errorThresholdPct: number;
  maxResults: number;
  /** Astronomical years (0 = 1 BCE, -1 = 2 BCE). */
  startYear: number;
  endYear: number;
  discoveryStepYears: number;
  refineStepYears: number;
  movingBodies: BodyId[];
  /** Points that may be filled by a moving body (0-2). */
  maxMovingPoints: number;
}

export const DEFAULT_OPTIONS: SearchOptions = {
  magLimit: 6.0,
  maxSpanDeg: 60,
  minSpanDeg: 10,
  minAltitudeDeg: 10,
  errorThresholdPct: 3,
  maxResults: 30,
  startYear: -13000,
  endYear: 2100,
  discoveryStepYears: 2000,
  refineStepYears: 250,
  movingBodies: [],
  maxMovingPoints: 1,
};

export const MAX_SPAN_CEILING_DEG = 90;

/** A raw assignment found during discovery: star index per point, or -1 for a moving-body point. */
export interface Candidate {
  year: number;
  assignment: number[];
  errorRate: number;
}

export interface MemberResult {
  pointIndex: number;
  kind: 'star' | 'moving';
  starIndex: number;
  starId: number;
  name: string;
  mag: number;
  uncertain: boolean;
  residualDeg: number;
  /** Where the point lands on the sky at the best epoch (J2000 frame). */
  predicted: Vec3;
  /** The star's position at the best epoch (J2000 frame); equals predicted for moving points. */
  actual: Vec3;
  bodies: BodyRange[];
}

export interface BodyRange {
  body: BodyId;
  ranges: [number, number][];
}

export interface FitResult {
  key: string;
  bestYear: number;
  errorRate: number;
  rmsDeg: number;
  maxResidualDeg: number;
  spanDeg: number;
  /** Degrees counterclockwise to turn the point collection so it matches the sky with north of date up. */
  rotationDeg: number;
  /** Angular size of one pattern unit, degrees. */
  unitDeg: number;
  starRange: [number, number];
  latitudeBand: LatitudeBand;
  center: Vec3;
  /** J2000 tangent direction of the collection's +y axis at the center. */
  figureUp: Vec3;
  members: MemberResult[];
  /** Epoch ranges where every moving point is reachable, intersected with the star-fit range. */
  movingRanges: [number, number][];
  meanMag: number;
  faintestMag: number;
  uncertain: boolean;
}
