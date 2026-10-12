# Mobile design references for OBD Garage

Question: which three well-regarded, visually distinct mobile design languages (not iOS inset-grouped lists) could the
app use as alternative visual directions? Findings are meant to be mocked in plain HTML/CSS, no copied assets.

**Evidence labels.** `[verified]` = read from the source named. `[recall]` = from general knowledge, not re-fetched this
session; treat as approximate. Hex values marked `[sketch]` are our own proposals, not the reference's real values.

## Picks

| # | Direction | Character | Best at |
|---|-----------|-----------|---------|
| A | Flighty ("departure board") | Dense, high-contrast, status-first, near-monochrome plus one status hue | Recent card, report status, Mode $06 |
| B | Material 3 (tonal) | Tonal surfaces, rounded containers, colour roles, chips | Sheets, lists, themable light/dark |
| C | Grafana ("ops console") | Flat dark panels, thin borders, 4-6px radii, mono readouts | Drive Log chart stack and readout |

They differ on the main axes: A is typographic and sparse-colour, B is tonal and rounded, C is flat and
instrument-like. Rejected: Gentler Streak (Apple Design Award 2024, Social Impact; soft gradients and encouragement
tone suit lifestyle, not 9 channels), Material 3 Expressive (see B), Strava/WHOOP/Oura (no primary design docs
reachable; consumer-fitness look), Apple Health/Swift Charts (too close to the iOS baseline).

---

## A. Flighty

