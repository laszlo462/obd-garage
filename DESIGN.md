# DESIGN.md

The v0.1 UI design. UI build issues cite this file instead of inventing their own design. Terms follow
[GLOSSARY.md](GLOSSARY.md).

- **Decided in:** the wayfinder ticket [UI design: DESIGN.md and screen inventory](https://github.com/laszlo462/obd-garage/issues/29).
  Its comments record the two prototype rounds and why each choice was made.
- **Primary source:** the throwaway prototype on the
  [`prototype/ui-design`](https://github.com/laszlo462/obd-garage/tree/prototype/ui-design/prototypes/ui-design)
  branch, variant **F**. Run `node prototypes/ui-design/serve.ts` on that branch to open it on a phone. When this
  file and the prototype disagree, this file wins. Port the ideas, not the code.
- **Gestures** come from [Can Notes be pinned to a moment on a phone chart?](https://github.com/laszlo462/obd-garage/issues/9)
  and [ADR 0002](docs/adr/0002-uplot-with-own-touch-plugin.md).

## Principles

- **Phone first.** The iPhone home-screen app is the main target. Desktop is the same layout, widened (see
  [Phone and desktop](#phone-and-desktop)).
- **A dense console, not a lifestyle app.** The look follows Grafana's open-source theme. It has flat panels with 1 px
  borders and no shadows, mono numbers, and a lot of data per screen.
- **Status is never colour alone.** Every coloured state has a word, a number or a pattern beside it.
- **Fixed geometry under the finger.** Nothing moves or reflows while the owner scrubs or steps.
- **Report text is untrusted.** Every string that comes from an upload is inserted as text (see `CLAUDE.md`).

## Tokens

Define these as CSS custom properties on `:root`. Use `prefers-color-scheme` for the theme. v0.1 has no theme
switch.

### Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f4f5f5` | `#111217` | Page canvas |
| `--surface` | `#ffffff` | `#181b1f` | Panels, rows, sheets' content |
| `--surface2` | `#e6e8ec` | `#22252b` | Neutral badge fill, pressed row, segmented control track |
| `--ink` | `#24292e` | `#ccccdc` | Body text |
| `--ink2` | `#3d444d` | `#b4b4c6` | Secondary text, panel labels |
| `--muted` | `rgba(36,41,46,.70)` | `rgba(204,204,220,.65)` | Captions, units, timestamps |
| `--line` | `rgba(36,41,46,.14)` | `rgba(204,204,220,.14)` | 1 px borders and separators |
| `--accent` | `#2f63c8` | `#6e9fff` | Links, selected tab, primary button, generic Event marks |
| `--accent-ink` | `#ffffff` | `#0b1020` | Text on `--accent` |
| `--accent-t` | `rgba(56,113,220,.12)` | `rgba(61,113,217,.20)` | Accent badge fill, selected row |
| `--bad` / `--bad-t` | `#c4135b` / `rgba(224,34,110,.10)` | `#ff6b7d` / `rgba(242,73,92,.15)` | MIL on, stored and permanent codes, failures, delete |
| `--warn` / `--warn-t` | `#8f5600` / `rgba(255,153,0,.15)` | `#ff9830` / `rgba(255,152,48,.15)` | Pending codes, incomplete monitors, warnings, notices |
| `--ok` / `--ok-t` | `#14704f` / `rgba(27,133,94,.12)` | `#73bf69` / `rgba(115,191,105,.14)` | MIL off, complete monitors, added |

The red leans magenta on purpose: it stays apart from green for red/green colour-blind viewers.

**Chart series**, assigned in Channel-picker order and repeating after six:

| Token | Light | Dark |
|---|---|---|
| `--c1` | `#3274d9` blue | `#5794f2` |
| `--c2` | `#d65f00` orange | `#ff9830` |
| `--c3` | `#56a64b` green | `#73bf69` |
| `--c4` | `#a352cc` purple | `#b877d9` |
| `--c5` | `#a68400` yellow | `#fade2a` |
| `--c6` | `#e02f44` red | `#f2495c` |

**Chart overlays:**

| Token | Light | Dark | Use |
|---|---|---|---|
| `--ev-generic` | `rgba(56,113,220,.08)` | `rgba(87,148,242,.10)` | Generic Event span fill |
| `--ev-pack` | `#b86e00` | `#ff9830` | Rule Pack span hatch and outline, pack label |
| `--ev-look` | `#a352cc` | `#b877d9` | Look-alike span outline |
| `--note` | `#a68400` | `#fade2a` | Pinned Note pin and line, "Open Note" bar |

**Contrast** (WCAG 2.x, checked 2026-10-11): body, secondary and muted text, and all badge text (`--x` on `--x-t`
over `--surface`) are at least 4.5:1 in both themes. Status values, series lines, the Note pin and the pack hatch are
at least 3:1 on `--surface`. Recheck any new pair before use.

### Type

- **Text:** Inter (400, 500, 600). **Numbers:** Roboto Mono (400, 500, 600). Use the mono face for every value, unit
  row, timestamp, badge and compact title, with `font-variant-numeric: tabular-nums`.
- **Self-host both fonts in the image** (for example via `@fontsource` packages). Make no third-party requests at
  runtime. Fallbacks: `system-ui, sans-serif` and `ui-monospace, monospace`.
- **Scale:** 11 / 12 / 13 / 15 / 17 / 22 px. Body is 15 px. Captions and section labels are 11 px uppercase, 600, letter
  spacing `.06em`. Stat values are 22 px mono 600. Viewer titles are 22 px.
- Use no large page titles. The app bar carries context.

### Space, shape, elevation

- **Gutter:** 12 px on a phone and 20 px at 900 px and up. Row padding is 9 px vertical, and control gaps are 6 to 8 px.
- **Radius:** 6 px for panels, cards and sheets' top corners, 4 px for controls and badges, and 50 % for dots.
- **Elevation:** none. Panels separate by `--line` borders and `--surface` against `--bg`. Only the app bar,
  tab bar and Note bar are translucent, with a backdrop blur.
- **Touch targets:** at least 44 × 44 px, even where Grafana's own density is smaller. Chart pins have a 36 px
  hit area inside the chart.
- **No double-tap zoom** on any control: `touch-action: manipulation` on buttons, links, labels, inputs and
  `summary`.
- Respect `prefers-reduced-motion`. Sheets slide up in 200 ms. Nothing else animates.

### Icons

Use one 24 px outline icon set with a 1.8 px stroke (Lucide, ISC licence, fits). Use icons only next to a label,
except for Back, the menu and "more" (`…`), which carry an `aria-label`.

## Components

### Shell
- **App bar** (sticky, translucent `--surface`, bottom border):
  - **Left:** the **Current Vehicle switcher** ("2012 Ford F-250 ▾") on vehicle-scoped screens (Recent, Reports,
    Drive Logs), or **‹ Back** with the previous screen's name.
  - **Centre:** the screen title on pushed screens.
  - **Right:** `…` (viewer actions) where it applies, then the menu button. The menu button has a `--bad` dot when
    Unassigned or Failed Uploads is not empty.
- **Tab bar** (fixed to the bottom, safe-area padded): **Recent · Reports · Drive Logs · Add**. Add is a filled
  `--accent` square with a plus sign. It opens the iOS Files picker and never navigates.
- **Pushed screens** (the viewers, Vehicle settings) hide the tab bar. In the Drive Log viewer, the Note bar takes
  the tab bar's place.
- **Menu** (a sheet): Vehicles (count), Unassigned (count badge, hidden at zero), Failed Uploads (count badge, hidden
  at zero), Export *Current Vehicle*…, and the app version.

### Lists and badges
- **Upload row**, used on Recent, Reports and Drive Logs:
  - **Kind label column:** `LOG` in `--c1` or `REPORT` in `--warn`, mono 10 px 600.
  - **Title:** the mono compact date-time, "04 Oct 17:22".
  - **Right:** the duration ("41 min") or the MIL state ("MIL ON").
  - **Below the title:** badges.
  - The whole row is the tap target. Rows are full width with a bottom border.
- **Badges:** 4 px radius, mono 11 px 600, and a tinted fill with the matching ink.
  - **Neutral:** Event count, monitors incomplete.
  - **`--accent`:** Note count.
  - **`--bad`:** MIL on, stored codes.
  - **`--warn`:** pending codes, "12 rows skipped".
  - **`--ok`:** MIL off, monitors ready.
- **Section label:** 11 px uppercase `--muted` with an optional right-hand summary ("3 reports · 9 drive logs").
- **Count badge** (menu): filled `--bad` with white text, at least 20 px wide.

### Stat strip (Recent status)
- **One bordered panel:** four equal tiles in one row on every width, **MIL · Stored · Pending · Monitors**. Each
  tile has:
  - an 11 px label
  - a 22 px mono value in its status colour (`ON` / `OFF`, counts, `9/11`)
  - an 11 px mono change against the previous Report ("was ON", "no change", "+1" in `--warn`, "+1 ready")
- **Footer row:** "Latest report 2 Oct · 9 days ago · P0401 permanent ›". The whole panel opens that Report.
- **No sparklines.** The owner ruled them out ("useless, take up space").
- If the Vehicle has no Report, the panel reads "No diagnostic report yet" with a hint to add one.

### Controls
- **Buttons:** 40 px minimum height and 4 px radius. There are three kinds:
  - **Default:** `--surface`, 1 px `--line`, `--accent` text.
  - **Primary:** `--accent` fill.
  - **Danger:** `--bad` text, or a `--bad` fill for the final confirm.
- **Switch:** 46 × 28 px with a 4 px radius, and `--accent` when on. **Segmented control:** a `--surface2` track
  with the selected segment raised to `--surface`.
- **Chips** (Channel picker): a horizontal scroller with no scrollbar, and a 1 px `--line` border.
  - **Selected:** the border is in the Channel's series colour, with a 12 % tint of it and a leading dot.
  - **End of the row:** an **All Channels…** chip opens the full picker.
- **Notice:** a `--warn-t` fill with `--warn` text and an icon, for decode notices and warnings ("EGR position
  rescaled from the pre-October decode", "12 rows skipped").

### Sheets
- On a phone they are bottom sheets with a grab handle, `--bg` behind `--surface` content groups, and a 6 px top radius.
  A tap on the scrim or Escape closes them. At 900 px and up they become centred dialogs, at most 560 px wide.
- **Header:** the title on the left and one text action on the right (Close, Done or Cancel). The primary
  action is a full-width button at the foot.

### When things go wrong
Two patterns, shared by every screen. A screen never draws its own error line.
- **A failed load: one banner.** A `--bad-t` strip under the app bar reads "✕ Couldn't load." with a **Retry**
  button (`role="alert"`). There is at most one, never one per screen. Retry refreshes the app state, then reloads
  every screen.
  - A screen reports its failed load to app state and clears the report on success and on unmount.
  - The rows already on screen stay under the banner. With no rows yet, the body stays empty.
- **A failed action: one toast.** A short message in a `--bad` outline, above the tab bar (`role="status"`). It
  clears after about 4 s, and a new toast replaces the current one. The control that failed stays usable
  ("Couldn't delete the upload.", "Couldn't load older uploads.").
- **A file the browser never got a 200 for** shows in the Batch result as "Not uploaded", in `--bad` with the
  reason and no link. It never reached the server, so it is not on Failed Uploads.

### Drive Log viewer
Order on a phone:
- **Header:** the title "SAT 04 OCT · 17:22", then a meta line (Vehicle label, duration, row count) and a
  **Reference chip**. The chip has a dashed outline and reads "Reference: 2 Oct report"; it opens the Reference
  Report picker. On an Unassigned log the chip reads **Assign to a Vehicle…**.
- **Decode notices** and warnings.
- **The Channel picker chips.**
- **Readout** (fixed geometry):
  - **Left column, 84 px:** the time "17:44:36", "+22:32" elapsed below it, and a flag line below that
    ("● IN WINDOW" in `--ev-pack` when the cursor is inside a pack span, "● Note" in `--note` on a pinned row,
    otherwise empty).
  - **Right:** **one fixed slot per charted Channel** in picker order. On a phone that is a 3-column grid with
    22 px rows; at 900 px and up the columns fill to 118 px each. Each slot has a series dot, the value (mono,
    tabular, fixed decimals per Channel) and the unit in `--muted`.
  - Values never wrap or shift as digits change. The readout height depends only on how many Channels are
    charted.
- **Chart panel**, built on uPlot, inside one bordered panel:
  - **Overview strip** (34 px): the whole drive as a muted area, with the zoom window outlined in `--accent`.
  - **Stacked panels**, one per Channel group in the Profile's default preset (for example rpm + speed, ECT,
    commanded + actual EGR). Each is 104 px high on a phone and 130 px on desktop. Each has a top-left label
    with a series-coloured tick, "Engine RPM (rpm)", and light horizontal grid lines.
  - **Cursor:** a 1.2 px `--ink` vertical line through all panels, with a **9 px dot in the series colour on each
    line**, ringed in `--surface`.
  - **Overlays:**
    - generic spans: `--ev-generic` fill
    - generic point Events: dashed `--accent` vertical lines
    - Rule Pack spans: `--ev-pack` 45° hatch with a thin outline
    - look-alikes: a 1.5 px `--ev-look` outline with a 10 % fill, shown only when the toggle is on
    - freeze-frame values: dashed 1.2 px lines in the Channel's colour
    - pinned Notes: a 2 px `--note` vertical line and a tappable pin head above the first panel
  - **X axis:** mono 10 px wall-clock times.
- **Legend:** small swatches for each overlay kind present (Event, Rule Pack, Look-alike, Freeze frame, Note).
- **Data table:** collapsed by default, with a Show / Hide button. When open, it shows rows around the cursor,
  with the cursor row highlighted, in mono 12 px, scrolling sideways.
- **Events panel:** see [Events list](#events-list).
- **Notes panel:** whole-drive Notes, with **Add**.
- **Note bar** (fixed to the bottom, replaces the tab bar):
  - **‹ row** · **Note here 17:44:44** · **row ›**. The steppers are 52 × 44 px chevrons with a 9.5 px "row"
    caption. A tap steps one row; holding steps again after 420 ms, then every 70 ms.
  - When the cursor is on a pinned row, the button turns `--note` and reads **Open Note 17:44:36**.

**Gestures** (from [#9](https://github.com/laszlo462/obd-garage/issues/9)):
- One finger dragged sideways scrubs the cursor and does not pan. A tap places the cursor.
- Two fingers pinch to zoom and pan around their midpoint.
- A vertical swipe scrolls the page: `touch-action: pan-y` plus a direction lock on the first move.
- On desktop, the mouse moves the cursor, a drag brush-zooms, and a double-click resets.

**Viewing a pinned Note:** a tap on its pin, its Events-list row, or **Open Note** snaps the cursor to that row and
opens the Note sheet. The sheet shows the text, the time and when the Note was added, with **Edit** and
**Delete**.

### Events list
- **One row per Event and pinned Note, by time:**
  - a 22 px marker column
  - the title
  - a `--muted` 13 px detail line
  - right-aligned mono times (the start, and the duration for spans)
- **Markers** match the chart:
  - generic point: an accent dot
  - generic span: a tinted square
  - Rule Pack: a hatched square, plus a pack label above the title ("6.7 P0401", 10 px uppercase `--ev-pack`)
  - look-alike: an outlined square
  - Note: a pin
- A tap on a row seeks the cursor and scrolls the chart into view. A Note row opens the Note sheet instead.
- **Header:** "Events" with a count, and the **Look-alikes** switch (off by default, hidden on Unassigned logs).
- **Rule outcomes that did not run** end the list as muted italic lines with a dashed marker: "Regen: not
  applicable, no DPF regen status in this log". On an Unassigned log they also say "Look-alikes: skipped, no
  Reference Report" and "6.7 P0401: not run, Unassigned logs get no Rule Packs".

### Diagnostic Report viewer
- **Header:** the title "THU 02 OCT · 21:32", then a meta line with the Vehicle label.
- **Compare bar:** "Compared with" plus a select. The default is "Previous · 21 Aug"; the select also offers any other
  Report of the Vehicle and "No comparison".
- **Overview tiles:** MIL, Codes, Monitors, Since clear. They are two columns on a phone and four at 900 px and up.
  Each tile has a mono value and a change line against the compared Report ("+1 pending", "1 more complete").
- **Collapsible sections** in bordered panels. The summary row has a title and a right-hand count badge. Open by
  default: Trouble codes, Readiness monitors, Mode $06, Notes. Closed by default: freeze frame, live data, IUMPR,
  Vehicle info.
  - **Trouble codes:** the code in mono 17 px (`--bad`, or `--warn` when pending), the description, and status
    badges (Stored, Permanent, Pending, plus "New" or "Also in 21 Aug" when comparing).
  - **Readiness monitors:** name, a status badge (Complete `--ok`, Incomplete `--warn`, Not supported neutral) and
    "was …" when the status changed.
  - **Mode $06:** the segmented control **Least headroom** (default) / **Report order**. Each row has:
    - the test name and its TID / CID
    - the value with its unit, and "n % headroom" coloured by margin: `--bad` under 5 %, `--warn` under 20 %, `--ok` otherwise
    - "was x" when comparing
    - a 6 px range bar from min to max with a value marker, and min and max labels
  - **Freeze frame, live data, Vehicle info:** two-column key/value rows with mono values.
  - **IUMPR:** per ECU, a meta line (ignition cycles, general denominator), then one row per monitor in aligned
    columns under a header row: **Monitor · Completed · Conditions met · Ratio**. Values are mono, and the ratio has
    a bar ("off scale" above the bar's maximum). When comparing, the row ends with "+n / +n since 21 Aug".
  - **Notes:** whole-Report Notes with **Add Note**.

## Screen inventory

Contents and rules come from [New-Vehicle dialog](https://github.com/laszlo462/obd-garage/issues/10),
[Ingest and re-parse pipeline](https://github.com/laszlo462/obd-garage/issues/21),
[Rule engine shape](https://github.com/laszlo462/obd-garage/issues/22) and
[What is a Bundle?](https://github.com/laszlo462/obd-garage/issues/19). This list says how each screen looks and
where it sits.

| Screen | Reached from | Contents |
|---|---|---|
| **Recent** (tab) | Tab bar; the default screen | Stat strip for the Current Vehicle, then "Recent uploads" rows (both kinds, newest first). No Unassigned logs. |
| **Reports** (tab) | Tab bar | Upload rows for the Current Vehicle's Diagnostic Reports. |
| **Drive Logs** (tab) | Tab bar | Upload rows for the Current Vehicle's Drive Logs, grouped under month labels. |
| **Drive Log viewer** | Any Drive Log row | See [Drive Log viewer](#drive-log-viewer). `…` sheet: Change Vehicle…, Export this day…, Download original, Delete…. |
| **Diagnostic Report viewer** | Any Report row, the stat strip | See [Diagnostic Report viewer](#diagnostic-report-viewer). `…` sheet: Export this day…, Download original, Delete…. |
| **Vehicles** | Menu, switcher "Manage vehicles…" | One panel per Vehicle: label with "Current" badge, VIN (mono), Profile, Rule Packs, Report and Drive Log counts, latest Report date. Buttons: Switch to, Settings, Export…, Delete…. Footer: "A Vehicle is added when a Diagnostic Report with a new VIN is uploaded." |
| **Vehicle settings** | Vehicles → Settings, New vehicle sheet → Change | Profile (radio rows), Rule Packs (switch rows with description), the note "Changing the Profile or a Rule Pack regenerates this Vehicle's Events. Notes are kept.", Delete vehicle…. |
| **Unassigned** | Menu | Explanation line, rows with a checkbox, date-time, duration, Note count and **View**. Action row: **Assign to…** (primary), Export, Delete, disabled until something is ticked. **View** opens the Drive Log viewer in its Unassigned form. |
| **Failed Uploads** | Menu, batch result | Explanation line, one panel per file: filename (mono), kind and upload time, the error in `--bad`, **Download original**, **Delete**. |

| Sheet | Opened by | Contents |
|---|---|---|
| **Current Vehicle switcher** | App bar switcher | Radio rows (label, VIN last 4, counts), "Manage vehicles…". |
| **Upload progress** | Add, after picking files | "3 of 8 · filename" and a progress bar. Reports go first. |
| **Which Vehicle?** | Upload batch with Drive Logs, when a Vehicle exists | Title "3 Drive Logs: which Vehicle?". Radio rows for each Vehicle (default: a Vehicle new in this batch, else the Current Vehicle, marked "New" or "Current") and **Unassigned** ("Not one of my vehicles, or not sure"). One question per batch. |
| **Batch result** | End of every batch | Title "4 files added" or "2 added, 3 not". One line per file: ✓ added (`--ok`), ! added with a warning or overlap (`--warn`), ✕ Failed Upload (`--bad`), – already added (with an open link) or refused (`--muted`), each with its reason. |
| **New vehicle added** | After the batch result, once per batch | Label, VIN, Profile and Rule Packs with **Change**; then the same-day Unassigned Drive Logs, all ticked, with **Assign to this vehicle** / **Not now**. |
| **Reference Report** | Drive Log viewer's Reference chip | Radio rows of the Vehicle's Reports ("Closest" badge on the default) and **None**. |
| **Export** | Menu, Vehicles, viewer `…`, Unassigned | Vehicle scope: From and To dates, presets (This day, Last 30 days, All time), a summary ("1 Drive Log · 0 Reports, +1 Reference Report outside the range"), a "contains the VIN" line, **Download .zip**. Unassigned scope: the selection only. Empty range: the button is disabled and reads "Nothing in this range". |
| **Note** | Note here, Add, Edit | A plain-text field, **Save**, Cancel. The title is "Note at 17:44:44" when pinned. |
| **Note view** | Pin, Events row, Open Note | Text, time, when it was added, **Edit**, **Delete**. |
| **Assign to…** | Unassigned, viewer `…` → Change Vehicle | Radio rows of Vehicles, the line "Events are regenerated with the Vehicle's Profile and Rule Packs. Notes are kept.", **Assign**. |
| **Delete confirmations** | Every Delete | State what goes with counts. Delete vehicle adds "Also delete its N Drive Logs" (off by default). The final button is `--bad` filled. |

## Phone and desktop

There is one responsive layout and no split list-and-detail view. The break is at **900 px**:

| | Phone (< 900 px) | Desktop (≥ 900 px) |
|---|---|---|
| Navigation | Bottom tab bar | Tabs and **+ Add** move into the app bar after the switcher. The tab bar is hidden. |
| Content width | Full width, 12 px gutter | Lists at most 760 px wide and centred; viewers at most 1180 px; 20 px gutter |
| Drive Log viewer | One column | The chart column plus a 360 px sticky side column with the Events and Notes panels |
| Readout | 3 columns | Columns fill to 118 px each |
| Chart panels | 104 px high | 130 px high |
| Note bar | Full-width bar at the bottom | A floating 420 px bar, centred at the bottom |
| Report overview tiles | 2 columns | 4 columns |
| Sheets | Bottom sheets | Centred dialogs, at most 560 px wide |

The owner has tried the desktop layout only in screenshots. The first UI build issue that ships a viewer should
include a desktop check by the owner.

## Accessibility

- Contrast as in [Colour](#colour). Status is always a word or number in addition to its colour. Event spans
  stay apart by pattern (solid, hatched, outlined), not hue alone.
- Touch targets of at least 44 px, no double-tap zoom, and a fixed readout and Note bar.
- Every icon-only control has an `aria-label`. Sheets are `role="dialog"` with focus moved in and restored on close.
  The tab bar is a `tablist`.
- The chart is not the only way to the data. The Events list, readout and data table carry the same facts as text.
