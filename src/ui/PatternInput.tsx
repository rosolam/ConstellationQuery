import { useEffect, useMemo, useRef, useState } from 'react';
import { normalizePoints, parsePatternJson, pixelsToPoints, toPatternJson } from '../engine/points';
import { DEFAULT_RED_DOT_OPTIONS, extractRedDots, type RedDot, type RedDotOptions } from '../engine/redDots';
import type { Point, SearchOptions } from '../engine/types';
import { downloadText, downloadUrl, loadImageData, renderPatternPng } from './imageIO';

type Tab = 'draw' | 'image' | 'json';

interface Props {
  points: Point[];
  setPoints: (p: Point[]) => void;
  options: SearchOptions;
  setOptions: (o: SearchOptions) => void;
}

const VIEW_MIN = -0.05;
const VIEW_SIZE = 1.1;
const SVG_SIZE = 360;

export function PatternInput({ points, setPoints, options, setOptions }: Props) {
  const [tab, setTab] = useState<Tab>('draw');
  const normalized = useMemo(() => normalizePoints(points), [points]);
  const pngUrl = useMemo(() => (normalized.length ? renderPatternPng(normalized) : ''), [normalized]);

  return (
    <section className="panel">
      <h2>Point collection</h2>
      <div className="tabs" role="tablist">
        {(['draw', 'image', 'json'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t === 'draw' ? 'Draw / edit' : t === 'image' ? 'Image' : 'JSON'}
          </button>
        ))}
      </div>
      {tab === 'draw' && <DrawEditor points={points} setPoints={setPoints} />}
      {tab === 'image' && <ImageImport setPoints={setPoints} />}
      {tab === 'json' && <JsonEditor normalized={normalized} options={options} setPoints={setPoints} setOptions={setOptions} />}
      <div className="exports">
        <span>{points.length} points</span>
        <button disabled={!points.length} onClick={() => downloadText(toPatternJson(normalized, options), 'pattern.json')}>
          Download JSON
        </button>
        <button disabled={!pngUrl} onClick={() => downloadUrl(pngUrl, 'pattern.png')}>
          Download red-dot image
        </button>
        {pngUrl && <img className="thumb" src={pngUrl} alt="Red-dot image of the current points" />}
      </div>
    </section>
  );
}

