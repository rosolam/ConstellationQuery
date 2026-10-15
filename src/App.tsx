import { useEffect, useMemo, useRef, useState } from 'react';
import { type CatalogJson, parseCatalog, StarField } from './engine/catalog';
import { project } from './engine/fit';
import { validatePattern } from './engine/matcher';
import { normalizePoints, sanitizeOptions } from './engine/points';
import { DEFAULT_OPTIONS, type FitResult, type Point, type SearchOptions } from './engine/types';
import { normalize, type Vec3 } from './engine/vec';
import { chartBasis } from './engine/visibility';
import { OptionsPanel } from './ui/OptionsPanel';
import { PatternInput } from './ui/PatternInput';
import { ResultDetail } from './ui/ResultDetail';
import { ResultsTable } from './ui/ResultsTable';
import { formatYear } from './ui/format';
import { checkSettings, type SettingWarning } from './ui/searchChecks';
import { runSearch, type SearchProgress, type SearchResults } from './ui/searchClient';

const EXAMPLE = ['Dubhe', 'Merak', 'Phecda', 'Megrez', 'Alioth', 'Mizar', 'Alkaid'];

function examplePattern(field: StarField): Point[] {
  const idx = EXAMPLE.map((n) => field.stars.findIndex((s) => s.proper === n)).filter((i) => i >= 0);
  const dirs = idx.map((i) => field.position(i, 2000));
  const center = normalize(dirs.reduce<Vec3>((a, d) => [a[0] + d[0], a[1] + d[1], a[2] + d[2]], [0, 0, 0]));
  const { west, north } = chartBasis(center, 2000);
  return normalizePoints(dirs.map((d) => {
    const [x, y] = project(d, center, west, north);
    return { x, y };
  }));
}

