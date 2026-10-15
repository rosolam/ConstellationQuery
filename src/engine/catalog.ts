import { DEG, type Vec3 } from './vec';

export interface Star {
  id: number;
  proper: string;
  designation: string;
  raDeg: number;
  decDeg: number;
  mag: number;
  /** Proper motion in RA (already multiplied by cos dec), mas/yr. */
  pmra: number;
  pmdec: number;
  /** Distance in parsecs, 0 when unknown. */
  distPc: number;
  /** Radial velocity km/s, null when unknown. */
  rv: number | null;
}

export interface CatalogJson {
  source: string;
  license: string;
  magLimit: number;
  fields: string[];
  stars: [number, string, string, number, number, number, number, number, number, number | null][];
}

export function parseCatalog(json: CatalogJson): Star[] {
  return json.stars.map(([id, proper, designation, raDeg, decDeg, mag, pmra, pmdec, distPc, rv]) => ({
    id,
    proper,
    designation,
    raDeg,
    decDeg,
    mag,
    pmra,
    pmdec,
    distPc,
    rv,
  }));
}

export function starLabel(s: Star): string {
  return s.proper ? `${s.proper} (${s.designation})` : s.designation;
}

/** Position far from J2000 is less certain when parallax or radial velocity is missing. */
export function isUncertain(s: Star): boolean {
  return s.distPc <= 0 || s.rv === null;
}

const MAS2RAD = DEG / 3.6e6;
const KMS_TO_PC_PER_YR = 1.0227121650537077e-6;

/**
 * Precomputed linear-motion model: direction(t) = normalize(u + w * t), t in years from J2000.
 * Uses 3D space motion (proper motion, parallax, radial velocity) so perspective effects are included
 * for stars with known distance and radial velocity.
 */
export class StarField {
  readonly stars: Star[];
  readonly count: number;
  private readonly u: Float64Array;
  private readonly w: Float64Array;

  constructor(stars: Star[]) {
    this.stars = stars;
    this.count = stars.length;
    this.u = new Float64Array(stars.length * 3);
    this.w = new Float64Array(stars.length * 3);
    stars.forEach((s, i) => {
      const ra = s.raDeg * DEG;
      const dec = s.decDeg * DEG;
      const ca = Math.cos(ra);
      const sa = Math.sin(ra);
      const cd = Math.cos(dec);
      const sd = Math.sin(dec);
      const u: Vec3 = [cd * ca, cd * sa, sd];
      const p: Vec3 = [-sa, ca, 0];
      const q: Vec3 = [-sd * ca, -sd * sa, cd];
      const mua = s.pmra * MAS2RAD;
      const mud = s.pmdec * MAS2RAD;
      const radial = s.distPc > 0 && s.rv !== null ? (s.rv * KMS_TO_PC_PER_YR) / s.distPc : 0;
      for (let k = 0; k < 3; k++) {
        this.u[i * 3 + k] = u[k];
        this.w[i * 3 + k] = mua * p[k] + mud * q[k] + radial * u[k];
      }
    });
  }

  /** Unit vector (J2000 frame) of star i at astronomical year. */
  position(i: number, year: number): Vec3 {
    const t = year - 2000;
    const x = this.u[i * 3] + this.w[i * 3] * t;
    const y = this.u[i * 3 + 1] + this.w[i * 3 + 1] * t;
    const z = this.u[i * 3 + 2] + this.w[i * 3 + 2] * t;
    const n = Math.hypot(x, y, z);
    return [x / n, y / n, z / n];
  }

  /** Packed unit vectors of all stars at a year. */
  positions(year: number, out = new Float64Array(this.count * 3)): Float64Array {
    const t = year - 2000;
    for (let i = 0; i < this.count; i++) {
      const x = this.u[i * 3] + this.w[i * 3] * t;
      const y = this.u[i * 3 + 1] + this.w[i * 3 + 1] * t;
      const z = this.u[i * 3 + 2] + this.w[i * 3 + 2] * t;
      const n = Math.hypot(x, y, z);
      out[i * 3] = x / n;
      out[i * 3 + 1] = y / n;
      out[i * 3 + 2] = z / n;
    }
    return out;
  }
}
