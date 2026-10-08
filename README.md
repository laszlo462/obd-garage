# OBD Garage

A self-hosted, phone-first web app for viewing OBDLink exports: **Diagnostic Reports** (HTML) and **drive
logs** (CSV). It's spun off from a set of single-file viewers built while diagnosing a P0401 (EGR flow
insufficient) fault on a 2012 F-250 6.7L Power Stroke.

**Status (2026-10-08):** pre-wayfinding. No app code yet. The decisions below came out of the session that
built the original viewers and prototype. Everything else is open.

## Decided so far

- **Hosting:** a Docker container web app, not a static site. A backend allows shared storage, so reports
  and logs added on a phone show up on every device. It could also host the optional LLM analysis later.
- **Mobile layout:** variant **D** from the prototype has a bottom tab bar (Recent / Reports / Logs /
  **+ Add**). Recent opens with a status card, and an item opens full screen with "‹ Back". See
  [reference/prototype/](reference/prototype/).
- **Scope:** one vehicle first, the F-250. It's expected to grow to other vehicles and to any set of logged PIDs.
  - **Generic core:** CSV import, held-row collapse, charts with a channel picker and saved presets, the
    Diagnostic Report viewer, and generic event rules. Those rules cover engine start, peaks, idle, cruise,
    regen when logged, and freeze-frame look-alikes matched against the nearest saved report.
  - **Vehicle profiles:** PID aliases, decode fixes (e.g. the 6.7's EGR position rescale), hidden columns,
    default chart presets.
  - **Rule packs** switched on per vehicle. The first is "6.7 P0401": the low-flow entry window and its notes.
  - **Every report and log gets a vehicle ID from day one.** Reports carry the VIN; CSV logs don't, so
    ask which vehicle when one is added.
- **Events of interest:** about two-thirds of the hand-written events in the original project can be
  detected by rules. The rest is interpretation and owner observations, covered by tap-to-annotate on the
  chart. An optional "Analyze with Claude" step would need a server-side API key, and the app must work
  without it.

## Open questions (for wayfinding)

- Stack: backend language and framework, storage (files plus SQLite?), how the frontend is built.
- Where it runs, how it's reached from the phone (reverse proxy, https for install and offline), and auth.
- How much of the existing viewers to port as is, or rewrite into the core / profile / rule-pack split.
- Rule test set: the original project's six annotated drive logs (events JSON plus CSV) are the natural
  fixtures. Decide how to bring sample data in without committing personal data (VINs).

## Reference

- [reference/viewers/](reference/viewers/): the original single-file viewers and their Node builders, as
  they stood on 2026-10-08. The report viewer already parses reports in the browser. The drive-log viewer
  parses at build time in `build_viewer.js`.
- [reference/prototype/](reference/prototype/): the throwaway layout prototype (variants A–D). Open
  `prototype_phones.html` to see all four at phone size. The prototype embeds built viewer pages that
  aren't in this repo, so its panes will be empty here. It's kept for the layout, not the content.