**Why well-regarded.** 2023 Apple Design Award, Interaction category. Apple's text: "a look that mirrors time-honored
airport design conventions", "key information where you need it most", "incredible Live Activities and Dynamic
Island integration". [verified] https://developer.apple.com/design/awards/2023/
Status wording shown as short labels with times and deltas ("Delayed 45m", "Gate changed", "New Departure: 8:28pm
(was 11:30pm)", "22m early"). [verified] https://flighty.com/

**Visual traits.** [recall unless noted]
- Type: a clean grotesque, tabular numerals, large bold times, small uppercase labels with letter-spacing.
  Free equivalents: Inter (use `font-variant-numeric: tabular-nums`) or "Barlow Condensed" for headings/board feel.
- Colour: near-black or white canvas, one saturated status hue per state (green on time, amber delayed, red
  cancelled/bad), accent used sparingly. Status is paired with text, never colour alone.
- Density: high; small caption rows of key/value pairs under a big primary figure. Radii about 12-16px cards,
  full-bleed header bands. Icons: thin line/SF-style glyphs. Motion: live-updating, rolling number changes.

**Data patterns.** Big number + delta label ("+45m"), progress line with a moving marker, colour-banded status strip,
split-flap-like time stacks, small caption keys.

**Mapping.**
- Recent status card: big MIL status word ("MIL OFF" / "2 CODES"), delta vs previous report ("+1 code since 3 Mar").
- Report viewer: Mode $06 rows as label, value, a thin range bar with a marker and "headroom 18%" text; monitors as a
  compact two-column grid of "COMPLETE / INCOMPLETE" tags.
- Drive Log: readout as a fixed board strip of large tabular numbers above the charts.
- Sheets: simple, white/black, large primary button.
- Steal: typographic hierarchy, delta labels, status tags with text. Not fit: it shows one flight at a time, so it
  gives little guidance for stacked multi-channel charts; skip maps and live-activity chrome.

**Token sketch** `[sketch]`
```css
:root{--bg:#f4f5f7;--surface:#fff;--ink:#0d1117;--muted:#5b6472;--accent:#0a84ff;
--ok:#1a7f4b;--warn:#b25e00;--bad:#c4262e;--line:#e3e6eb;--radius:14px;
--font:"Inter",system-ui,sans-serif;--mono:"Barlow Condensed","Inter",sans-serif}
@media(prefers-color-scheme:dark){:root{--bg:#000;--surface:#121418;--ink:#f2f4f7;--muted:#98a1ae;
--accent:#4aa3ff;--ok:#3ecf8e;--warn:#ffb340;--bad:#ff6b6b;--line:#23272e}}
```

---

## B. Material 3 (tonal)

**Why well-regarded.** Google's official design system, with documented colour roles, shape scale and accessibility
guidance. https://m3.material.io/ (the colour-roles page returned only its title to the fetcher this session; role
names and baseline tone mappings below come from the official Android components doc, [verified]
https://github.com/material-components/material-components-android/blob/master/docs/theming/Color.md ).
Tonal palettes and HCT are defined in the official colour utilities. [verified]
https://github.com/material-foundation/material-color-utilities
M3 Expressive (I/O 2025) adds bolder shape, colour and spring motion; Google's own post was withdrawn, so only
press coverage was seen (Dezeen, 9to5Google). [secondary] Recommend base M3, not Expressive, for dense data.

**Visual traits.**
- Type: Roboto / Roboto Flex (Google Fonts). Scale: display/headline/title/body/label.
- Colour: roles, not hexes. Light: surface = neutral98, container = neutral94, primary = primary40, primary container
  = primary90, error = error40. Dark: surface = neutral6, container = neutral12, primary = primary80, error = error80,
  outline = neutral-variant60. [verified, tone numbers] Surfaces get 5 container levels (lowest..highest) instead of
  shadows. Pick a teal or amber seed rather than default purple.
- Shape: scale 4/8/12/16/28px, pill buttons and chips, large 28px top corners on bottom sheets [recall].
- Density: medium. Icons: Material Symbols (outlined). Motion: emphasised easing, ripple, container transform.

**Data patterns.** Filter/assist chips, segmented buttons, linear progress and "slider with value indicator" (good for
headroom), badges, list items with leading icon and trailing supporting text.

**Mapping.**
- Recent: filled tonal card for status; feed as lists with leading icon in a tonal circle.
- Drive Log: chart panels in surface-container cards; readout as a tonal "tooltip" card; Events as filter chips; Note
  bar as a bottom app bar with FAB.
- Report: codes as list items with a state chip (stored/pending/permanent); headroom as linear indicator with a
  marker.
- Sheets: M3 modal bottom sheet with drag handle (best fit of the three).
- Steal: tonal roles, drag-handle sheets, chips, 5-level surface scheme (easy to theme light/dark). Not fit: lots of
  padding and large radii cost space with 9 channels; ripple/FAB feel Android-only on an iOS home-screen app.

**Token sketch** `[sketch, seed teal]`
```css
:root{--bg:#f6faf9;--surface:#eaefee;--surface-hi:#dfe4e3;--ink:#171d1d;--muted:#3f4948;
--accent:#006a6a;--on-accent:#fff;--accent-container:#9cf1f0;--ok:#146c2e;--warn:#7a5900;--bad:#ba1a1a;
--line:#6f7978;--radius:16px;--radius-sheet:28px;--font:"Roboto Flex","Roboto",system-ui,sans-serif}
@media(prefers-color-scheme:dark){:root{--bg:#0e1514;--surface:#1a2120;--surface-hi:#252b2b;--ink:#dde4e3;
--muted:#bec9c8;--accent:#4cdada;--on-accent:#003737;--accent-container:#004f4f;--ok:#7ddc8f;--warn:#f0c14a;--bad:#ffb4ab;--line:#899392}}
```

---

## C. Grafana ("ops console")

**Why well-regarded.** The de-facto standard for time-series dashboards; the theme is open source, so tokens are
checkable. [verified] https://github.com/grafana/grafana/blob/main/packages/grafana-data/src/themes/createColors.ts ,
`palette.ts` and `createShape.ts` in the same folder. Design-award credibility is weaker than A and B; the case is
domain fit (multi-series charts, hover readouts, threshold regions, annotations).

**Visual traits (real Grafana values, [verified]).**
- Dark: canvas #111217, panel #181b1f, secondary #22252b, text #CCCCDC, text secondary 65% alpha, borders
  rgba(204,204,220,.12/.2/.3), primary blue #3d71d9, green #1a7f4b, red #d10e5c, orange #ff9900.
- Light: canvas #fbfbfb, panel #fff, secondary #f4f5f5, text #24292E, primary blue #3871dc, green #1b855e, red #e0226e.
- Radii 4 (chips), 6 (cards/panels), 10 (modals). Flat, no shadows, 1px borders. Font: Inter [recall]; monospace
  for values: Roboto Mono / JetBrains Mono.
- Density: highest of the three. Motion: minimal.

**Data patterns.** Shared crosshair with a tooltip readout listing every series with colour swatch and value;
threshold regions and lines; annotation bands (our Event spans), dashed threshold lines (our freeze-frame lines);
stat panels with sparkline; "state timeline" strips for status over time; legend as a table (last/min/max).

**Mapping.**
- Recent: row of stat tiles (MIL, codes, last drive) with sparklines; feed as dense table rows.
- Drive Log: stacked panels sharing one crosshair, readout table pinned at top with swatch + value + unit, Events as
  annotation bands on a state-timeline strip, Notes as annotation pins.
- Report: Mode $06 as table rows with threshold-bar cells; monitors as a state grid.
- Sheets: modal with 10px top radius, dense form rows.
- Steal: readout-as-legend-table, state timeline, threshold colouring, flat panels (cheap on a phone). Not fit: reads
  as desktop/engineering tool, thin 12% borders are low contrast outdoors; needs larger touch targets than its native
  density.

**Token sketch** (values from Grafana above; radius/font are ours)
```css
:root{--bg:#fbfbfb;--surface:#fff;--surface-2:#f4f5f5;--ink:#24292e;--muted:rgba(36,41,46,.75);
--accent:#3871dc;--ok:#1b855e;--warn:#b86e00;--bad:#e0226e;--line:rgba(36,41,46,.12);--radius:6px;
--font:"Inter",system-ui,sans-serif;--mono:"Roboto Mono",ui-monospace,monospace}
@media(prefers-color-scheme:dark){:root{--bg:#111217;--surface:#181b1f;--surface-2:#22252b;--ink:#ccccdc;
--muted:rgba(204,204,220,.65);--accent:#3d71d9;--ok:#1a7f4b;--warn:#ff9900;--bad:#d10e5c;--line:rgba(204,204,220,.12)}}
```

---

## Cross-cutting: charts and accessibility

- Channel line colours for all three: use the Okabe-Ito colour-blind-safe set (#E69F00 #56B4E9 #009E73 #F0E442
  #0072B2 #D55E00 #CC79A7, plus black/grey) [recall; Wong, Nature Methods 8:441, 2011]. On dark backgrounds lighten
  #0072B2.
- Never encode status by colour alone: pair green/amber/red with a word or icon (Flighty does this). Red/green alone
  fails for deuteranopia; Grafana's red is magenta-leaning (#d10e5c), which helps.
- Event spans: keep the existing encoding (solid shade = rule event, hatched = Rule Pack, outline = look-alike), as
  pattern and outline are colour-independent.
- Text contrast: WCAG 2.2 needs 4.5:1 body, 3:1 large text and graphical objects. Check `--muted` on `--surface` and
  the 12% Grafana borders (decorative only). Touch targets at least 44px (iOS HIG) / 48dp (M3); the scrub cursor
  needs a fixed, large readout. Respect `prefers-reduced-motion` and `prefers-color-scheme`.
- Hex values in the sketches were not run through a contrast checker; verify before adoption.

## Sources not reached
Material 3 colour-roles and design-principles pages (title only), Google's original M3 Expressive post (withdrawn),
Flighty design blog posts (none linked from the homepage), WHOOP/Oura/Strava/Garmin primary design docs.
