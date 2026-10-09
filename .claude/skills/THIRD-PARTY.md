# Third-party skills

The skills in this folder are copied from **mattpocock/skills c55ee46**
(<https://github.com/mattpocock/skills>; a release tag or commit), MIT licensed, © 2026 Matt
Pocock. They are vendored so that Claude Code cloud sessions, which don't load plugins, get the
same slash commands as local sessions. The plugin is disabled for this project in `.claude/settings.json`, so local sessions use
these copies too and there are no `mattpocock-skills:` duplicates.

## Copied skills

Each folder is copied from upstream with its reference files. `scripts/sync-skills.ts` reads this
list; a line `local = upstream` vendors an upstream skill under another name.

```skills
tdd
codebase-design
diagnosing-bugs
resolving-merge-conflicts
domain-modeling
research
wayfinder
grilling
prototype
triage
to-tickets
spec-review = code-review
```

## Project edits

The copies are otherwise unchanged, apart from this:

- `spec-review` is upstream `code-review`, renamed because it clashes with Claude Code's built-in
  `/code-review`. Every mention of an upstream name in the copies is rewritten to the local name,
  so skills that call the review skill (e.g. `tdd`) reach `spec-review`.

Don't edit the copies by hand; the next sync overwrites them. Project conventions belong in
`CLAUDE.md` and `docs/agents/`, which the skills read.

## Re-syncing

```bash
node scripts/sync-skills.ts <tag>
```

This replaces each listed folder with the release's copy, re-applies the project edits, and updates
the version above and the licence below. It fails, changing nothing, if a listed skill is missing
from the release; then update the list. Review the result with `git diff` and commit it yourself.
The weekly `skills-release` workflow opens an issue when a newer release is out.

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
