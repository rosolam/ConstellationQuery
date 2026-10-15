import { MOVING_BODIES, type BodyId } from './bodies';
import { DEFAULT_OPTIONS, MAX_SPAN_CEILING_DEG, type Point, type SearchOptions } from './types';

/**
 * Shift so the minimum x and y are 0 and divide by the larger of the x and y spans, so the longer side is 1.
 * Input and output both use x to the right and y up.
 */
export function normalizePoints(points: Point[]): Point[] {
  if (points.length === 0) return [];
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY) || 1;
  return points.map((p) => ({ x: round((p.x - minX) / span), y: round((p.y - minY) / span) }));
}

/** Image pixels have y down; flip to y up before normalizing. */
export function pixelsToPoints(pixels: Point[]): Point[] {
  return normalizePoints(pixels.map((p) => ({ x: p.x, y: -p.y })));
}

function round(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

export interface PatternFile {
  version: 1;
  points: [number, number][];
  options: SearchOptions;
}

export function toPatternJson(points: Point[], options: SearchOptions): string {
  const file: PatternFile = { version: 1, points: points.map((p) => [p.x, p.y]), options };
  return JSON.stringify(file, null, 2);
}

const BODY_IDS = new Set<BodyId>(MOVING_BODIES.map((b) => b.id));

/** Accepts {points: [[x,y],...] | [{x,y},...], options?}; options are merged over defaults and clamped. */
export function parsePatternJson(text: string): { points: Point[]; options: SearchOptions } {
  const data = JSON.parse(text) as { points?: unknown; options?: Partial<SearchOptions> };
  if (!Array.isArray(data.points)) throw new Error('JSON must contain a "points" array.');
  const points = data.points.map((p, i) => {
    if (Array.isArray(p) && p.length >= 2) return { x: Number(p[0]), y: Number(p[1]) };
    if (p && typeof p === 'object' && 'x' in p && 'y' in p) {
      const o = p as { x: unknown; y: unknown };
      return { x: Number(o.x), y: Number(o.y) };
    }
    throw new Error(`Point ${i + 1} must be [x, y] or {"x": .., "y": ..}.`);
  });
  if (points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new Error('Point coordinates must be numbers.');
  return { points: normalizePoints(points), options: sanitizeOptions(data.options ?? {}) };
}

export function sanitizeOptions(raw: Partial<SearchOptions>): SearchOptions {
  const o = { ...DEFAULT_OPTIONS, ...raw };
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return {
    magLimit: clamp(num(o.magLimit, DEFAULT_OPTIONS.magLimit), -1, 6.5),
    maxSpanDeg: clamp(num(o.maxSpanDeg, DEFAULT_OPTIONS.maxSpanDeg), 1, MAX_SPAN_CEILING_DEG),
    minSpanDeg: clamp(num(o.minSpanDeg, DEFAULT_OPTIONS.minSpanDeg), 0.1, MAX_SPAN_CEILING_DEG),
    minAltitudeDeg: clamp(num(o.minAltitudeDeg, DEFAULT_OPTIONS.minAltitudeDeg), 0, 60),
    errorThresholdPct: clamp(num(o.errorThresholdPct, DEFAULT_OPTIONS.errorThresholdPct), 0.1, 20),
    maxResults: Math.round(clamp(num(o.maxResults, DEFAULT_OPTIONS.maxResults), 1, 200)),
    startYear: Math.round(clamp(num(o.startYear, DEFAULT_OPTIONS.startYear), -198000, 198000)),
    endYear: Math.round(clamp(num(o.endYear, DEFAULT_OPTIONS.endYear), -198000, 198000)),
    discoveryStepYears: Math.round(clamp(num(o.discoveryStepYears, DEFAULT_OPTIONS.discoveryStepYears), 50, 50000)),
    refineStepYears: Math.round(clamp(num(o.refineStepYears, DEFAULT_OPTIONS.refineStepYears), 10, 10000)),
    movingBodies: Array.isArray(o.movingBodies) ? o.movingBodies.filter((b): b is BodyId => BODY_IDS.has(b)) : [],
    maxMovingPoints: Math.round(clamp(num(o.maxMovingPoints, DEFAULT_OPTIONS.maxMovingPoints), 0, 2)),
  };
}
