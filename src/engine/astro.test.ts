import { describe, expect, it } from 'vitest';
import { bodiesReaching, eclipticLatitudeOfDate } from './bodies';
import { StarField } from './catalog';
import { loadTestCatalog } from './testCatalog';
import { precessionFrame } from './precession';
import { allAboveAtSomeTime, horizonOrientation, latitudeBand, raDecOfDate } from './visibility';
import { fromRaDec } from './vec';

const stars = loadTestCatalog();
const field = new StarField(stars);
const byName = (name: string) => stars.findIndex((s) => s.proper === name);

describe('precession', () => {
  it('obliquity at J2000 is 23.439 deg', () => {
    expect(precessionFrame(2000).obliquityDeg).toBeCloseTo(23.4393, 3);
  });

  it('obliquity stays within its known 22.0-24.6 deg range over 50,000 years', () => {
    for (let y = -48000; y <= 3000; y += 1000) {
      const eps = precessionFrame(y).obliquityDeg;
      expect(eps).toBeGreaterThan(21.9);
      expect(eps).toBeLessThan(24.7);
    }
  });

  it('Polaris is near the pole now', () => {
    const i = byName('Polaris');
    expect(raDecOfDate(field.position(i, 2100), 2100).decDeg).toBeGreaterThan(89.4);
  });

  it('Thuban was the pole star around 2800 BCE', () => {
    const i = byName('Thuban');
    expect(raDecOfDate(field.position(i, -2800), -2800).decDeg).toBeGreaterThan(89.5);
  });

  it('Vega was within about 6 deg of the pole around 12,000 BCE', () => {
    const i = byName('Vega');
    expect(raDecOfDate(field.position(i, -11800), -11800).decDeg).toBeGreaterThan(84);
  });
});

describe('star propagation', () => {
  it('Arcturus moves about 2.28 arcsec/yr', () => {
    const i = byName('Arcturus');
    const a = field.position(i, 2000);
    const b = field.position(i, 3000);
    const arcsec = (Math.acos(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) * 180 * 3600) / Math.PI;
    expect(arcsec / 1000).toBeCloseTo(2.28, 1);
  });
});

describe('ecliptic corridors', () => {
  it('Regulus sits about 0.46 deg from the ecliptic', () => {
    const i = byName('Regulus');
    expect(eclipticLatitudeOfDate(field.position(i, 2000), 2000)).toBeCloseTo(0.46, 1);
  });

  it('the Moon can reach Regulus but Jupiter can reach it only with tolerance', () => {
    const v = fromRaDec(0, 66.5);
    expect(bodiesReaching(v, 2000, ['sun', 'moon', 'jupiter'], 0.5)).toEqual([]);
    const regulus = field.position(byName('Regulus'), 2000);
    expect(bodiesReaching(regulus, 2000, ['sun', 'moon', 'jupiter'], 0)).toEqual(['moon', 'jupiter']);
  });
});

describe('visibility', () => {
  it('a near-pole star is never visible far south', () => {
    expect(allAboveAtSomeTime([{ raDeg: 0, decDeg: 85 }], -20, 10)).toBe(false);
    expect(allAboveAtSomeTime([{ raDeg: 0, decDeg: 85 }], 40, 10)).toBe(true);
  });

  it('latitude band of a dec 0 star with 10 deg altitude cutoff spans -80..80', () => {
    const band = latitudeBand([fromRaDec(90, 0)], 2000, 10);
    expect(band?.minLat).toBeCloseTo(-80, 0);
    expect(band?.maxLat).toBeCloseTo(80, 0);
  });

  it('two stars 180 deg apart in RA on the equator are never both up', () => {
    expect(latitudeBand([fromRaDec(0, 0), fromRaDec(180, 0)], 2000, 10)).toBeNull();
  });

  it('tilt at culmination of a south-of-zenith figure equals its north-up rotation', () => {
    const center = fromRaDec(90, 0);
    const north: [number, number, number] = [0, 0, 1];
    const o = horizonOrientation(center, north, 2000, 40);
    expect(o.kind).toBe('rises-and-sets');
    const culm = o.phases.find((p) => p.label === 'culmination')!;
    expect(culm.tiltDeg).toBeCloseTo(0, 0);
    const rise = o.phases.find((p) => p.label === 'rise')!;
    const set = o.phases.find((p) => p.label === 'set')!;
    expect(rise.tiltDeg).toBeCloseTo(-set.tiltDeg, 0);
  });
});
