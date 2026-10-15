import { describe, expect, it } from 'vitest';
import { StarField } from './catalog';
import { measureClutter } from './clutter';
import { project } from './fit';
import { search } from './matcher';
import { normalizePoints } from './points';
import { designationIndex, STANDARD_FIGURES } from './standardFigures';
import { loadTestCatalog } from './testCatalog';
import { DEFAULT_OPTIONS, type Point } from './types';
import { normalize, type Vec3 } from './vec';
import { chartBasis } from './visibility';

const stars = loadTestCatalog();
const field = new StarField(stars);
const byDesig = designationIndex(stars);
const figureIdx = (name: string) => STANDARD_FIGURES.find((f) => f.name === name)!.stars.map((d) => byDesig.get(d)!);

function patternOf(indices: number[], year: number): Point[] {
  const dirs = indices.map((i) => field.position(i, year));
  const center = normalize(dirs.reduce<Vec3>((a, d) => [a[0] + d[0], a[1] + d[1], a[2] + d[2]], [0, 0, 0]));
  const { west, north } = chartBasis(center, year);
  return normalizePoints(dirs.map((d) => {
    const [x, y] = project(d, center, west, north);
    return { x, y };
  }));
}

describe('clutter', () => {
  it('resolves every standard figure star in the catalog', () => {
    for (const f of STANDARD_FIGURES) for (const d of f.stars) expect(byDesig.has(d), `${f.name}: ${d}`).toBe(true);
  });

  it('rates standard figures as standing out with few competing stars', () => {
    const scores = STANDARD_FIGURES.map((f) => ({ name: f.name, ...measureClutter(field, figureIdx(f.name), 2000) }));
    for (const s of scores) {
      expect(s.standout, s.name).toBeGreaterThanOrEqual(0.6);
      expect(s.intruders, s.name).toBeLessThanOrEqual(7);
    }
    expect(scores.filter((s) => s.intruders === 0).length).toBeGreaterThanOrEqual(22);
  });

  it('ranks real figures above same-shape matches among equally bright stars', () => {
    for (const name of ['Big Dipper', 'Crux', 'Cassiopeia', 'Leo']) {
      const idx = figureIdx(name);
      const faintest = Math.max(...idx.map((i) => stars[i].mag));
      const results = search(field, patternOf(idx, 2000), {
        ...DEFAULT_OPTIONS,
        magLimit: faintest + 0.01,
        errorThresholdPct: 4,
        minSpanDeg: 1,
        maxSpanDeg: 90,
        minAltitudeDeg: 0,
        startYear: 2000,
        endYear: 2000,
        maxResults: 60,
      });
      const own = new Set(idx);
      const real = results.find((r) => r.members.every((m) => own.has(m.starIndex)));
      expect(real, name).toBeDefined();
      const rivals = results.filter((r) => r.members.filter((m) => own.has(m.starIndex)).length < r.members.length - 1);
      expect(rivals.length, name).toBeGreaterThan(20);
      const beaten = rivals.filter((r) => r.clutter.standout < real!.clutter.standout).length;
      expect(beaten / rivals.length, name).toBeGreaterThanOrEqual(0.95);
    }
  });
});
