/// <reference lib="webworker" />
import { type CatalogJson, parseCatalog, StarField } from '../engine/catalog';
import { discoverAtEpoch, refineCandidates, starSubset } from '../engine/matcher';
import type { Candidate, FitResult, Point, SearchOptions } from '../engine/types';

export type WorkerRequest =
  | { type: 'init'; catalog: CatalogJson }
  | { type: 'discover'; points: Point[]; options: SearchOptions; years: number[] }
  | { type: 'refine'; points: Point[]; options: SearchOptions; candidates: Candidate[] };

export type WorkerResponse =
  | { type: 'progress'; year: number }
  | { type: 'discovered'; candidates: Candidate[] }
  | { type: 'results'; results: FitResult[] }
  | { type: 'error'; message: string };

declare const self: DedicatedWorkerGlobalScope;

let field: StarField | null = null;

const post = (msg: WorkerResponse) => self.postMessage(msg);

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  try {
    if (msg.type === 'init') {
      field = new StarField(parseCatalog(msg.catalog));
      return;
    }
    if (!field) throw new Error('Worker received a job before the catalog.');
    if (msg.type === 'discover') {
      const subset = starSubset(field, msg.options.magLimit);
      const candidates: Candidate[] = [];
      for (const year of msg.years) {
        candidates.push(...discoverAtEpoch(field, subset, msg.points, msg.options, year));
        post({ type: 'progress', year });
      }
      post({ type: 'discovered', candidates });
    } else if (msg.type === 'refine') {
      post({ type: 'results', results: refineCandidates(field, msg.points, msg.options, msg.candidates) });
    }
  } catch (e) {
    post({ type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};