function DrawEditor({ points, setPoints }: { points: Point[]; setPoints: (p: Point[]) => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const toSvg = (p: Point) => ({
    x: ((p.x - VIEW_MIN) / VIEW_SIZE) * SVG_SIZE,
    y: SVG_SIZE - ((p.y - VIEW_MIN) / VIEW_SIZE) * SVG_SIZE,
  });
  const fromEvent = (e: React.PointerEvent): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * SVG_SIZE;
    const sy = ((e.clientY - rect.top) / rect.height) * SVG_SIZE;
    return {
      x: +(VIEW_MIN + (sx / SVG_SIZE) * VIEW_SIZE).toFixed(4),
      y: +(VIEW_MIN + ((SVG_SIZE - sy) / SVG_SIZE) * VIEW_SIZE).toFixed(4),
    };
  };
  const remove = (i: number) => {
    setPoints(points.filter((_, k) => k !== i));
    setSelected(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (selected === null) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (e.key === 'Delete' || e.key === 'Backspace') remove(selected);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="draw">
      <p className="hint">Click to add a point, drag to move, select and press Delete (or right-click) to remove.</p>
      <svg
        ref={svgRef}
        className="editor"
        viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
        aria-label="Point editor"
        onPointerDown={(e) => {
          if (e.button !== 0 || e.target !== svgRef.current) return;
          setPoints([...points, fromEvent(e)]);
          setSelected(points.length);
        }}
        onPointerMove={(e) => {
          if (drag === null) return;
          const next = [...points];
          next[drag] = fromEvent(e);
          setPoints(next);
        }}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
      >
        <rect
          x={((0 - VIEW_MIN) / VIEW_SIZE) * SVG_SIZE}
          y={SVG_SIZE - ((1 - VIEW_MIN) / VIEW_SIZE) * SVG_SIZE}
          width={(1 / VIEW_SIZE) * SVG_SIZE}
          height={(1 / VIEW_SIZE) * SVG_SIZE}
          className="unit-box"
          pointerEvents="none"
        />
        {points.map((p, i) => {
          const s = toSvg(p);
          return (
            <g key={i}>
              <circle
                cx={s.x}
                cy={s.y}
                r={7}
                className={selected === i ? 'pt selected' : 'pt'}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (e.button === 2) return;
                  (e.target as Element).setPointerCapture?.(e.pointerId);
                  setDrag(i);
                  setSelected(i);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  remove(i);
                }}
              />
              <text x={s.x + 9} y={s.y - 8} className="pt-label" pointerEvents="none">
                {i + 1}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="point-table">
        <div className="row head">
          <span>#</span>
          <span>x</span>
          <span>y</span>
          <span />
        </div>
        {points.map((p, i) => (
          <div className={`row${selected === i ? ' selected' : ''}`} key={i} onClick={() => setSelected(i)}>
            <span>{i + 1}</span>
            <NumberCell value={p.x} onChange={(x) => setPoints(points.map((q, k) => (k === i ? { ...q, x } : q)))} label={`Point ${i + 1} x`} />
            <NumberCell value={p.y} onChange={(y) => setPoints(points.map((q, k) => (k === i ? { ...q, y } : q)))} label={`Point ${i + 1} y`} />
            <button className="small" onClick={() => remove(i)} aria-label={`Delete point ${i + 1}`}>
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="row-buttons">
        <button onClick={() => setPoints(normalizePoints(points))} disabled={!points.length}>
          Normalize
        </button>
        <button onClick={() => setPoints([])} disabled={!points.length}>
          Clear
        </button>
      </div>
    </div>
  );
}

function NumberCell({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      aria-label={label}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const v = Number(e.target.value);
        if (e.target.value.trim() !== '' && Number.isFinite(v)) onChange(v);
      }}
    />
  );
}

function ImageImport({ setPoints }: { setPoints: (p: Point[]) => void }) {
  const [image, setImage] = useState<{ url: string; data: ImageData } | null>(null);
  const [opts, setOpts] = useState<RedDotOptions>(DEFAULT_RED_DOT_OPTIONS);
  const [dots, setDots] = useState<RedDot[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!image) return;
    const found = extractRedDots(image.data.data, image.data.width, image.data.height, opts);
    setDots(found);
    if (found.length) setPoints(pixelsToPoints(found));
  }, [image, opts]);

  return (
    <div className="image-import">
      <p className="hint">Solid red dots become points; everything else in the image is ignored. Orientation is kept.</p>
      <input
        type="file"
        accept="image/*"
        aria-label="Image file"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            setError('');
            setImage({ url: URL.createObjectURL(file), data: await loadImageData(file) });
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          }
        }}
      />
      {error && <p className="error">{error}</p>}
      <div className="sliders">
        <label>
          Redness margin {opts.minRedness}
          <input type="range" min={30} max={220} value={opts.minRedness} onChange={(e) => setOpts({ ...opts, minRedness: +e.target.value })} />
        </label>
        <label>
          Minimum red {opts.minRed}
          <input type="range" min={60} max={255} value={opts.minRed} onChange={(e) => setOpts({ ...opts, minRed: +e.target.value })} />
        </label>
        <label>
          Minimum dot area {opts.minArea}px
          <input type="range" min={1} max={200} value={opts.minArea} onChange={(e) => setOpts({ ...opts, minArea: +e.target.value })} />
        </label>
      </div>
      {image && (
        <>
          <p>
            Found <strong>{dots.length}</strong> red dots{dots.length ? ' (applied as the point collection)' : ''}.
          </p>
          <div className="image-preview">
            <svg viewBox={`0 0 ${image.data.width} ${image.data.height}`}>
              <image href={image.url} width={image.data.width} height={image.data.height} />
              {dots.map((d, i) => (
                <g key={i}>
                  <circle cx={d.x} cy={d.y} r={Math.max(6, Math.sqrt(d.area / Math.PI) + 4)} className="detected" />
                  <text x={d.x + 10} y={d.y - 10} className="detected-label">
                    {i + 1}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </>
      )}
    </div>
  );
}

function JsonEditor({
  normalized,
  options,
  setPoints,
  setOptions,
}: {
  normalized: Point[];
  options: SearchOptions;
  setPoints: (p: Point[]) => void;
  setOptions: (o: SearchOptions) => void;
}) {
  const current = useMemo(() => toPatternJson(normalized, options), [normalized, options]);
  const [text, setText] = useState(current);
  const [error, setError] = useState('');
  useEffect(() => setText(current), [current]);
  const apply = (t: string) => {
    try {
      const parsed = parsePatternJson(t);
      setError('');
      setPoints(parsed.points);
      setOptions(parsed.options);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div className="json-editor">
      <p className="hint">Points as [x, y] with y up; options are optional and fall back to defaults.</p>
      <input
        type="file"
        accept="application/json,.json"
        aria-label="JSON file"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) apply(await file.text());
        }}
      />
      <textarea aria-label="Pattern JSON" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} rows={14} />
      {error && <p className="error">{error}</p>}
      <button onClick={() => apply(text)}>Apply JSON</button>
    </div>
  );
}
