# Research: which TypeScript libraries fit the stack?

Wayfinder ticket #4. Researched 2026-10-08. Versions and dates come from the npm registry and GitHub
APIs on that day. Anything marked **Unconfirmed** was not verified from a primary source and needs a
quick spike before it is relied on.

## Recommendation

| Area | Pick | Runner-up |
|---|---|---|
| Server framework | Hono 4 with `@hono/node-server` | Fastify 5 |
| SQLite access | `better-sqlite3` 13, plain SQL, tiny hand-written migration runner | built-in `node:sqlite` |
| UI approach | Preact 11 (or pinned 10.29) with Vite, TSX | Svelte 5 |
| Charting | uPlot, with a small touch/zoom plugin of our own | Apache ECharts 6 |
| Server HTML parsing | `linkedom` (DOM API, text only) | `cheerio` |
| Test runner | Vitest 5 | `node:test` |
| Repo layout | Single package, folders for core / profiles / rule packs | npm workspaces |
| release-please | `release-type: node`, package path `.` | `simple` (**Unconfirmed**) |

## Context from the repo

- The reference viewers are dependency-free vanilla JS. The drive-log viewer draws its charts by hand as
  SVG (`createElementNS`, pointer events, overview strip, pins). No chart library is in use today, so
  there is nothing to "port" on the charting side; the charts get rebuilt on a library.
- The report viewer parses Diagnostic Reports with the browser `DOMParser` and walks the result with
  `querySelectorAll`, `tagName`, `nextSibling`, `parentElement`, `children`, `textContent`. That is a
  full DOM API, so the server parser should offer the same API to let the code move almost unchanged.
- The drive-log viewer parses its CSV at build time in Node (`build_viewer.js`), so CSV parsing already
  runs outside the browser.
- Repo rule: report text is untrusted and must be inserted as text, never markup. This favours a UI layer
  that escapes by default (Preact and Svelte both do) and a parser used only to read `textContent`.

## Server framework: Hono (runner-up Fastify)

- Hono 4.13.13 (2026-10-04), `@hono/node-server` 2.1.4 (2026-10-08); repo pushed the same day, not
  archived. Sources: <https://registry.npmjs.org/hono>, <https://registry.npmjs.org/@hono/node-server>,
  <https://github.com/honojs/hono>.
- Node setup is `serve(app)` from `@hono/node-server`, static files via `serveStatic` from
  `@hono/node-server/serve-static`; the docs warn that `root` resolves from the working directory.
  Source: <https://hono.dev/docs/getting-started/nodejs>.
- Why: small, TypeScript-first, uses web-standard Request/Response, easy for agents to write and test
  (`app.request()` needs no running server). Plenty for a single-owner app.
- Fastify 5.12.5 (2026-09-16) is the runner-up: very mature, schema validation built in, and
  `@fastify/multipart` 10.1.3 streams large uploads to disk. Choose it if uploads turn out to be big.
  Sources: <https://registry.npmjs.org/fastify>, <https://registry.npmjs.org/@fastify/multipart>.
- Express 5.2.1 was last released 2025-12-01. Still maintained, but older style and no advantage here.
  Source: <https://registry.npmjs.org/express>.
- **Unconfirmed:** Hono's built-in multipart form parsing was not checked against its docs. Reports and
  CSVs are small, so buffering should be fine; spike one CSV upload.

## SQLite access: better-sqlite3 (runner-up `node:sqlite`)

- better-sqlite3 13.0.3 (2026-08-05), requires Node >= 22, repo not archived. The npm tarball itself
  contains prebuilt binaries for linux x64/arm64, **linuxmusl** (Alpine) x64/arm64, macOS and Windows
  (checked with `npm pack --dry-run` on 13.0.3), and it uses `node-addon-api`, so no compiler step in
  Docker on either Debian or Alpine images. Sources: <https://registry.npmjs.org/better-sqlite3>,
  <https://github.com/WiseLibs/better-sqlite3>.
- Bundled SQLite is 3.53.4 with FTS5 and JSON1 on. Source:
  <https://github.com/WiseLibs/better-sqlite3/blob/master/docs/compilation.md>.
