import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { StarField } from './catalog';
import { type ClutterParams, DEFAULT_CLUTTER, measureClutter } from './clutter';
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

function patternOf(indices: number[], year: number): Point[] {
  const dirs = indices.map((i) => field.position(i, year));
  const center = normalize(dirs.reduce<Vec3>((a, d) => [a[0] + d[0], a[1] + d[1], a[2] + d[2]], [0, 0, 0]));
  const { west, north } = chartBasis(center, year);
  return normalizePoints(dirs.map((d) => ({ x: project(d, center, west, north)[0], y: project(d, center, west, north)[1] })));
}

/** Run with `npm run calibrate:clutter`; writes scripts/.cache/calibration.txt. */
describe.skipIf(import.meta.env.MODE !== 'calibrate')('clutter calibration', () => {
  it('scores standard figures against rival matches of the same shape', () => {
    const cases = STANDARD_FIGURES.map((f) => {
      const idx = f.stars.map((d) => byDesig.get(d)!);
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
        maxResults: 200,
      });
      const self = new Set(idx);
      const rivals = results
        .map((r) => r.members.map((m) => m.starIndex))
        .filter((ids) => ids.filter((i) => self.has(i)).length < ids.length - 1);
      return { name: f.name, idx, rivals };
    });

    const grid: ClutterParams[] = [];
    for (const marginFrac of [0, 0.05, 0.1, 0.2, 0.3])
      for (const magSlack of [-0.5, 0, 0.5, 1])
        for (const reference of ['faintest', 'median', 'mean'] as const) grid.push({ marginFrac, magSlack, reference, backgroundMag: 5 });

    const lines: string[] = [];
    const scored = grid.map((p) => {
      let pctSum = 0;
      let standoutPctSum = 0;
      let zero = 0;
      const per: string[] = [];
      for (const c of cases) {
        const own = measureClutter(field, c.idx, 2000, p);
        const rivals = c.rivals.map((ids) => measureClutter(field, ids, 2000, p));
        const better = rivals.filter((r) => r.intruders < own.intruders).length;
        const ties = rivals.filter((r) => r.intruders === own.intruders).length;
        const pct = rivals.length ? (better + ties / 2) / rivals.length : 0;
        const sBetter = rivals.filter((r) => r.standout > own.standout).length;
        const sPct = rivals.length ? sBetter / rivals.length : 0;
        pctSum += pct;
        standoutPctSum += sPct;
        if (own.intruders === 0) zero++;
        per.push(`${c.name}: own ${own.intruders} (${(own.standout * 100).toFixed(0)}%), rivals ${rivals.length}, pct ${(pct * 100).toFixed(0)} / standout pct ${(sPct * 100).toFixed(0)}`);
      }
      return { p, meanPct: pctSum / cases.length, meanStandoutPct: standoutPctSum / cases.length, zero, per };
    });
    scored.sort((a, b) => a.meanPct - b.meanPct);
    for (const s of scored) {
      lines.push(
        `margin ${s.p.marginFrac} slack ${s.p.magSlack} ref ${s.p.reference}: intruder pct ${(s.meanPct * 100).toFixed(1)}, standout pct ${(s.meanStandoutPct * 100).toFixed(1)}, zero-intruder figures ${s.zero}/${cases.length}`,
      );
    }
    lines.push('', 'Best setting per figure:', ...scored[0].per);
    const chosen = scored.find((s) => s.p.marginFrac === DEFAULT_CLUTTER.marginFrac && s.p.magSlack === DEFAULT_CLUTTER.magSlack && s.p.reference === DEFAULT_CLUTTER.reference)!;
    lines.push('', 'Default setting per figure:', ...chosen.per);
    const rivalIntruders: number[] = [];
    const rivalStandout: number[] = [];
    for (const c of cases)
      for (const ids of c.rivals) {
        const r = measureClutter(field, ids, 2000, DEFAULT_CLUTTER);
        rivalIntruders.push(r.intruders);
        rivalStandout.push(r.standout);
      }
    rivalIntruders.sort((a, b) => a - b);
    rivalStandout.sort((a, b) => a - b);
    const q = (a: number[], f: number) => a[Math.floor(f * (a.length - 1))];
    lines.push(
      '',
      `Rival intruders (default): min ${q(rivalIntruders, 0)} p10 ${q(rivalIntruders, 0.1)} median ${q(rivalIntruders, 0.5)} p90 ${q(rivalIntruders, 0.9)}; share with 0: ${(rivalIntruders.filter((x) => x === 0).length / rivalIntruders.length * 100).toFixed(1)}%`,
      `Rival standout (default): p10 ${(q(rivalStandout, 0.1) * 100).toFixed(0)}% median ${(q(rivalStandout, 0.5) * 100).toFixed(0)}% p90 ${(q(rivalStandout, 0.9) * 100).toFixed(0)}%`,
    );
    lines.push('', 'Rival counts:', ...cases.map((c) => `${c.name}: ${c.rivals.length}`));
    mkdirSync('scripts/.cache', { recursive: true });
    writeFileSync('scripts/.cache/calibration.txt', lines.join('\n'));
    console.log(lines.slice(0, 5).join('\n'));
  }, 600_000);
});
