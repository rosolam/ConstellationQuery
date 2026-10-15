import { useMemo, useState } from 'react';
import type { FitResult } from '../engine/types';
import { formatAngle, formatLat, formatYear } from './format';

type SortKey = 'error' | 'brightness' | 'span' | 'epoch' | 'standout';

/** Standard constellation figures all stand out at 62% or more; most chance matches stay below 30%. */
export function standoutClass(standout: number): string {
  return standout >= 0.6 ? 'standout-high' : standout >= 0.3 ? 'standout-mid' : 'standout-low';
}

function brightCounts(r: FitResult, brightMag: number): { bright: number; stars: number } {
  const stars = r.members.filter((m) => m.kind === 'star');
  return { bright: stars.filter((m) => m.mag <= brightMag).length, stars: stars.length };
}

function brightShare(r: FitResult, brightMag: number): number {
  const { bright, stars } = brightCounts(r, brightMag);
  return stars ? bright / stars : 0;
}

interface Props {
  results: FitResult[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  brightMag: number;
}

export function ResultsTable({ results, selectedKey, onSelect, brightMag }: Props) {
  const [sort, setSort] = useState<SortKey>('error');
  const sorted = useMemo(() => {
    const rows = results.map((r, i) => ({ r, rank: i + 1 }));
    const by: Record<SortKey, (a: FitResult, b: FitResult) => number> = {
      error: (a, b) => a.errorRate - b.errorRate,
      brightness: (a, b) => brightShare(b, brightMag) - brightShare(a, brightMag) || a.faintestMag - b.faintestMag,
      span: (a, b) => b.spanDeg - a.spanDeg,
      epoch: (a, b) => b.bestYear - a.bestYear,
      standout: (a, b) => b.clutter.standout - a.clutter.standout || a.clutter.intruders - b.clutter.intruders,
    };
    return rows.sort((a, b) => by[sort](a.r, b.r));
  }, [results, sort, brightMag]);

  if (results.length === 0) return null;
  const header = (key: SortKey, label: string) => (
    <button className={`sort${sort === key ? ' active' : ''}`} onClick={() => setSort(key)}>
      {label}
    </button>
  );

  return (
    <div className="results-wrap">
      <table className="results">
        <thead>
          <tr>
            <th>#</th>
            <th>{header('error', 'Error')}</th>
            <th>{header('span', 'Span')}</th>
            <th>Rotation</th>
            <th>{header('epoch', 'Best epoch')}</th>
            <th>Visible from</th>
            <th title={`Stars of magnitude ${brightMag.toFixed(1)} or brighter, out of all stars in the fit`}>
              {header('brightness', 'Bright')}
            </th>
            <th title="Share of the light in the figure's area that comes from its own stars. Standard constellations score 62% or more.">
              {header('standout', 'Stand-out')}
            </th>
          </tr>
        </thead>
        {sorted.map(({ r, rank }) => (
          <tbody
            key={r.key}
            className={r.key === selectedKey ? 'selected' : ''}
            onClick={() => onSelect(r.key)}
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onSelect(r.key)}
          >
            <tr className="main">
              <td rowSpan={2}>{rank}</td>
              <td>{(r.errorRate * 100).toFixed(2)}%</td>
              <td>{r.spanDeg.toFixed(1)}°</td>
              <td>{formatAngle(r.rotationDeg)}</td>
              <td>
                {formatYear(r.bestYear)}
                {r.uncertain && (
                  <span className="warn" title="Some members lack distance or radial velocity, so positions this far from 2000 CE are less certain.">
                    {' '}⚠
                  </span>
                )}
              </td>
              <td>
                {formatLat(r.latitudeBand.minLat)} – {formatLat(r.latitudeBand.maxLat)}
              </td>
              <td title={`Mean magnitude ${r.meanMag.toFixed(2)}, faintest ${r.faintestMag.toFixed(2)}`}>
                {(() => {
                  const { bright, stars } = brightCounts(r, brightMag);
                  return (
                    <span className={bright === stars ? 'all-bright' : ''}>
                      {bright}/{stars}
                    </span>
                  );
                })()}
              </td>
              <td
                title={`${r.clutter.intruders} competing star${r.clutter.intruders === 1 ? '' : 's'} inside the figure's area`}
                className={standoutClass(r.clutter.standout)}
              >
                {Math.round(r.clutter.standout * 100)}%
                {r.clutter.intruders > 0 && <span className="sub"> ·{r.clutter.intruders}</span>}
              </td>
            </tr>
            <tr>
              <td className="members" colSpan={7}>
                {r.members.map((m, i) => (
                  <span key={m.pointIndex}>
                    {i > 0 && ', '}
                    {m.kind === 'moving' ? (
                      <span className="member-moving">[{m.name}]</span>
                    ) : (
                      <span className={m.mag <= brightMag ? 'member-bright' : ''} title={`mag ${m.mag.toFixed(2)}`}>
                        {m.name.replace(/ \(.*\)$/, '')}
                      </span>
                    )}
                  </span>
                ))}
              </td>
            </tr>
          </tbody>
        ))}
      </table>
    </div>
  );
}
