# CLAUDE.md

Rules for working in this repo. Current state and decisions live in [README.md](README.md) (until a
wayfinder map issue exists, at which point that map is the source of truth). Don't copy state into this file.

## Rules

- **No personal vehicle data in the repo.** Real OBDLink reports and logs contain the VIN. Keep sample data
  out of git (see `.gitignore`) or scrub the VIN before committing a fixture.
- **The app must work without the LLM.** Rule-based events and manual notes are the baseline. Claude
  analysis is an optional add-on behind a server-side key.
- **Keep the layers apart:** generic core, vehicle profiles, rule packs. Vehicle-specific logic (e.g. the
  6.7 P0401 entry window, EGR decode rescale) goes in a profile or rule pack, never in the core.
- **Report text is untrusted.** Parse OBDLink HTML with a DOM parser and insert it as text only, never as
  markup (the reference report viewer does this).
- `reference/` is a frozen snapshot of the original viewers and prototype. Don't edit it. Port from it.

## Agent skills

### Issue tracker

GitHub Issues on this repo, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
