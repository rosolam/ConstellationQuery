import { useEffect, useMemo, useState } from 'react';
import { BODY_BY_ID, eclipticLatitudeOfDate } from '../engine/bodies';
import type { StarField } from '../engine/catalog';
import type { FitResult } from '../engine/types';
import { horizonOrientation, raDecOfDate } from '../engine/visibility';
import { formatAngle, formatDec, formatLat, formatRa, formatRange, formatYear, yearsAgo } from './format';
import { SkyChart } from './SkyChart';

interface Props {
  result: FitResult;
  field: StarField;
  magLimit: number;
  brightMag: number;
}

const PHASE_LABEL = {
  rise: 'Rising',
  culmination: 'Highest (culmination)',
  set: 'Setting',
  'lower culmination': 'Lowest (below the pole)',
};

export function ResultDetail({ result, field, magLimit, brightMag }: Props) {
  const band = result.latitudeBand;
  const mid = Math.round(((band.minLat + band.maxLat) / 2) * 4) / 4;
  const [lat, setLat] = useState(mid);
  useEffect(() => {
    setLat(mid);
  }, [result.key, mid]);
  const orientation = useMemo(
    () => horizonOrientation(result.center, result.figureUp, result.bestYear, lat),
    [result, lat],
  );
  const centerDate = raDecOfDate(result.center, result.bestYear);
  const moving = result.members.filter((m) => m.kind === 'moving');

  return (
    <section className="panel detail">
      <h2>Fit detail</h2>
      <div className="detail-grid">
        <SkyChart result={result} field={field} magLimit={magLimit} />
        <div className="facts">
          <dl>
            <dt>Best epoch</dt>
            <dd>
              {formatYear(result.bestYear)} ({yearsAgo(result.bestYear)})
            </dd>
            <dt>Star shape fits</dt>
            <dd>{formatRange(result.starRange)}</dd>
            {result.movingRanges.length > 0 && (
              <>
                <dt>With moving bodies</dt>
                <dd>{result.movingRanges.map(formatRange).join('; ')}</dd>
              </>
            )}
            <dt>Error rate</dt>
            <dd>
              {(result.errorRate * 100).toFixed(2)}% of span (RMS {result.rmsDeg.toFixed(2)}°, worst point{' '}
              {result.maxResidualDeg.toFixed(2)}°)
            </dd>
            <dt>Angular span</dt>
            <dd>
              {result.spanDeg.toFixed(1)}° (1.0 pattern unit ≈ {result.unitDeg.toFixed(1)}°)
            </dd>
            <dt>Rotation</dt>
            <dd>
              Turn the collection {formatAngle(result.rotationDeg)} counterclockwise to match the sky with north of date
              up.
            </dd>
            <dt>Center (of date)</dt>
            <dd>
              RA {formatRa(centerDate.raDeg)}, Dec {formatDec(centerDate.decDeg)}
            </dd>
            <dt>Visible from</dt>
            <dd>
              {formatLat(band.minLat)} to {formatLat(band.maxLat)} (every member above the altitude limit at once)
            </dd>
          </dl>
          {result.uncertain && (
            <p className="warn-box">
              Some members lack a measured distance or radial velocity. Their positions this far from 2000 CE come from
              proper motion alone and are less certain.
            </p>
          )}

          <h3>Orientation against the horizon</h3>
          <label className="field inline">
            <span>Observer latitude {formatLat(lat)}</span>
            <input
              type="range"
              min={band.minLat}
              max={band.maxLat}
              step={0.25}
              value={lat}
              onChange={(e) => setLat(Number(e.target.value))}
              aria-label="Observer latitude"
            />
          </label>
          {orientation.kind === 'never-rises' ? (
            <p>The figure's center never rises at this latitude.</p>
          ) : (
            <>
              {orientation.kind === 'circumpolar' && <p>Circumpolar here: the center never sets.</p>}
              <table className="mini">
                <thead>
                  <tr>
                    <th>Moment (center)</th>
                    <th>Altitude</th>
                    <th>Tilt from upright</th>
                  </tr>
                </thead>
                <tbody>
                  {orientation.phases.map((p) => (
                    <tr key={p.label}>
                      <td>{PHASE_LABEL[p.label]}</td>
                      <td>{p.altitudeDeg.toFixed(1)}°</td>
                      <td>
                        {Math.abs(p.tiltDeg).toFixed(1)}° {p.tiltDeg >= 0 ? 'counterclockwise' : 'clockwise'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="hint">
                Tilt is the angle of the collection's +y axis from straight up (toward the zenith), as the observer
                sees it.
              </p>
            </>
          )}
        </div>
      </div>

      <h3>Members</h3>
      <div className="members-scroll">
      <table className="mini members-table">
        <thead>
          <tr>
            <th>Point</th>
            <th>Body</th>
            <th>Mag</th>
            <th>Residual</th>
            <th>RA / Dec (of date)</th>
            <th>Ecliptic lat.</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {result.members.map((m) => {
            const rd = raDecOfDate(m.actual, result.bestYear);
            return (
              <tr key={m.pointIndex}>
                <td>{m.pointIndex + 1}</td>
                <td className={m.kind === 'star' && m.mag <= brightMag ? 'member-bright' : ''}>
                  {m.kind === 'moving' ? `Moving: ${m.name}` : m.name}
                </td>
                <td>{m.kind === 'star' ? m.mag.toFixed(2) : '—'}</td>
                <td>{m.kind === 'star' ? `${m.residualDeg.toFixed(2)}°` : 'on path'}</td>
                <td>
                  {formatRa(rd.raDeg)} {formatDec(rd.decDeg)}
                </td>
                <td>{eclipticLatitudeOfDate(m.actual, result.bestYear).toFixed(1)}°</td>
                <td>{m.uncertain ? 'Distance or radial velocity unknown' : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      {moving.length > 0 && (
        <>
          <h3>Moving bodies</h3>
          {moving.map((m) => (
            <div key={m.pointIndex} className="moving-block">
              <h4>Point {m.pointIndex + 1}</h4>
              <ul>
                {m.bodies.map((b) => (
                  <li key={b.body}>
                    <strong>{BODY_BY_ID[b.body].name}</strong>: can reach this point during{' '}
                    {b.ranges.map(formatRange).join('; ')}. {BODY_BY_ID[b.body].recurrence}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="hint">
            Ranges are eras when the point lies inside the body's path corridor (its range of ecliptic latitude),
            accounting for precession of the ecliptic and the stars' own motion. Individual dates are not listed. With
            two moving points, each body can reach its point during the era; nights when both do so together are not
            enumerated.
          </p>
        </>
      )}
    </section>
  );
}