- `node:sqlite` is built in (added v22.5.0, no flag since v22.13/v23.4) and the Node 24 docs now mark it
  **Stability 1.2, release candidate**. It has `backup()`. Zero dependencies is attractive, but it is not
  yet marked stable. Source: <https://nodejs.org/docs/latest-v24.x/api/sqlite.html>.
- Keep all database code behind one small module so switching to `node:sqlite` later is a one-file change.
- Query builder / migrations: not worth it yet. The schema is small (reports, logs, vehicles, annotations).
  Use plain SQL plus a ~30-line migration runner keyed on `PRAGMA user_version`. Runner-up if that
  hurts: Kysely 0.29.6 (typed queries, Node >= 22). Drizzle ORM is 0.45.4, still pre-1.0. Sources:
  <https://registry.npmjs.org/kysely>, <https://registry.npmjs.org/drizzle-orm>. **Unconfirmed:**
  either tool's current support for `node:sqlite`.

## UI approach: Preact (runner-up Svelte)

- Fit: the app is a handful of screens (tabs, lists, a chart screen with a channel picker, upload,
  annotate). That is too much hand-managed DOM for vanilla JS, but far short of needing a heavy framework.
- Preact 11.0.1 (2026-10-08); 11.0.0 shipped 2026-09-30 after three release candidates. Version 10.29.8
  (2026-08-01) is the last 10.x. Source: <https://github.com/preactjs/preact/releases>,
  <https://registry.npmjs.org/preact>. **Risk:** 11 is eight days old at its first patch. Pin 10.29.x if
  you want zero early-adopter risk; the code is the same.
- Agent familiarity: Preact is React-shaped, so agents write it fluently; `preact/compat` also opens the
  React ecosystem if ever needed. Vite 8.3.4 plus `@preact/preset-vite` 2.10.6 is the standard build.
  Sources: <https://registry.npmjs.org/vite>, <https://registry.npmjs.org/@preact/preset-vite>.
- Porting the reference viewers: their logic (parsing, held-row collapse, events) is plain functions
  and moves over unchanged; only the DOM-building parts become components. Both viewers' layouts are
  plain HTML and CSS, which transfer as-is.
- Svelte 5.57.2 (2026-10-06) is the runner-up: excellent phone performance and very small output, but
  runes syntax is newer and agents are less reliable with it than with React-style code. Source:
  <https://registry.npmjs.org/svelte>.
- React 19.3.0 works but ships a much larger runtime for no benefit here.
- The "no framework" option was rejected for the reasons above.

## Charting: uPlot (runner-up ECharts)

- uPlot 1.6.32. The last tagged release is 2025-03-14, but the master branch is active (commits on
  2026-09-28, pushed 2026-10-05), 10.5k stars, not archived. So "old release, live project"; pin the
  version and treat it as stable. Sources: <https://github.com/leeoniya/uPlot>,
  <https://registry.npmjs.org/uplot>.
