import { describe, expect, it } from 'vitest';
import { StarField } from './catalog';
import { project } from './fit';
import { discoverAtEpoch, search, starSubset } from './matcher';
import { normalizePoints, parsePatternJson, toPatternJson } from './points';
import { loadTestCatalog } from './testCatalog';
import { DEFAULT_OPTIONS, type Point, type SearchOptions } from './types';
import { normalize, type Vec3 } from './vec';
import { chartBasis } from './visibility';

const stars = loadTestCatalog();
const field = new StarField(stars);
const DIPPER = ['Dubhe', 'Merak', 'Phecda', 'Megrez', 'Alioth', 'Mizar', 'Alkaid'];
const dipperIdx = DIPPER.map((n) => {
  const i = stars.findIndex((s) => s.proper === n);
  if (i < 0) throw new Error(`missing ${n}`);
  return i;
});

/** Chart-plane pattern of stars at a year, turned clockwise by rotationDeg (so the fit must turn it back). */
function patternOf(indices: number[], year: number, rotationDeg: number): Point[] {
  const dirs = indices.map((i) => field.position(i, year));
  const center = normalize(dirs.reduce<Vec3>((a, d) => [a[0] + d[0], a[1] + d[1], a[2] + d[2]], [0, 0, 0]));
  const { west, north } = chartBasis(center, year);
  const r = (-rotationDeg * Math.PI) / 180;
  return normalizePoints(
    dirs.map((d) => {
      const [x, y] = project(d, center, west, north);
      return { x: x * Math.cos(r) - y * Math.sin(r), y: x * Math.sin(r) + y * Math.cos(r) };
    }),
  );
}

const quick: SearchOptions = { ...DEFAULT_OPTIONS, startYear: 1000, endYear: 3000, discoveryStepYears: 1000, refineStepYears: 250 };

describe('matcher', () => {
  it('recovers the Big Dipper from a rotated pattern', () => {
    const points = patternOf(dipperIdx, 2000, 35);
    const results = search(field, points, quick);
    expect(results.length).toBeGreaterThan(0);
    const top = results[0];
    expect(new Set(top.members.map((m) => m.starIndex))).toEqual(new Set(dipperIdx));
    expect(top.errorRate).toBeLessThan(0.002);
    expect(top.rotationDeg).toBeCloseTo(35, 0);
    expect(top.spanDeg).toBeGreaterThan(20);
    expect(top.spanDeg).toBeLessThan(30);
    expect(top.latitudeBand.maxLat).toBe(90);
    expect(top.latitudeBand.minLat).toBeLessThan(-10);
    expect(top.starRange[0]).toBeLessThanOrEqual(1000);
  });

  it('rejects a mirrored pattern as the exact Big Dipper', () => {
    const points = patternOf(dipperIdx, 2000, 0).map((p) => ({ x: 1 - p.x, y: p.y }));
    const results = search(field, points, quick);
    const exact = results.find((r) => r.members.every((m) => dipperIdx.includes(m.starIndex)));
    expect(exact).toBeUndefined();
  });

  it('fills a missing point with the Moon when a star is replaced by an ecliptic position', () => {
    // Regulus, Algieba, Denebola, Zosma plus Chertan replaced: drop Chertan's star from the catalog subset.
    const names = ['Regulus', 'Algieba', 'Denebola', 'Zosma', 'Chertan'];
    const idx = names.map((n) => stars.findIndex((s) => s.proper === n));
    expect(idx.every((i) => i >= 0)).toBe(true);
    const points = patternOf([idx[0], idx[1], idx[2], idx[3], idx[0]], 2000, 0);
    // Use Regulus' position twice: the second copy must be explained by a moving body since stars are not reused.
    const results = search(field, points, { ...quick, movingBodies: ['moon'], maxMovingPoints: 1 });
    const withMoon = results.find((r) => r.members.some((m) => m.kind === 'moving'));
    expect(withMoon).toBeDefined();
    const moving = withMoon!.members.find((m) => m.kind === 'moving')!;
    expect(moving.bodies.map((b) => b.body)).toContain('moon');
    expect(withMoon!.movingRanges.length).toBeGreaterThan(0);
  });

  it('discovery at one epoch with default options finishes in a reasonable time', () => {
    const points = patternOf(dipperIdx, 2000, 10);
    const subset = starSubset(field, DEFAULT_OPTIONS.magLimit);
    const t0 = performance.now();
    const found = discoverAtEpoch(field, subset, points, DEFAULT_OPTIONS, -20000);
    const ms = performance.now() - t0;
    console.log(`discovery epoch: ${ms.toFixed(0)} ms, ${subset.length} stars, ${found.length} candidates`);
    expect(ms).toBeLessThan(20000);
  });
});

describe('pattern json', () => {
  it('round-trips points and options', () => {
    const pts = normalizePoints([
      { x: 0, y: 0 },
      { x: 2, y: 1 },
      { x: 1, y: 3 },
    ]);
    const text = toPatternJson(pts, { ...DEFAULT_OPTIONS, movingBodies: ['moon'] });
    const back = parsePatternJson(text);
    expect(back.points).toEqual(pts);
    expect(back.options.movingBodies).toEqual(['moon']);
  });

  it('normalizes so the longer side spans 1 and keeps y up', () => {
    const pts = normalizePoints([
      { x: 10, y: 10 },
      { x: 30, y: 10 },
      { x: 20, y: 0 },
    ]);
    expect(pts).toEqual([
      { x: 0, y: 0.5 },
      { x: 1, y: 0.5 },
      { x: 0.5, y: 0 },
    ]);
  });
});
