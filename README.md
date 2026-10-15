# Constellation Query

Find groups of naked-eye stars that match a 2D pattern of points — for example, dots taken from an
ancient carving, a map, or a drawing — anywhere in the sky, at any time over the last ~15,000 years.

**Live site:** https://rosolam.github.io/ConstellationQuery/

Everything runs in your browser. There is no server and nothing you upload leaves your computer.

## What it does

You give it a set of points. It searches the star catalog for star groupings with the same shape,
allowing any **scale** and **rotation** (but not mirroring), and accounting for how the sky changes
over time:

- **Precession** of Earth's axis (Vondrák long-term model, valid over tens of thousands of years),
  which shifts which stars are near the pole and which latitudes can see them.
- **Proper motion** of each star in 3D, so star positions and brightness drift correctly over millennia.
- **Visibility**: a fit only counts if the whole figure can be seen above a minimum altitude from
  somewhere on Earth at that epoch.

For each match it reports:

| Field | Meaning |
| --- | --- |
| Error | RMS distance between your points and the stars, as a % of the figure's size |
| Span | Angular size of the figure on the sky |
| Rotation | How far your pattern is rotated to fit (relative to north of date up) |
| Best epoch | The year the fit is tightest, with the range of years it stays under the error limit |
| Visible from | Range of latitudes where the whole figure rises above the minimum altitude |
| Bright | How many member stars are brighter than the "bright" magnitude |
| Stand-out | How much the figure dominates the light in its patch of sky (see below) |

Click a result to see a sky chart of the figure at its best epoch, its member stars, how
tilted it appears as it rises, culminates and sets for an observer latitude you pick, and any competing
stars inside the figure.

### Top fits and top bright fits

Results come in two lists:

- **Top fits** — the closest shape matches using every star down to the faintest magnitude you allow.
- **Top bright fits** — the same search using only bright stars. A looser fit made entirely of bright
  stars is often more plausible as something people actually noticed and named than a tight fit among
  faint ones.

### Stand-out score

Real constellations tend to be the brightest things in their patch of sky. The stand-out score is the
share of light inside the figure's outline that comes from the figure's own stars. It was calibrated on
28 well-known asterisms (Big Dipper, Orion's belt, Cassiopeia, Crux, Leo, …): they score 62–100%, while
random same-shape bright-star groupings have a median of about 9%. "Intruders" are non-member stars
inside the outline at least as bright as the figure's faintest star.

### Sun, Moon and planets (optional)

You can let one or two points be filled by the Sun, Moon, or a planet. Because these move constantly,
the app doesn't report specific dates; instead it checks whether the point lies in the band of sky those
bodies travel through and reports the range of epochs where that works.

## Entering a pattern

Three ways, all on the Search page:

1. **Image** — upload a picture with the points marked as red dots. The dots are detected automatically.
2. **Editor** — click to add a point, drag to move it, and right-click (or select and press Delete) to remove it.
3. **JSON** — paste or load a file like:

   ```json
   {
     "points": [[0, 0.4], [0.2, 0.5], [0.45, 0.55], [0.6, 0.5], [0.75, 0.3], [1, 0.25], [0.95, 0]],
     "options": { "magLimit": 5, "errorThresholdPct": 3 }
   }
   ```

   Points use x to the right and y up; they're normalized automatically, so any units work. Points can
   also be `{"x": .., "y": ..}` objects. `options` is optional.

You can download the current pattern as JSON or as a clean red-dot image.

## Search settings

Every setting has an ⓘ button in the app explaining what it does. The main ones:

| Setting | Default | Notes |
| --- | --- | --- |
| Faintest magnitude | 5.0 | Lower = only brighter stars. Most constellation stars are magnitude 4 or brighter. |
| Min / max span | 10° – 60° | A fist at arm's length is about 10°. |
| Error limit | 3% | |
| Years | 13,000 BCE – 2100 CE | |
| Results to show | 30 | Up to 1000. |
| Bright fits | on, magnitude ≤ 4.0 | |

When you click **Search the sky**, the app checks your settings and warns you if they're likely to be
slow or produce noisy results, with one-click fixes. You can always search anyway.

Searches run in parallel Web Workers. The default search takes a few seconds on a desktop computer;
phones and older laptops are slower.

## Running locally

Requires [Node.js](https://nodejs.org/) 22 or newer.

```bash
npm install
npm run dev        # development server with hot reload
npm test           # unit tests
npm run build      # production build into dist/
npm run preview    # serve the production build locally
```

The built site is plain static files. It must be served over HTTP (opening `dist/index.html`
directly from disk won't load the catalog or workers).

## Deployment

Every push to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which installs
dependencies, runs the tests, builds, and publishes `dist/` to GitHub Pages. If the tests fail, the live
site is left unchanged.

## Project layout

```
src/engine/     astronomy and matching (no UI): precession, star motion, visibility,
                shape fitting, search, stand-out score, red-dot detection
src/worker/     Web Worker entry that runs searches off the main thread
src/ui/         React components and the worker pool client
scripts/        catalog build script
public/data/    the filtered star catalog (stars.json)
```

Other scripts:

- `npm run build:catalog` — re-download HYG and regenerate `public/data/stars.json`.
- `npm run calibrate:clutter` — re-run the stand-out score calibration against the standard asterisms.

## Data and credits

Star data comes from the [HYG database v4.4](https://codeberg.org/astronexus/hyg) by David Nash /
Astronomy Nexus, filtered to the 8,920 stars of magnitude 6.5 and brighter. The HYG database and the
derived `public/data/stars.json` are licensed under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). See
[`public/data/DATA-LICENSE.md`](public/data/DATA-LICENSE.md).