- Its README claims about 50 KB minified, a 166,650-point chart created in 25 ms, and much lower CPU and
  memory than Chart.js and ECharts when streaming (author's own benchmark, March 2023, desktop Chrome).
  Treat the numbers as the author's claim, not a phone measurement. Source: README above.
- Built in: zoom with auto-rescale, cursor with live legend values, multiple series with toggles, multiple
  y axes, cursor sync across several charts (demo `sync-cursor.html`), decimation demos, plugins/hooks.
  Source: <https://github.com/leeoniya/uPlot>, <https://github.com/leeoniya/uPlot/tree/master/demos>.
- Gaps that matter on a phone: no built-in drag-panning, and touch is delivered by external plugins
  (`zoom-wheel`, `zoom-touch`) on its hooks API. We would own a small pinch-zoom / drag-pan / tap-to-pin
  plugin. The existing viewer already has pointer-event zoom and pins to copy the behaviour from.
  **Unconfirmed on a real phone:** tap-to-select-a-time-point behaviour and multi-touch plugin quality.
  Spike this first.
- Stacked panels (one per channel group, shared x axis, overview strip) map to several synced uPlot
  instances, matching the current viewer's layout.
- ECharts 6.1.0 (2026-05-19), Apache project, has touch zoom/pan and large-data modes built in, so less
  code of our own, but a far bigger bundle (about 60 MB unpacked, tree-shakable) and heavier on phones.
  Source: <https://registry.npmjs.org/echarts>. **Unconfirmed:** its `large`/`sampling`/`dataZoom` option
  details; the option reference page would not load for me.
- Chart.js 4.5.1 (2025-10-13): decimation exists but only for line charts with linear/time x, parsing off
  and data in its own format (<https://www.chartjs.org/docs/latest/configuration/decimation.html>); no
  built-in touch zoom (plugin). Third choice.

## HTML parsing on the server: linkedom (runner-up cheerio)

- `linkedom` 0.18.13 (2026-07-07) offers a `DOMParser` and the standard DOM API (`querySelectorAll`,
  `nextSibling`, `textContent`, ...). The existing `parseReport` uses exactly that API, so it can move to
  a shared module and run on the server with almost no edits. Source:
  <https://registry.npmjs.org/linkedom>, <https://github.com/WebReflection/linkedom>.
- **Unconfirmed:** parser leniency. linkedom is built on htmlparser2, not the full HTML5 algorithm. OBDLink
  reports are machine-generated so this should be fine, but run the parser against several real reports
  (kept outside git) before committing.
- Runner-up `cheerio` 1.2.0 (2026-01-23, Node >= 20.18.1; built on parse5 and htmlparser2): most
  familiar jQuery-style API and spec-compliant, but the DOM walking code would have to be rewritten.
  Source: <https://registry.npmjs.org/cheerio>.
- Others considered: `jsdom` 30.1.2 is complete but heavy; `parse5` 8.0.1 is a bare parser with no
  query API; `node-html-parser` 9.0.4 has a partial DOM.
- Security rule from CLAUDE.md holds either way: read `textContent` only, never pass report HTML through.

## Test runner: Vitest (runner-up `node:test`)

- Vitest 5.0.3 (2026-09-30) needs Node >= 22.12 and Vite >= 6.4. It shares Vite's config, TypeScript
  handling and fast watch mode, so one tool covers server, core and UI component tests. Source:
  <https://vitest.dev/guide/>, <https://registry.npmjs.org/vitest>.
- `node:test` is **Stability 2, stable** in Node 24, with mocking and snapshots, no dependencies. Its watch
  mode and coverage are still experimental. It is the right pick if you want zero test dependencies, but
  UI tests would still need a separate DOM library. Source: <https://nodejs.org/docs/latest-v24.x/api/test.html>.

## Repo layout: single package

- One `package.json`. The "generic core / vehicle profiles / rule packs" split is a folder structure with
  import rules, not separate published packages. Workspaces add lockfile, build-order and Docker-layer
  complexity with no payoff for one app and one owner. Revisit only if the core is ever shared outside
  this repo.
- Node 24 can run `.ts` files directly: type stripping is **Stability 2, stable** since v24.12.0.
  Limits: imports need the `.ts` extension, `import type` for types, no enums or parameter properties
  (unless `--experimental-transform-types`), `tsconfig.json` is ignored at runtime. So the server can run
  as plain `node src/server/index.ts` with `tsc --noEmit` as the type check, and no server build step
  in the Dockerfile. Source: <https://nodejs.org/docs/latest-v24.x/api/typescript.html>.
  Vite builds only the browser bundle. Add `tsx` (<https://github.com/privatenumber/tsx>) only if a
  limit above bites.

## release-please: `node`, root path (runner-up `simple`)

- release-please 17.11.2 (2026-08-24), repo pushed 2026-10-08. The manifest format supports single
  packages as well as monorepos; `node` is the default type, and `"."` is the special key for the repo
  root. Sources: <https://github.com/googleapis/release-please>,
  <https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md>.
- `node` bumps the version in `package.json` and writes `CHANGELOG.md` from Conventional Commits, which is
  what a single TypeScript package wants. A release tag can then trigger the Docker image build.
- `simple` (version file only) is the fallback if `package.json` should not carry the version.
  **Unconfirmed:** the manifest page did not mention `simple`; check the release-types list before using it.

## Open items to spike before locking in

1. uPlot on a real phone: 50k rows x ~12 channels, pinch zoom, drag pan, tap-to-pin.
2. linkedom against several real OBDLink reports (kept out of git).
3. One CSV upload through Hono, to confirm built-in form parsing is enough.
4. Preact 11 versus pinned 10.29 (pick one; no code difference expected).
