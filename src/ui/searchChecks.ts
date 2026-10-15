import { epochGrid } from '../engine/matcher';
import { DEFAULT_OPTIONS, type SearchOptions } from '../engine/types';

export interface SettingWarning {
  id: string;
  title: string;
  detail: string;
  /** A safer setting the user can apply with one click. */
  fix?: { label: string; patch: Partial<SearchOptions> };
}

const fmt = (n: number) => n.toLocaleString('en-US');
const roundUp = (v: number, step: number) => Math.ceil(v / step) * step;

/**
 * Settings that make a search slow or flood it with chance fits. Thresholds sit well above the defaults, which
 * finish in a few seconds; a full-range search at magnitude 6 took about 40 s on an 8-core desktop.
 */
export function checkSettings(options: SearchOptions, starsAt: (mag: number) => number): SettingWarning[] {
  const warnings: SettingWarning[] = [];
  const range = Math.abs(options.endYear - options.startYear);
  const epochs = epochGrid(options.startYear, options.endYear, options.discoveryStepYears).length;
  const refineEpochs = epochGrid(options.startYear, options.endYear, options.refineStepYears).length;

  if (options.magLimit > 5.5) {
    warnings.push({
      id: 'mag',
      title: `Faintest magnitude ${options.magLimit} uses ${fmt(starsAt(options.magLimit))} stars`,
      detail: `That is ${(starsAt(options.magLimit) / starsAt(DEFAULT_OPTIONS.magLimit)).toFixed(1)}× the stars at magnitude ${DEFAULT_OPTIONS.magLimit}. Search time grows faster than the star count, and most extra fits use faint stars few people would pick out.`,
      fix: { label: `Use magnitude ${DEFAULT_OPTIONS.magLimit}`, patch: { magLimit: DEFAULT_OPTIONS.magLimit } },
    });
  }
  if (epochs > 30) {
    const step = roundUp(range / 25, 500);
    warnings.push({
      id: 'epochs',
      title: `${fmt(epochs)} sky snapshots to search`,
      detail: `A ${fmt(range)}-year range at a ${fmt(options.discoveryStepYears)}-year search step. Each snapshot is a full search of the sky, so time grows in proportion.`,
      fix: { label: `Use a ${fmt(step)}-year step`, patch: { discoveryStepYears: step } },
    });
  }
  if (refineEpochs > 400) {
    const step = roundUp(range / 300, 50);
    warnings.push({
      id: 'refine',
      title: `${fmt(refineEpochs)} refinement checks per fit`,
      detail: `Every candidate fit is re-checked at each ${fmt(options.refineStepYears)}-year step across the range, multiplied by the number of results.`,
      fix: { label: `Use a ${fmt(step)}-year refine step`, patch: { refineStepYears: step } },
    });
  }
  if (options.maxResults > 300 && (options.magLimit > 5.5 || epochs > 30)) {
    warnings.push({
      id: 'results',
      title: `${fmt(options.maxResults)} results with a large search`,
      detail: 'A longer list keeps more candidates during the search, which weakens its shortcuts. Combined with the settings above this adds noticeably to the time.',
      fix: { label: 'Show 300 results', patch: { maxResults: 300 } },
    });
  }
  if (options.errorThresholdPct > 5) {
    warnings.push({
      id: 'error',
      title: `Max error ${options.errorThresholdPct}% is loose`,
      detail: 'Above about 5% the shape is only loosely matched, so chance fits multiply and the search has to consider many more candidates.',
      fix: { label: 'Use 4%', patch: { errorThresholdPct: 4 } },
    });
  }
  if (options.maxSpanDeg > 75) {
    warnings.push({
      id: 'span',
      title: `Max span ${options.maxSpanDeg}° covers most of the visible sky`,
      detail: 'Very large figures can be hard to see as one shape, and the search compares far more star pairs.',
      fix: { label: 'Use 60°', patch: { maxSpanDeg: 60 } },
    });
  }
  if (options.movingBodies.length > 0 && options.maxMovingPoints >= 2) {
    warnings.push({
      id: 'moving',
      title: 'Two points may be filled by moving bodies',
      detail: 'Leaving two points free of stars makes the shape much easier to match by chance and the search slower.',
      fix: { label: 'Allow 1 point', patch: { maxMovingPoints: 1 } },
    });
  }
  return warnings;
}
