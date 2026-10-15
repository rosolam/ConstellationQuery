import { useMemo } from 'react';
import { BODY_BY_ID } from '../engine/bodies';
import { convexHull } from '../engine/clutter';
import type { StarField } from '../engine/catalog';
import { precessionFrame } from '../engine/precession';
import type { FitResult } from '../engine/types';
import { cross, DEG, dot, normalize, type Vec3 } from '../engine/vec';
import { chartBasis } from '../engine/visibility';

const SIZE = 640;
const C = SIZE / 2;

interface Props {
  result: FitResult;
  field: StarField;
  magLimit: number;
}

export function SkyChart({ result, field, magLimit }: Props) {
  const year = result.bestYear;
  const chart = useMemo(() => {
    const { west, north } = chartBasis(result.center, year);
    const radiusDeg = Math.min(80, result.spanDeg * 0.7 + 6);
    const scale = C / Math.tan(radiusDeg * DEG);
    const minDot = Math.cos(Math.min(85, radiusDeg * 1.5) * DEG);
    const toSvg = (v: Vec3): [number, number] | null => {
      const d = dot(v, result.center);
      if (d <= minDot) return null;
      return [C + (dot(v, west) / d) * scale, C - (dot(v, north) / d) * scale];
    };
    const memberIdx = new Set(result.members.filter((m) => m.kind === 'star').map((m) => m.starIndex));
    const stars: { x: number; y: number; r: number; member: boolean; i: number }[] = [];
    for (let i = 0; i < field.count; i++) {
      const s = field.stars[i];
      if (s.mag > Math.max(magLimit, 6.5) && !memberIdx.has(i)) continue;
      const p = toSvg(field.position(i, year));
      if (!p || p[0] < -10 || p[0] > SIZE + 10 || p[1] < -10 || p[1] > SIZE + 10) continue;
      stars.push({ x: p[0], y: p[1], r: Math.max(0.7, 4.2 - 0.62 * s.mag), member: memberIdx.has(i), i });
    }
    const frame = precessionFrame(year);
    const circle = (pole: Vec3, latDeg: number): string => {
      const e1 = normalize(cross(pole, [0.3, 0.5, 0.8]));
      const e2 = cross(pole, e1);
      const cb = Math.cos(latDeg * DEG);
      const sb = Math.sin(latDeg * DEG);
      let d = '';
      let pen = false;
      for (let k = 0; k <= 720; k++) {
        const l = (k / 2) * DEG;
        const v: Vec3 = [
          cb * (Math.cos(l) * e1[0] + Math.sin(l) * e2[0]) + sb * pole[0],
          cb * (Math.cos(l) * e1[1] + Math.sin(l) * e2[1]) + sb * pole[1],
          cb * (Math.cos(l) * e1[2] + Math.sin(l) * e2[2]) + sb * pole[2],
        ];
        const p = toSvg(v);
        if (!p) {
          pen = false;
          continue;
        }
        d += `${pen ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`;
        pen = true;
      }
      return d;
    };
    const movingBodies = [...new Set(result.members.flatMap((m) => m.bodies.map((b) => b.body)))];
    const corridors = movingBodies
      .map((b) => BODY_BY_ID[b])
      .filter((b) => b.maxLatitudeDeg > 0)
      .map((b) => ({ name: b.name, up: circle(frame.eclipticPole, b.maxLatitudeDeg), down: circle(frame.eclipticPole, -b.maxLatitudeDeg) }));
    const hull = convexHull(
      result.members.filter((m) => m.kind === 'star').flatMap((m) => {
        const p = toSvg(m.actual);
        return p ? [p] : [];
      }),
    );
    const intruders = result.clutter.intruderIdx.flatMap((i) => {
      const p = toSvg(field.position(i, year));
      return p ? [{ i, x: p[0], y: p[1] }] : [];
    });
    return {
      toSvg,
      stars,
      outline: hull.length >= 3 ? `M${hull.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L')}Z` : '',
      intruders,
      ecliptic: movingBodies.length ? circle(frame.eclipticPole, 0) : '',
      equator: circle(frame.equatorPole, 0),
      corridors,
    };
  }, [result, field, year, magLimit]);

  return (
    <svg className="sky" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Sky chart of the selected fit">
      <defs>
        <clipPath id="sky-clip">
          <rect width={SIZE} height={SIZE} />
        </clipPath>
      </defs>
      <rect width={SIZE} height={SIZE} className="sky-bg" />
      <g clipPath="url(#sky-clip)">
        <path d={chart.equator} className="equator" />
        {chart.corridors.map((c) => (
          <g key={c.name}>
            <path d={c.up} className="corridor" />
            <path d={c.down} className="corridor" />
          </g>
        ))}
        {chart.ecliptic && <path d={chart.ecliptic} className="ecliptic" />}
        {chart.outline && <path d={chart.outline} className="figure-outline" />}
        {chart.intruders.map((s) => (
          <rect key={s.i} x={s.x - 7} y={s.y - 7} width={14} height={14} className="intruder" transform={`rotate(45 ${s.x} ${s.y})`} />
        ))}
        {chart.stars.map((s) => (
          <circle key={s.i} cx={s.x} cy={s.y} r={s.r} className={s.member ? 'star member' : 'star'} />
        ))}
        {result.members.map((m) => {
          const p = chart.toSvg(m.predicted);
          const a = chart.toSvg(m.actual);
          if (!p) return null;
          return (
            <g key={m.pointIndex}>
              {a && m.kind === 'star' && <line x1={p[0]} y1={p[1]} x2={a[0]} y2={a[1]} className="residual" />}
              {m.kind === 'star' && a && <circle cx={a[0]} cy={a[1]} r={9} className="member-ring" />}
              <circle cx={p[0]} cy={p[1]} r={5} className={m.kind === 'moving' ? 'dot moving' : 'dot'} />
              <text x={p[0] + 10} y={p[1] - 8} className="dot-label">
                {m.pointIndex + 1}
                {m.kind === 'moving' ? ` ${m.name}` : ''}
              </text>
            </g>
          );
        })}
      </g>
      <g className="compass" transform={`translate(${SIZE - 60}, 60)`}>
        <line x1={0} y1={0} x2={0} y2={-35} />
        <line x1={0} y1={0} x2={-35} y2={0} />
        <text x={-5} y={-40}>N</text>
        <text x={-50} y={5}>E</text>
      </g>
      <text x={12} y={SIZE - 30} className="legend">
        North of date up, east left (as seen from the ground). Blue line: celestial equator.
      </text>
      <text x={12} y={SIZE - 12} className="legend">
        Red: your points. Ring: matched star.{chart.intruders.length ? ' Orange diamond: competing star.' : ''}
        {chart.ecliptic ? ' Gold: ecliptic. Dashed: moving-body corridors.' : ''}
      </text>
    </svg>
  );
}
