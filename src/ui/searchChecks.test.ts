import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS } from '../engine/types';
import { checkSettings } from './searchChecks';

const starsAt = (mag: number) => (mag >= 6 ? 5070 : mag >= 5 ? 1637 : 523);

describe('checkSettings', () => {
  it('accepts the defaults', () => {
    expect(checkSettings(DEFAULT_OPTIONS, starsAt)).toEqual([]);
  });

  it('flags a faint, long search and offers fixes that clear it', () => {
    const wide = { ...DEFAULT_OPTIONS, magLimit: 6, startYear: -48000, discoveryStepYears: 1000, refineStepYears: 50, maxResults: 1000 };
    const warnings = checkSettings(wide, starsAt);
    expect(warnings.map((w) => w.id).sort()).toEqual(['epochs', 'mag', 'refine', 'results']);
    const fixed = warnings.reduce((o, w) => ({ ...o, ...w.fix!.patch }), wide);
    expect(checkSettings(fixed, starsAt)).toEqual([]);
  });
});
