import { useMemo, useState } from 'react';
import type { FitResult } from '../engine/types';
import { formatAngle, formatLat, formatYear } from './format';

type SortKey = 'error' | 'brightness' | 'span' | 'epoch';

interface Props {
  results: FitResult[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

export function ResultsTable({ results, selectedKey, onSelect }: Props) {
  const [sort, setSort] = useState<SortKey>('error');
  const sorted = useMemo(() => {
    const rows = results.map((r, i) => ({ r, rank: i + 1 }));
    const by: Record<SortKey, (a: FitResult, b: FitResult) => number> = {
      error: (a, b) => a.errorRate - b.errorRate,
      brightness: (a, b) => a.meanMag - b.meanMag,
      span: (a, b) => b.spanDeg - a.spanDeg,
      epoch: (a, b) => b.bestYear - a.bestYear,
    };
    return rows.sort((a, b) => by[sort](a.r, b.r));
  }, [results, sort]);

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
            <th>{header('brightness', 'Mag')}</th>
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
              <td>{r.meanMag.toFixed(2)}</td>
            </tr>
            <tr>
              <td className="members" colSpan={6}>
                {r.members.map((m) => (m.kind === 'moving' ? `[${m.name}]` : m.name.replace(/ \(.*\)$/, ''))).join(', ')}
              </td>
            </tr>
          </tbody>
        ))}
      </table>
    </div>
  );
}
