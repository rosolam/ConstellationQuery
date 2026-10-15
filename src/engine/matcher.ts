import { BODY_BY_ID, type BodyId, bodiesReaching } from './bodies';
import { isUncertain, type StarField, starLabel } from './catalog';
import { fitSimilarity } from './fit';
import { precessionFrame } from './precession';
import {
  type BodyRange,
  type Candidate,
  type FitResult,
  MAX_SPAN_CEILING_DEG,
  type MemberResult,
  type Point,
  type SearchOptions,
} from './types';
import { DEG } from './vec';
import { latitudeBand } from './visibility';

/** Discovery accepts a point when a star lies within this multiple of the error threshold (as a span fraction). */
const CANDIDATE_TOLERANCE_FACTOR = 2.5;
/** Discovery keeps fits up to this multiple of the threshold; refinement over epochs applies the real threshold. */
const DISCOVERY_SLACK = 1.5;
/** Prune a partial match once its deviation from the anchor-based prediction exceeds this multiple of the bound. */
const RMS_PRUNE_FACTOR = 2;
const MAX_CANDIDATES_PER_EPOCH = 150;
export const MAX_REFINED_CANDIDATES = 300;
/** Uncertain catalog motion matters once the epoch is this far from J2000. */
const UNCERTAIN_AFTER_YEARS = 5000;

export function validatePattern(points: Point[], options: SearchOptions): string | null {
  const moving = options.movingBodies.length > 0 ? options.maxMovingPoints : 0;
  if (points.length < 3) return 'At least three points are needed.';
  if (points.length - moving < 3) return 'At least three points must land on stars; reduce the moving-body allowance.';
  if (points.length > 40) return 'At most 40 points are supported.';
  return null;
}

export function epochGrid(start: number, end: number, step: number): number[] {
  const years: number[] = [];
  const s = Math.min(start, end);
  const e = Math.max(start, end);
  for (let y = s; y < e; y += Math.max(1, step)) years.push(y);
  years.push(e);
  return years;
}

export function starSubset(field: StarField, magLimit: number): Int32Array {
  const idx: number[] = [];
  field.stars.forEach((s, i) => {
    if (s.mag <= magLimit) idx.push(i);
  });
  return Int32Array.from(idx);
}

interface AnchorPlan {
  a: number;
  b: number;
  /** pattern span divided by |AB| */
  spanRatio: number;
  /** Non-anchor points in check order, with complex ratio (P_k - P_a) / (P_b - P_a). */
  checks: { k: number; rr: number; ri: number }[];
}

function farthestPair(points: Point[], exclude: Set<number>): [number, number] | null {
  let best = -1;
  let pair: [number, number] | null = null;
  for (let i = 0; i < points.length; i++) {
    if (exclude.has(i)) continue;
    for (let j = i + 1; j < points.length; j++) {
      if (exclude.has(j)) continue;
      const d = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
      if (d > best) {
        best = d;
        pair = [i, j];
      }
    }
  }
  return pair;
}

function patternSpan(points: Point[]): number {
  const p = farthestPair(points, new Set());
  return p ? Math.hypot(points[p[0]].x - points[p[1]].x, points[p[0]].y - points[p[1]].y) : 0;
}

function anchorPlans(points: Point[], maxMoving: number): AnchorPlan[] {
  const span = patternSpan(points);
  const pairs: [number, number][] = [];
  const first = farthestPair(points, new Set());
  if (!first) return [];
  pairs.push(first);
  if (maxMoving >= 1) {
    for (const ex of [[first[0]], [first[1]], ...(maxMoving >= 2 ? [[first[0], first[1]]] : [])]) {
      const p = farthestPair(points, new Set(ex));
      if (p && !pairs.some((q) => q[0] === p[0] && q[1] === p[1])) pairs.push(p);
    }
  }
  return pairs.map(([a, b]) => {
    const dx = points[b].x - points[a].x;
    const dy = points[b].y - points[a].y;
    const d2 = dx * dx + dy * dy;
    const checks = points
      .map((p, k) => {
        const px = p.x - points[a].x;
        const py = p.y - points[a].y;
        // (px + i py) / (dx + i dy)
        return { k, rr: (px * dx + py * dy) / d2, ri: (py * dx - px * dy) / d2 };
      })
      .filter((c) => c.k !== a && c.k !== b)
      .sort((u, v) => Math.abs(v.ri) - Math.abs(u.ri));
    return { a, b, spanRatio: span / Math.sqrt(d2), checks };
  });
}

