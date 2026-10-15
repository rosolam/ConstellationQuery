import type { ReactNode } from 'react';
import { MOVING_BODIES, type BodyId } from '../engine/bodies';
import { sanitizeOptions } from '../engine/points';
import { DEFAULT_OPTIONS, MAX_SPAN_CEILING_DEG, type SearchOptions } from '../engine/types';
import { formatYear } from './format';
import { InfoTip } from './InfoTip';

interface Props {
  options: SearchOptions;
  setOptions: (o: SearchOptions) => void;
  disabled: boolean;
}

type NumKey = { [K in keyof SearchOptions]: SearchOptions[K] extends number ? K : never }[keyof SearchOptions];

const HELP: Record<string, ReactNode> = {
  magLimit: (
    <>
      <p>Only stars at least this bright are used. Lower numbers are brighter: Sirius is −1.4, Polaris 2.0, the faintest stars in a city sky about 4, and in a dark sky about 6.</p>
      <p>Most traditional constellation figures use stars of magnitude 4 or brighter. Each step fainter adds many more stars (4.0: 523, 5.0: 1,637, 6.0: 5,070), which makes chance fits easier and the search slower.</p>
    </>
  ),
  errorThresholdPct: (
    <>
      <p>How closely the stars must match your points. After the best scaling and rotation, this is the typical (RMS) distance between each point and its star, as a percentage of the fit's span.</p>
      <p>1% is nearly exact. 3% is clearly the same shape with some stars visibly off. Hand-drawn or carved sources usually call for 3–5%.</p>
    </>
  ),
  maxSpanDeg: (
    <p>
      The largest a fit may be on the sky, measured between its two farthest members. 10° is about a fist at arm's length, 60° about six fists. The {MAX_SPAN_CEILING_DEG}° ceiling keeps fits within one viewable section of sky.
    </p>
  ),
  minSpanDeg: (
    <p>The smallest a fit may be. Orion's Belt is about 3°, a fist at arm's length about 10°, the Big Dipper about 25°. Raise this to skip tight groupings that would not read as a figure.</p>
  ),
  minAltitudeDeg: (
    <p>For a latitude to count as "visible from", every member must be at least this many degrees above the horizon at the same moment. Haze dims stars near the horizon; 10° is a common practical limit.</p>
  ),
  maxResults: (
    <>
      <p>How many fits to list in each result set, best first, after removing duplicates. Up to 1,000.</p>
      <p>
        The search keeps a pool of candidates that grows with this number, so larger lists take somewhat longer: with
        the default options, 1,000 results take about 2–3 times as long as 30. Fewer fits come back when fewer exist
        within the error limit.
      </p>
    </>
  ),
  years: (
    <>
      <p>The range of epochs to search. Years use astronomical numbering: 0 is 1 BCE and −13000 is 13,001 BCE. A longer range takes proportionally longer.</p>
      <p>Far from today, positions of stars without a measured distance or radial velocity are less certain; those fits are marked ⚠.</p>
    </>
  ),
  discoveryStepYears: (
    <>
      <p>How often the sky is sampled when looking for your shape.</p>
      <p>Precession turns the whole sky together and never changes a shape; only the stars' own slow motions do, so most shapes hold for thousands of years. A smaller step catches short-lived fits that involve fast-moving stars. Halving the step doubles the search time.</p>
    </>
  ),
  refineStepYears: (
    <p>Once a fit is found, it is re-checked at this interval to find when it starts and stops fitting. This sets how precise the reported date ranges are (about ± half the step). It does not change which fits are found and adds little time.</p>
  ),
  brightFits: (
    <>
      <p>Also run a second search that uses only bright stars, and list those fits separately as "Top bright fits".</p>
      <p>A bright-only fit with a larger error can matter more than a closer fit among dim stars that no one would have chosen for a figure. Bright stars are shown in bold in all results.</p>
    </>
  ),
  brightMag: (
    <p>Stars at this magnitude or brighter count as bright. 4.0 covers most stars in the traditional figures. The bright search runs only when this is brighter than the faintest magnitude.</p>
  ),
  movingBodies: (
    <>
      <p>Lets the Sun, Moon or a planet stand in for one of your points. These bodies travel along the ecliptic, so a point can be filled only if it lies inside the body's path.</p>
      <p>Results give eras when the body can cross that point, not individual dates. At least three points must still land on stars.</p>
    </>
  ),
  maxMovingPoints: <p>How many of your points a moving body may fill in a single fit. Two allows, for example, the Moon and Venus together.</p>,
};

