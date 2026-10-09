# Third-party skills

The skills in this folder are copied from **mattpocock-skills v1.2.3**
(<https://github.com/mattpocock/skills>), MIT licensed, © 2026 Matt Pocock. They are vendored so
that Claude Code cloud sessions, which don't load plugins, get the same slash commands as local
sessions. The plugin is disabled for this project in `.claude/settings.json`, so local sessions use
these copies too and there are no `mattpocock-skills:` duplicates.

## Copied skills

Each folder is copied unchanged, reference files included:

- Build: `tdd`, `codebase-design`, `diagnosing-bugs`, `resolving-merge-conflicts`,
  `domain-modeling`, `research`
- Planning: `wayfinder`, `grilling`, `prototype`, `triage`, `to-tickets`
- `spec-review`: upstream `code-review`, renamed (folder and `name:` only) because it clashes
  with Claude Code's built-in `/code-review`. Upstream text that mentions the `code-review` skill
  (e.g. in `tdd`) means `spec-review` here.

## Re-syncing

To update, replace each listed folder with the same folder from a newer release (upstream keeps
them under `skills/engineering/` and `skills/productivity/`), re-apply the `spec-review` rename,
and update the version above. Don't edit the copies otherwise; project conventions belong in
`CLAUDE.md` and `docs/agents/`, which the skills read.

## Licence

```
MIT License

Copyright (c) 2026 Matt Pocock

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
