import type { CatalogJson } from '../engine/catalog';
import { epochGrid, MAX_REFINED_CANDIDATES, mergeCandidates, rankResults } from '../engine/matcher';
import type { Candidate, FitResult, Point, SearchOptions } from '../engine/types';
import type { WorkerRequest, WorkerResponse } from '../worker/matchWorker';

export interface SearchProgress {
  phase: 'discovery' | 'refine';
  done: number;
  total: number;
}

function createWorker(): Worker {
  return new Worker(new URL('../worker/matchWorker.ts', import.meta.url), { type: 'module' });
}

/** Sends one job to a worker and resolves with its final message, forwarding discovery progress. */
function job<T>(
  w: Worker,
  msg: WorkerRequest,
  pick: (r: WorkerResponse) => T | undefined,
  onProgress?: () => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const r = e.data;
      if (r.type === 'progress') onProgress?.();
      else if (r.type === 'error') reject(new Error(r.message));
      else {
        const v = pick(r);
        if (v !== undefined) resolve(v);
      }
    };
    w.onerror = (e) => reject(new Error(e.message || 'Worker failed.'));
    w.postMessage(msg);
  });
}

/** Runs discovery epochs and then refinement across a pool of workers. */
export function runSearch(
  catalog: CatalogJson,
  points: Point[],
  options: SearchOptions,
  onProgress: (p: SearchProgress) => void,
): { promise: Promise<FitResult[]>; cancel: () => void } {
  const years = epochGrid(options.startYear, options.endYear, options.discoveryStepYears);
  const poolSize = Math.max(1, Math.min((navigator.hardwareConcurrency || 4) - 1, 8));
  const workers = Array.from({ length: poolSize }, createWorker);
  let rejectCancel: ((e: Error) => void) | null = null;
  const cancelled = new Promise<never>((_, reject) => {
    rejectCancel = reject;
  });
  const terminate = () => workers.forEach((w) => w.terminate());
  const cancel = () => {
    terminate();
    rejectCancel?.(new Error('Search cancelled.'));
  };

  const run = async () => {
    workers.forEach((w) => w.postMessage({ type: 'init', catalog } satisfies WorkerRequest));
    let done = 0;
    onProgress({ phase: 'discovery', done, total: years.length });
    const lists = await Promise.all(
      workers.map((w, k) =>
        job(
          w,
          { type: 'discover', points, options, years: years.filter((_, i) => i % poolSize === k) },
          (r) => (r.type === 'discovered' ? r.candidates : undefined),
          () => onProgress({ phase: 'discovery', done: ++done, total: years.length }),
        ),
      ),
    );
    const candidates = mergeCandidates(lists).slice(0, MAX_REFINED_CANDIDATES);
    let refined = 0;
    onProgress({ phase: 'refine', done: 0, total: poolSize });
    const parts = await Promise.all(
      workers.map((w, k) =>
        job(
          w,
          { type: 'refine', points, options, candidates: candidates.filter((_: Candidate, i) => i % poolSize === k) },
          (r) => (r.type === 'results' ? r.results : undefined),
        ).then((res) => {
          onProgress({ phase: 'refine', done: ++refined, total: poolSize });
          return res;
        }),
      ),
    );
    return rankResults(parts.flat(), options.maxResults);
  };

  const promise = Promise.race([run(), cancelled]).finally(terminate);
  return { promise, cancel };
}