const GRID_CELLS = [0.0175, 0.025, 0.035, 0.05, 0.07, 0.1, 0.14];

interface GridBuffers {
  start: Int32Array;
  fill: Int32Array;
  keys: Int32Array;
  items: Int32Array;
}

/** Grid arrays are large (millions of cells) and reused across epochs to avoid allocation churn. */
const gridBufferCache = new Map<number, GridBuffers>();

function gridBuffers(cell: number, cells: number, count: number): GridBuffers {
  let buf = gridBufferCache.get(cell);
  if (!buf || buf.keys.length < count) {
    buf = {
      start: new Int32Array(cells + 1),
      fill: new Int32Array(cells),
      keys: new Int32Array(count),
      items: new Int32Array(count),
    };
    gridBufferCache.set(cell, buf);
  }
  return buf;
}

/** Uniform 3D grids over the unit sphere at several cell sizes, for nearest-star lookups. */
class SphereGrid {
  private readonly levels: { cell: number; g: number; start: Int32Array; items: Int32Array }[] = [];
  /** Squared chord distance of the last successful nearest() hit. */
  lastD2 = 0;

  constructor(
    private readonly pos: Float64Array,
    count: number,
  ) {
    for (const cell of GRID_CELLS) {
      const g = Math.ceil(2 / cell) + 1;
      const cells = g * g * g;
      const buf = gridBuffers(cell, cells, count);
      const { start, fill, keys, items } = buf;
      start.fill(0);
      for (let i = 0; i < count; i++) {
        const key = this.key(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], cell, g);
        keys[i] = key;
        start[key + 1]++;
      }
      for (let c = 0; c < cells; c++) start[c + 1] += start[c];
      fill.set(start.subarray(0, cells));
      for (let i = 0; i < count; i++) items[fill[keys[i]]++] = i;
      this.levels.push({ cell, g, start, items });
    }
  }

  private key(x: number, y: number, z: number, cell: number, g: number): number {
    const ix = Math.min(g - 1, Math.max(0, Math.floor((x + 1) / cell)));
    const iy = Math.min(g - 1, Math.max(0, Math.floor((y + 1) / cell)));
    const iz = Math.min(g - 1, Math.max(0, Math.floor((z + 1) / cell)));
    return ix + g * (iy + g * iz);
  }

  /** Nearest item within tolChord that is not in used[0..usedCount), or -1. */
  nearest(x: number, y: number, z: number, tolChord: number, used: Int32Array, usedCount: number): number {
    let level = this.levels[this.levels.length - 1];
    for (const l of this.levels) {
      if (l.cell >= tolChord) {
        level = l;
        break;
      }
    }
    const { cell, g, start, items } = level;
    const inv = 1 / cell;
    const x0 = Math.max(0, Math.floor((x - tolChord + 1) * inv));
    const x1 = Math.min(g - 1, Math.floor((x + tolChord + 1) * inv));
    const y0 = Math.max(0, Math.floor((y - tolChord + 1) * inv));
    const y1 = Math.min(g - 1, Math.floor((y + tolChord + 1) * inv));
    const z0 = Math.max(0, Math.floor((z - tolChord + 1) * inv));
    const z1 = Math.min(g - 1, Math.floor((z + tolChord + 1) * inv));
    let best = tolChord * tolChord;
    let found = -1;
    const pos = this.pos;
    for (let iz = z0; iz <= z1; iz++) {
      for (let iy = y0; iy <= y1; iy++) {
        const row = g * (iy + g * iz);
        for (let ix = x0; ix <= x1; ix++) {
          const c = row + ix;
          for (let p = start[c]; p < start[c + 1]; p++) {
            const it = items[p];
            const dx = pos[it * 3] - x;
            const dy = pos[it * 3 + 1] - y;
            const dz = pos[it * 3 + 2] - z;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < best) {
              let taken = false;
              for (let u = 0; u < usedCount; u++) {
                if (used[u] === it) {
                  taken = true;
                  break;
                }
              }
              if (!taken) {
                best = d2;
                found = it;
              }
            }
          }
        }
      }
    }
    this.lastD2 = best;
    return found;
  }
}