export function OptionsPanel({ options, setOptions, disabled }: Props) {
  const set = (patch: Partial<SearchOptions>) => setOptions(sanitizeOptions({ ...options, ...patch }));
  const num = (key: NumKey, label: string, step: number, min: number, max: number, note?: string, help: ReactNode = HELP[key]) => (
    <div className="field">
      <span className="field-label">
        <label htmlFor={`opt-${key}`}>{label}</label>
        {help && <InfoTip label={label}>{help}</InfoTip>}
      </span>
      <input
        id={`opt-${key}`}
        type="number"
        step={step}
        min={min}
        max={max}
        value={options[key]}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.value === '') return;
          set({ [key]: Number(e.target.value) } as Partial<SearchOptions>);
        }}
      />
      {note && <small>{note}</small>}
    </div>
  );
  const toggleBody = (id: BodyId) =>
    set({
      movingBodies: options.movingBodies.includes(id)
        ? options.movingBodies.filter((b) => b !== id)
        : [...options.movingBodies, id],
    });
  const brightInactive = options.brightFits && options.brightMag >= options.magLimit;

  return (
    <section className="panel">
      <h2>Search options</h2>
      <div className="options-grid">
        {num('magLimit', 'Faintest magnitude', 0.1, -1, 6.5)}
        {num('errorThresholdPct', 'Max error (% of span)', 0.1, 0.1, 20)}
        {num('maxSpanDeg', 'Max span (°)', 1, 1, MAX_SPAN_CEILING_DEG)}
        {num('minSpanDeg', 'Min span (°)', 0.5, 0.1, MAX_SPAN_CEILING_DEG)}
        {num('minAltitudeDeg', 'Min altitude (°)', 1, 0, 60)}
        {num('maxResults', 'Results to show', 10, 1, 1000)}
        {num('startYear', 'From year', 500, -198000, 198000, formatYear(options.startYear), HELP.years)}
        {num('endYear', 'To year', 500, -198000, 198000, formatYear(options.endYear), HELP.years)}
        {num('discoveryStepYears', 'Search step (years)', 500, 50, 50000)}
        {num('refineStepYears', 'Refine step (years)', 50, 10, 10000)}
      </div>

      <fieldset className="bodies" disabled={disabled}>
        <legend>
          Bright fits <InfoTip label="Bright fits">{HELP.brightFits}</InfoTip>
        </legend>
        <div className="bright-row">
          <label className="check">
            <input type="checkbox" checked={options.brightFits} onChange={(e) => set({ brightFits: e.target.checked })} />
            Also list top fits using only bright stars
          </label>
          <span className="field inline">
            <label htmlFor="opt-brightMag">Bright = magnitude ≤</label>
            <input
              id="opt-brightMag"
              type="number"
              step={0.1}
              min={-1}
              max={6.5}
              value={options.brightMag}
              onChange={(e) => e.target.value !== '' && set({ brightMag: Number(e.target.value) })}
            />
            <InfoTip label="Bright magnitude">{HELP.brightMag}</InfoTip>
          </span>
        </div>
        {brightInactive && (
          <small className="warn">The bright limit is not brighter than the faintest magnitude, so every fit already uses only bright stars.</small>
        )}
      </fieldset>

      <fieldset className="bodies" disabled={disabled}>
        <legend>
          Sun, Moon and planets may fill a point <InfoTip label="Sun, Moon and planets">{HELP.movingBodies}</InfoTip>
        </legend>
        <div className="body-list">
          {MOVING_BODIES.map((b) => (
            <label key={b.id} className="check">
              <input type="checkbox" checked={options.movingBodies.includes(b.id)} onChange={() => toggleBody(b.id)} />
              {b.name}
            </label>
          ))}
        </div>
        <span className="field inline">
          <label htmlFor="opt-maxMovingPoints">Points a moving body may fill</label>
          <select
            id="opt-maxMovingPoints"
            value={options.maxMovingPoints}
            onChange={(e) => set({ maxMovingPoints: Number(e.target.value) })}
            disabled={options.movingBodies.length === 0}
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
          <InfoTip label="Points a moving body may fill">{HELP.maxMovingPoints}</InfoTip>
        </span>
      </fieldset>
      <button className="link" disabled={disabled} onClick={() => setOptions(DEFAULT_OPTIONS)}>
        Reset options
      </button>
    </section>
  );
}
