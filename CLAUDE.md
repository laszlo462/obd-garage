# CLAUDE.md

Rules for working in this repo. Current state and decisions live in [README.md](README.md) (until a
wayfinder map issue exists, at which point that map is the source of truth). Don't copy state into this file.

## Rules

- **No personal data or secrets in the repo.** The repo may be public.
  - Real OBDLink reports and logs contain the VIN. Keep sample data out of git (see `.gitignore`) or scrub
    the VIN before committing a fixture.
  - No personal paths, hostnames, IPs or links to private notes in committed files or commit messages.
  - Never print or hardcode a secret; reference it by environment variable name only.
- **Prefer a pointer over a copy** when documenting code. Point at the code for enumerable facts (routes,
  env vars, file lists) and only write down what the code can't say: the why, the gotchas, the conventions.
- **The app must work without the LLM.** Rule-based events and manual notes are the baseline. Claude
  analysis is an optional add-on behind a server-side key.
- **Keep the layers apart:** generic core, vehicle profiles, rule packs. Vehicle-specific logic (e.g. the
  6.7 P0401 entry window, EGR decode rescale) goes in a profile or rule pack, never in the core.
- **Report text is untrusted.** Parse OBDLink HTML with a DOM parser and insert it as text only, never as
  markup (the reference report viewer does this).
- `reference/` is a frozen snapshot of the original viewers and prototype. Don't edit it. Port from it.

## Subagents

Project agents live in `.claude/agents/` so cloud sessions have them too.

- `explorer` (Haiku, read-only) for lookups like "where is X defined".
- `implementer` (Sonnet) for implementation: one build issue, test-first.
- `shipper` (Haiku) to commit, push and open a PR once the owner asks to ship.
- Merging stays with the owner.

## Agent skills

Skills are vendored in `.claude/skills/` (see `THIRD-PARTY.md` there); the plugin is disabled for this
project. Cloud setup: `docs/agents/cloud-environment.md`.

### Issue tracker

GitHub Issues on this repo, via **`gh api` (REST) only**. `gh issue` / `gh pr` use GraphQL, which fails in
cloud sessions. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