/** Find candidate assignments of pattern points to stars (and optionally moving bodies) at one epoch. */
export function discoverAtEpoch(
  field: StarField,
  subset: Int32Array,
  points: Point[],
  options: SearchOptions,
  year: number,
): Candidate[] {
  const m = subset.length;
  const all = field.positions(year);
  const pos = new Float64Array(m * 3);
  for (let i = 0; i < m; i++) {
    const s = subset[i];
    pos[i * 3] = all[s * 3];
    pos[i * 3 + 1] = all[s * 3 + 1];
    pos[i * 3 + 2] = all[s * 3 + 2];
  }
  const grid = new SphereGrid(pos, m);
  const maxSpan = Math.min(options.maxSpanDeg, MAX_SPAN_CEILING_DEG) * DEG;
  const minSpan = Math.max(0.1, options.minSpanDeg) * DEG;
  const threshold = options.errorThresholdPct / 100;
  const candFrac = threshold * CANDIDATE_TOLERANCE_FACTOR;
  const maxMoving = options.movingBodies.length > 0 ? Math.min(2, options.maxMovingPoints) : 0;
  const maxEnvelope = Math.max(0, ...options.movingBodies.map((b) => BODY_BY_ID[b].maxLatitudeDeg));
  const pole = precessionFrame(year).eclipticPole;
  const plans = anchorPlans(points, maxMoving);
  const n = points.length;

  const found = new Map<string, Candidate>();
  const used = new Int32Array(n);
  const assignment = new Int32Array(n);
  // Branch and bound: once enough candidates exist, only better ones are worth finding.
  let bound = threshold * DISCOVERY_SLACK;
  const prune = () => {
    const kept = [...found.entries()].sort((u, v) => u[1].errorRate - v[1].errorRate).slice(0, MAX_CANDIDATES_PER_EPOCH);
    found.clear();
    for (const [k, c] of kept) found.set(k, c);
    if (kept.length >= MAX_CANDIDATES_PER_EPOCH) bound = Math.min(bound, kept[kept.length - 1][1].errorRate);
  };

  for (const plan of plans) {
    const cosLo = Math.cos(maxSpan / plan.spanRatio);
    const cosHi = Math.cos(minSpan / plan.spanRatio);
    for (let i = 0; i < m; i++) {
      const x1 = pos[i * 3];
      const y1 = pos[i * 3 + 1];
      const z1 = pos[i * 3 + 2];
      for (let j = 0; j < m; j++) {
        if (j === i) continue;
        const x2 = pos[j * 3];
        const y2 = pos[j * 3 + 1];
        const z2 = pos[j * 3 + 2];
        const d = x1 * x2 + y1 * y2 + z1 * z2;
        if (d < cosLo || d > cosHi) continue;
        let mx = x1 + x2;
        let my = y1 + y2;
        let mz = z1 + z2;
        const mlen = Math.sqrt(mx * mx + my * my + mz * mz);
        let ex = x2 - x1;
        let ey = y2 - y1;
        let ez = z2 - z1;
        const elen = Math.sqrt(ex * ex + ey * ey + ez * ez);
        mx /= mlen;
        my /= mlen;
        mz /= mlen;
        ex /= elen;
        ey /= elen;
        ez /= elen;
        // e2 = e1 x m keeps the chart handedness (x west, y north as seen from the ground).
        const fx = ey * mz - ez * my;
        const fy = ez * mx - ex * mz;
        const fz = ex * my - ey * mx;
        const h = elen / mlen;
        const spanRad = 2 * Math.atan(h) * plan.spanRatio;
        const tolRad = Math.min(candFrac, CANDIDATE_TOLERANCE_FACTOR * bound) * spanRad;
        const tolChord = 2 * Math.sin(tolRad / 2);
        const tolDeg = (threshold * spanRad) / DEG;
        const rmsLimit = RMS_PRUNE_FACTOR * bound * spanRad;
        const sumLimit = rmsLimit * rmsLimit * n;
        let sumD2 = 0;

        used[0] = i;
        used[1] = j;
        let usedCount = 2;
        assignment.fill(-2);
        assignment[plan.a] = i;
        assignment[plan.b] = j;
        let misses = 0;
        let ok = true;
        for (const c of plan.checks) {
          const px = -h + 2 * h * c.rr;
          const py = 2 * h * c.ri;
          let qx = mx + px * ex + py * fx;
          let qy = my + px * ey + py * fy;
          let qz = mz + px * ez + py * fz;
          const ql = Math.sqrt(qx * qx + qy * qy + qz * qz);
          qx /= ql;
          qy /= ql;
          qz /= ql;
          const hit = grid.nearest(qx, qy, qz, tolChord, used, usedCount);
          if (hit >= 0) {
            sumD2 += grid.lastD2;
            if (sumD2 > sumLimit) {
              ok = false;
              break;
            }
            used[usedCount++] = hit;
            assignment[c.k] = hit;
            continue;
          }
          if (misses < maxMoving) {
            const beta = Math.abs(Math.asin(qx * pole[0] + qy * pole[1] + qz * pole[2])) / DEG;
            if (beta <= maxEnvelope + tolDeg) {
              misses++;
              assignment[c.k] = -1;
              continue;
            }
          }
          ok = false;
          break;
        }
        if (!ok) continue;

        const starAssignment = Array.from(assignment, (a) => (a >= 0 ? subset[a] : -1));
        const key = starAssignment.join(',');
        if (found.has(key)) continue;
        const targets = starAssignment.map((s) => (s >= 0 ? field.position(s, year) : null));
        const fit = fitSimilarity(points, targets, year);
        if (fit.errorRate > bound) continue;
        if (fit.spanDeg > options.maxSpanDeg * 1.05 || fit.spanDeg < options.minSpanDeg * 0.95) continue;
        found.set(key, { year, assignment: starAssignment, errorRate: fit.errorRate });
        if (found.size >= 2 * MAX_CANDIDATES_PER_EPOCH) prune();
      }
    }
  }
  prune();
  return [...found.values()];
}

