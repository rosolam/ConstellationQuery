// Builds public/data/stars.json from the HYG v4.4 database (CC BY-SA 4.0).
// Usage: npm run build:catalog   (downloads the source into scripts/.cache on first run)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(root, 'scripts', '.cache');
const source = join(cacheDir, 'hyg_v44.csv.gz');
const sourceUrl = 'https://codeberg.org/astronexus/hyg/media/branch/main/data/hyg/CURRENT/hyg_v44.csv.gz';
const MAG_LIMIT = 6.5;

const GREEK = {
  Alp: 'α', Bet: 'β', Gam: 'γ', Del: 'δ', Eps: 'ε', Zet: 'ζ', Eta: 'η', The: 'θ', Iot: 'ι', Kap: 'κ', Lam: 'λ',
  Mu: 'μ', Nu: 'ν', Xi: 'ξ', Omi: 'ο', Pi: 'π', Rho: 'ρ', Sig: 'σ', Tau: 'τ', Ups: 'υ', Phi: 'φ', Chi: 'χ', Psi: 'ψ', Ome: 'ω',
};

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function designation(row) {
  const con = row.con;
  if (row.bayer) {
    const m = /^([A-Za-z]+)(-?\d*)$/.exec(row.bayer);
    const greek = m ? (GREEK[m[1]] ?? m[1]) + (m[2] ? m[2].replace('-', '') : '') : row.bayer;
    return `${greek} ${con}`;
  }
  if (row.flam) return `${row.flam} ${con}`;
  if (row.hr) return `HR ${row.hr}`;
  if (row.hip) return `HIP ${row.hip}`;
  return `HYG ${row.id}`;
}

async function main() {
  if (!existsSync(source)) {
    mkdirSync(cacheDir, { recursive: true });
    console.log(`Downloading ${sourceUrl}`);
    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    writeFileSync(source, Buffer.from(await res.arrayBuffer()));
  }
  const lines = gunzipSync(readFileSync(source)).toString('utf8').split(/\r?\n/);
  const header = parseCsvLine(lines[0]);
  const stars = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const cells = parseCsvLine(lines[i]);
    const row = Object.fromEntries(header.map((h, k) => [h, cells[k]]));
    const mag = Number(row.mag);
    if (row.id === '0' || !(mag <= MAG_LIMIT)) continue;
    const dist = Number(row.dist);
    const rv = row.rv === '' ? NaN : Number(row.rv);
    stars.push([
      Number(row.id),
      row.proper || '',
      designation(row),
      +(Number(row.ra) * 15).toFixed(6),
      +Number(row.dec).toFixed(6),
      +mag.toFixed(2),
      +Number(row.pmra).toFixed(2),
      +Number(row.pmdec).toFixed(2),
      dist > 0 && dist < 100000 ? +dist.toFixed(2) : 0,
      Number.isFinite(rv) && rv !== 0 ? +rv.toFixed(1) : null,
    ]);
  }
  stars.sort((a, b) => a[5] - b[5]);
  const out = {
    source: 'HYG database v4.4 (astronexus.com / codeberg.org/astronexus/hyg)',
    license: 'CC BY-SA 4.0',
    magLimit: MAG_LIMIT,
    fields: ['id', 'proper', 'designation', 'raDeg', 'decDeg', 'mag', 'pmraMasYr', 'pmdecMasYr', 'distPc', 'rvKmS'],
    stars,
  };
  const dest = join(root, 'public', 'data', 'stars.json');
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, JSON.stringify(out));
  console.log(`Wrote ${stars.length} stars to ${dest}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
