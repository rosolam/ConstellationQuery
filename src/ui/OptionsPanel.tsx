import { MOVING_BODIES, type BodyId } from '../engine/bodies';
import { sanitizeOptions } from '../engine/points';
import { DEFAULT_OPTIONS, MAX_SPAN_CEILING_DEG, type SearchOptions } from '../engine/types';
import { formatYear } from './format';

interface Props {
  options: SearchOptions;
  setOptions: (o: SearchOptions) => void;
  disabled: boolean;
}

export function OptionsPanel({ options, setOptions, disabled }: Props) {
  const set = (patch: Partial<SearchOptions>) => setOptions(sanitizeOptions({ ...options, ...patch }));
  const num = (key: keyof SearchOptions, label: string, step: number, min: number, max: number, note?: string) => (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={options[key] as number}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.value === '') return;
          set({ [key]: Number(e.target.value) } as Partial<SearchOptions>);
        }}
      />
      {note && <small>{note}</small>}
    </label>
  );
  const toggleBody = (id: BodyId) =>
    set({
      movingBodies: options.movingBodies.includes(id)
        ? options.movingBodies.filter((b) => b !== id)
        : [...options.movingBodies, id],
    });

  return (
    <section className="panel">
      <h2>Search options</h2>
      <div className="options-grid">
        {num('magLimit', 'Faintest magnitude', 0.1, -1, 6.5, 'Naked-eye limit is about 6; fainter limits make chance fits easier.')}
        {num('errorThresholdPct', 'Max error (% of span)', 0.1, 0.1, 20)}
        {num('maxSpanDeg', 'Max span (°)', 1, 1, MAX_SPAN_CEILING_DEG, `Viewable field, ceiling ${MAX_SPAN_CEILING_DEG}°`)}
        {num('minSpanDeg', 'Min span (°)', 0.5, 0.1, MAX_SPAN_CEILING_DEG, '10° ≈ a fist at arm’s length')}
        {num('minAltitudeDeg', 'Min altitude (°)', 1, 0, 60, 'All members must be this high at once')}
        {num('maxResults', 'Results to show', 1, 1, 200)}
        {num('startYear', 'From year', 500, -198000, 198000, formatYear(options.startYear))}
        {num('endYear', 'To year', 500, -198000, 198000, formatYear(options.endYear))}
        {num('discoveryStepYears', 'Search step (years)', 500, 50, 50000, 'Coarse grid for finding shapes')}
        {num('refineStepYears', 'Refine step (years)', 50, 10, 10000, 'Fine grid for epoch ranges')}
      </div>
      <fieldset className="bodies" disabled={disabled}>
        <legend>Sun, Moon and planets may fill a point</legend>
        <div className="body-list">
          {MOVING_BODIES.map((b) => (
            <label key={b.id} className="check">
              <input type="checkbox" checked={options.movingBodies.includes(b.id)} onChange={() => toggleBody(b.id)} />
              {b.name}
            </label>
          ))}
        </div>
        <label className="field inline">
          <span>Points a moving body may fill</span>
          <select
            value={options.maxMovingPoints}
            onChange={(e) => set({ maxMovingPoints: Number(e.target.value) })}
            disabled={options.movingBodies.length === 0}
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
        </label>
      </fieldset>
      <button className="link" disabled={disabled} onClick={() => setOptions(DEFAULT_OPTIONS)}>
        Reset options
      </button>
    </section>
  );
}