export function mergeCandidates(lists: Candidate[][]): Candidate[] {
  const best = new Map<string, Candidate>();
  for (const list of lists) {
    for (const c of list) {
      const key = c.assignment.join(',');
      const prev = best.get(key);
      if (!prev || c.errorRate < prev.errorRate) best.set(key, c);
    }
  }
  return [...best.values()].sort((u, v) => u.errorRate - v.errorRate);
}

function toRanges(years: number[], flags: boolean[]): [number, number][] {
  const out: [number, number][] = [];
  let startIdx = -1;
  for (let i = 0; i <= years.length; i++) {
    const on = i < years.length && flags[i];
    if (on && startIdx < 0) startIdx = i;
    if (!on && startIdx >= 0) {
      out.push([years[startIdx], years[i - 1]]);
      startIdx = -1;
    }
  }
  return out;
}

/** Evaluate candidates over a fine epoch grid and build final, ranked results. */
export function refineCandidates(
  field: StarField,
  points: Point[],
  options: SearchOptions,
  candidates: Candidate[],
): FitResult[] {
  const threshold = options.errorThresholdPct / 100;
  const years = epochGrid(options.startYear, options.endYear, options.refineStepYears);
  const results: FitResult[] = [];

  for (const cand of candidates.slice(0, MAX_REFINED_CANDIDATES)) {
    const movingIdx = cand.assignment.map((s, k) => (s < 0 ? k : -1)).filter((k) => k >= 0);
    const errors: number[] = [];
    const fitOk: boolean[] = [];
    const reach: BodyId[][][] = [];
    for (const year of years) {
      const targets = cand.assignment.map((s) => (s >= 0 ? field.position(s, year) : null));
      const fit = fitSimilarity(points, targets, year);
      errors.push(fit.errorRate);
      fitOk.push(
        fit.errorRate <= threshold && fit.spanDeg <= options.maxSpanDeg && fit.spanDeg >= options.minSpanDeg,
      );
      const tolDeg = threshold * fit.spanDeg;
      reach.push(movingIdx.map((k) => bodiesReaching(fit.predicted[k], year, options.movingBodies, tolDeg)));
    }
    const allReach = years.map((_, i) => reach[i].every((r) => r.length > 0));

    let bestI = -1;
    for (let i = 0; i < years.length; i++) {
      if (fitOk[i] && allReach[i] && (bestI < 0 || errors[i] < errors[bestI])) bestI = i;
    }
    if (bestI < 0) continue;

    let lo = bestI;
    let hi = bestI;
    while (lo > 0 && fitOk[lo - 1]) lo--;
    while (hi < years.length - 1 && fitOk[hi + 1]) hi++;
    const starRange: [number, number] = [years[lo], years[hi]];
    const inRange = (i: number) => i >= lo && i <= hi;

    const bestYear = years[bestI];
    const targets = cand.assignment.map((s) => (s >= 0 ? field.position(s, bestYear) : null));
    const fit = fitSimilarity(points, targets, bestYear);
    const band = latitudeBand(fit.predicted, bestYear, options.minAltitudeDeg);
    if (!band) continue;

    const members: MemberResult[] = cand.assignment.map((s, k) => {
      if (s >= 0) {
        const star = field.stars[s];
        return {
          pointIndex: k,
          kind: 'star',
          starIndex: s,
          starId: star.id,
          name: starLabel(star),
          mag: star.mag,
          uncertain: isUncertain(star),
          residualDeg: fit.residualsDeg[k],
          predicted: fit.predicted[k],
          actual: targets[k]!,
          bodies: [],
        };
      }
      const slot = movingIdx.indexOf(k);
      const bodies: BodyRange[] = options.movingBodies
        .map((body) => ({
          body,
          ranges: toRanges(
            years,
            years.map((_, i) => inRange(i) && reach[i][slot].includes(body)),
          ),
        }))
        .filter((b) => b.ranges.length > 0);
      return {
        pointIndex: k,
        kind: 'moving',
        starIndex: -1,
        starId: -1,
        name: bodies.map((b) => BODY_BY_ID[b.body].name).join(' / '),
        mag: NaN,
        uncertain: false,
        residualDeg: 0,
        predicted: fit.predicted[k],
        actual: fit.predicted[k],
        bodies,
      };
    });

    const starMembers = members.filter((mm) => mm.kind === 'star');
    const mags = starMembers.map((mm) => mm.mag);
    const farFromJ2000 = Math.abs(bestYear - 2000) > UNCERTAIN_AFTER_YEARS;
    results.push({
      key: cand.assignment.join(','),
      bestYear,
      errorRate: fit.errorRate,
      rmsDeg: fit.rmsDeg,
      maxResidualDeg: fit.maxResidualDeg,
      spanDeg: fit.spanDeg,
      rotationDeg: fit.rotationDeg,
      unitDeg: fit.unitDeg,
      starRange,
      latitudeBand: band,
      center: fit.center,
      figureUp: fit.figureUp,
      members,
      movingRanges: movingIdx.length > 0 ? toRanges(years, years.map((_, i) => inRange(i) && allReach[i])) : [],
      meanMag: mags.reduce((a, b) => a + b, 0) / Math.max(1, mags.length),
      faintestMag: Math.max(...mags),
      uncertain: farFromJ2000 && starMembers.some((mm) => mm.uncertain),
    });
  }

  return rankResults(results, options.maxResults);
}