export function App() {
  const [catalog, setCatalog] = useState<{ json: CatalogJson; field: StarField } | null>(null);
  const [loadError, setLoadError] = useState('');
  const [points, setPoints] = useState<Point[]>([]);
  const [options, setOptions] = useState<SearchOptions>(DEFAULT_OPTIONS);
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [view, setView] = useState<'all' | 'bright'>('all');
  const [usedOptions, setUsedOptions] = useState<SearchOptions>(DEFAULT_OPTIONS);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [progress, setProgress] = useState<SearchProgress | null>(null);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [tab, setTab] = useState<'search' | 'results'>('search');
  const cancelRef = useRef<(() => void) | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (detailRef.current) detailRef.current.scrollTop = 0;
  }, [selectedKey]);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/stars.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`Star catalog failed to load (${r.status}).`);
        return r.json() as Promise<CatalogJson>;
      })
      .then((json) => setCatalog({ json, field: new StarField(parseCatalog(json)) }))
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  const [searchedKey, setSearchedKey] = useState('');
  const currentKey = JSON.stringify([normalizePoints(points), options]);
  const running = progress !== null;
  const results: FitResult[] | null =
    searchResults && (view === 'bright' && searchResults.bright ? searchResults.bright : searchResults.all);
  const selected = useMemo(() => results?.find((r) => r.key === selectedKey) ?? null, [results, selectedKey]);
  const showView = (v: 'all' | 'bright') => {
    setView(v);
    const list = v === 'bright' ? searchResults?.bright : searchResults?.all;
    if (list && !list.some((r) => r.key === selectedKey)) setSelectedKey(list[0]?.key ?? null);
  };

  const starsAt = (mag: number) => catalog?.field.stars.filter((s) => s.mag <= mag).length ?? 0;
  const [warnings, setWarnings] = useState<SettingWarning[] | null>(null);

  const start = () => {
    if (!catalog) return;
    const invalid = validatePattern(points, options);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError('');
    const found = checkSettings(options, starsAt);
    if (found.length > 0) {
      setWarnings(found);
      return;
    }
    run();
  };

  const applyFix = (patch: Partial<SearchOptions>) => {
    const next = sanitizeOptions({ ...options, ...patch });
    setOptions(next);
    setWarnings(checkSettings(next, starsAt));
  };

  const run = () => {
    if (!catalog) return;
    setWarnings(null);
    setSearchResults(null);
    setView('all');
    setSelectedKey(null);
    setUsedOptions(options);
    setSearchedKey(currentKey);
    const t0 = performance.now();
    setProgress({ phase: 'discovery', pass: 'all', done: 0, total: 0 });
    setTab('results');
    const job = runSearch(catalog.json, normalizePoints(points), options, setProgress);
    cancelRef.current = job.cancel;
    job.promise
      .then((r) => {
        setSearchResults(r);
        setSelectedKey(r.all[0]?.key ?? null);
      })
      .catch((e: Error) => {
        setError(e.message);
        setTab('search');
      })
      .finally(() => {
        setElapsed((performance.now() - t0) / 1000);
        setProgress(null);
        cancelRef.current = null;
      });
  };

  return (
    <div className="app">
      <header>
        <h1>Constellation Query</h1>
        <p>
          Find groupings of naked-eye stars, optionally with the Sun, Moon or planets, that match your points, across
          about 50,000 years of stellar motion and precession.
        </p>
      </header>
      {loadError && <p className="error">{loadError}</p>}
      {tab === 'search' && (
        <>
          <div className="top">
            <PatternInput points={points} setPoints={setPoints} options={options} setOptions={setOptions} />
            <OptionsPanel options={options} setOptions={setOptions} disabled={running} />
          </div>
          <section className="panel run-bar">
            <div className="run-summary">
              {!catalog ? (
                <span>Loading star catalog…</span>
              ) : points.length < 3 ? (
                <span>
                  Add at least 3 points to search, or{' '}
                  <button className="link" onClick={() => setPoints(examplePattern(catalog.field))}>
                    load the Big Dipper example
                  </button>
                  .
                </span>
              ) : (
                <span>
                  Search {points.length} points against stars to magnitude {options.magLimit}, {formatYear(options.startYear)}{' '}
                  to {formatYear(options.endYear)}
                  {options.movingBodies.length > 0 && `, with ${options.movingBodies.length} moving bod${options.movingBodies.length === 1 ? 'y' : 'ies'}`}
                  .
                </span>
              )}
              {error && <p className="error">{error}</p>}
            </div>
            {catalog && points.length >= 3 && (
              <button className="link" onClick={() => setPoints(examplePattern(catalog.field))} disabled={running}>
                Load Big Dipper example
              </button>
            )}
            {searchResults && (
              <button className="nav-button" onClick={() => setTab('results')}>
                View results ({searchResults.all.length}) →
              </button>
            )}
            <button className="primary search-button" onClick={start} disabled={!catalog || running || points.length < 3}>
              Search the sky
            </button>
          </section>
        </>
      )}

      {tab === 'results' && (
        <>
        <div className="results-nav">
          <button className="nav-button" onClick={() => setTab('search')}>
            ← Edit pattern &amp; options
          </button>
        </div>
        <div className="results-page">
          <section className="panel results-pane">
            <div className="results-head">
              {searchResults?.bright ? (
                <div className="segmented" role="tablist" aria-label="Result set">
                  <button role="tab" aria-selected={view === 'all'} className={view === 'all' ? 'active' : ''} onClick={() => showView('all')}>
                    Top fits ({searchResults.all.length})
                  </button>
                  <button
                    role="tab"
                    aria-selected={view === 'bright'}
                    className={view === 'bright' ? 'active' : ''}
                    onClick={() => showView('bright')}
                  >
                    Top bright fits ({searchResults.bright.length})
                  </button>
                </div>
              ) : (
                <h2>Best fits</h2>
              )}
              {searchResults && <span className="hint">{elapsed.toFixed(1)} s</span>}
              <span className="hint legend-bright">
                <span className="member-bright">Bold</span>: magnitude {usedOptions.brightMag.toFixed(1)} or brighter
              </span>
            </div>
            {view === 'bright' && searchResults?.bright && (
              <p className="hint">
                Every star in these fits is magnitude {usedOptions.brightMag.toFixed(1)} or brighter, ranked by error.
              </p>
            )}
            {results && searchedKey !== currentKey && (
              <p className="warn-box">The points or options changed since this search. Run Find fits again to update.</p>
            )}
            {results?.length === 0 && (
              <p>No fits. Try a larger error threshold, a different magnitude limit, or a different span.</p>
            )}
            {results && (
              <ResultsTable results={results} selectedKey={selectedKey} onSelect={setSelectedKey} brightMag={usedOptions.brightMag} />
            )}
          </section>
          <div className="detail-pane" ref={detailRef}>
            {selected && catalog ? (
              <ResultDetail result={selected} field={catalog.field} magLimit={usedOptions.magLimit} brightMag={usedOptions.brightMag} />
            ) : (
              <section className="panel hint">Select a fit to see its sky chart and details.</section>
            )}
          </div>
        </div>
        </>
      )}

      {warnings && (
        <div className="modal-backdrop">
          <div className="modal modal-wide" role="alertdialog" aria-modal="true" aria-labelledby="warn-title">
            <h2 id="warn-title">{warnings.length ? 'Check these settings before searching' : 'Settings look good'}</h2>
            <p>
              {warnings.length
                ? 'The defaults finish in a few seconds. These settings could make the search take much longer or fill the results with chance matches.'
                : 'All suggested changes are applied.'}
            </p>
            <ul className="warning-list">
              {warnings.map((w) => (
                <li key={w.id}>
                  <strong>{w.title}</strong>
                  <span>{w.detail}</span>
                  {w.fix && (
                    <button className="small" onClick={() => applyFix(w.fix!.patch)}>
                      {w.fix.label}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <div className="row-buttons modal-actions">
              <button onClick={() => setWarnings(null)}>Back to settings</button>
              <button className="primary" onClick={run} autoFocus>
                {warnings.length ? 'Search anyway' : 'Search the sky'}
              </button>
            </div>
          </div>
        </div>
      )}

      {progress && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true" aria-label="Search progress">
            <h2>Searching the sky</h2>
            <progress value={progress.done} max={progress.total || 1} />
            <p>
              {progress.pass === 'bright' ? 'Top bright fits — ' : 'Top fits — '}
              {progress.phase === 'discovery'
                ? `searching epochs ${progress.done} / ${progress.total}`
                : `refining epoch ranges and visibility ${progress.done} / ${progress.total}`}
            </p>
            <button onClick={() => cancelRef.current?.()}>Cancel</button>
          </div>
        </div>
      )}

      <footer>
        Star data: <a href="https://codeberg.org/astronexus/hyg">HYG database v4.4</a> (CC BY-SA 4.0). Precession:
        Vondrák, Capitaine &amp; Wallace (2011), valid ±200,000 years. Planet and Moon positions are path corridors
        (ecliptic latitude ranges), so results give eras when an alignment is possible.
      </footer>
    </div>
  );
}