/** Sort by error rate, drop repeats of the same star set and near-duplicates that differ by one star. */
export function rankResults(results: FitResult[], maxResults: number): FitResult[] {
  const sorted = [...results].sort((u, v) => u.errorRate - v.errorRate);
  const kept: FitResult[] = [];
  const seen = new Set<string>();
  const starSets: Set<number>[] = [];
  for (const r of sorted) {
    const ids = r.members.filter((m) => m.kind === 'star').map((m) => m.starIndex);
    const setKey = [...ids].sort((a, b) => a - b).join(',') + `|${r.members.length - ids.length}`;
    if (seen.has(setKey)) continue;
    if (ids.length >= 5) {
      const near = starSets.some((s) => ids.filter((id) => s.has(id)).length >= ids.length - 1);
      if (near) continue;
    }
    seen.add(setKey);
    starSets.push(new Set(ids));
    kept.push(r);
    if (kept.length >= maxResults) break;
  }
  return kept;
}

/** Single-threaded search; the app splits discovery epochs across workers instead. */
export function search(
  field: StarField,
  points: Point[],
  options: SearchOptions,
  onProgress?: (done: number, total: number) => void,
): FitResult[] {
  const subset = starSubset(field, options.magLimit);
  const years = epochGrid(options.startYear, options.endYear, options.discoveryStepYears);
  const lists: Candidate[][] = [];
  years.forEach((year, i) => {
    lists.push(discoverAtEpoch(field, subset, points, options, year));
    onProgress?.(i + 1, years.length);
  });
  return refineCandidates(field, points, options, mergeCandidates(lists));
}
