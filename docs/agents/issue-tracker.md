# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use **`gh api` (the REST API) for every
operation**, never `gh issue` / `gh pr`: those use GraphQL, which is blocked in Claude Code cloud
sessions. The same commands then work locally and in the cloud.

Inside a clone, `gh api` fills in `{owner}` and `{repo}` from the git remote, so the commands below
can be run as written. `-f key=value` sends a string, `-F key=value` sends a typed value (numbers,
booleans), and `-F body=@<file>` reads the body from a file. Write body files to a temp directory,
never inside the repo.

The issues endpoints also return pull requests (they share one number space). Filter them out of
listings with `select(.pull_request | not)`.

## Conventions

- **Create an issue**:
  `gh api --method POST repos/{owner}/{repo}/issues -f title="..." -F body=@<file> -f "labels[]=<label>" --jq .number`.
  Repeat `-f "labels[]=..."` for more labels.
- **Read an issue**:
  `gh api repos/{owner}/{repo}/issues/<n> --jq '{number, title, state, body, labels: [.labels[].name]}'`,
  then its comments with
  `gh api repos/{owner}/{repo}/issues/<n>/comments --paginate --jq '.[] | {user: .user.login, body}'`.
- **List issues**:
  `gh api "repos/{owner}/{repo}/issues?state=open&labels=<label>&per_page=100" --paginate --jq '.[] | select(.pull_request | not) | {number, title, labels: [.labels[].name]}'`.
  `labels=` takes a comma-separated list (all must match). Read the bodies and comments of
  the issues you care about with the read command above.
- **Comment on an issue**: `gh api --method POST repos/{owner}/{repo}/issues/<n>/comments -F body=@<file>`
- **Apply a label**: `gh api --method POST repos/{owner}/{repo}/issues/<n>/labels -f "labels[]=<label>"`
- **Remove a label**: `gh api --method DELETE repos/{owner}/{repo}/issues/<n>/labels/<label>`
  (write `:` as `%3A`, e.g. `wayfinder%3Amap`).
- **Close**: post the closing comment first, then
  `gh api --method PATCH repos/{owner}/{repo}/issues/<n> -f state=closed -f state_reason=completed`
  (`state_reason=not_planned` for won't-fix).
- **Assign**: `gh api --method POST repos/{owner}/{repo}/issues/<n>/assignees -f "assignees[]=<login>"`.
  The REST API has no `@me`; get your login with `gh api user --jq .login`. In a cloud session that
  call may be refused (app token); ask the owner for the login instead.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues:

- **Read a PR**: `gh api repos/{owner}/{repo}/pulls/<n> --jq '{number, title, body, user: .user.login, author_association}'`,
  comments as for issues, and the diff with
  `gh api repos/{owner}/{repo}/pulls/<n> -H "Accept: application/vnd.github.diff"`.
- **List external PRs for triage**:
  `gh api "repos/{owner}/{repo}/pulls?state=open&per_page=100" --paginate --jq '.[] | select(.author_association | IN("CONTRIBUTOR", "FIRST_TIME_CONTRIBUTOR", "NONE")) | {number, title, user: .user.login, labels: [.labels[].name]}'`
  (drops `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label**: the issue endpoints above, with the PR number.
- **Close**: `gh api --method PATCH repos/{owner}/{repo}/pulls/<n> -f state=closed`.

A bare `#42` may be an issue or a PR. Resolve it with
`gh api repos/{owner}/{repo}/issues/42 --jq 'if .pull_request then "pr" else "issue" end'`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Read the issue and its comments as above.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

Sub-issue and dependency endpoints take an issue's numeric **database id**
(`gh api repos/{owner}/{repo}/issues/<n> --jq .id`), _not_ the `#number` or `node_id`.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body.
  Create it as above with `-f "labels[]=wayfinder:map"`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue:
  `gh api --method POST repos/{owner}/{repo}/issues/<map>/sub_issues -F sub_issue_id=<child-db-id>`.
  Where sub-issues aren't enabled, add the child to a task list in the map body and put
  `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>`
  (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies**, the canonical, UI-visible representation.
  Add an edge with
  `gh api --method POST repos/{owner}/{repo}/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`.
  GitHub reports `issue_dependencies_summary.blocked_by` on the issue (open blockers only, the live
  gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the
  top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children,
  `gh api repos/{owner}/{repo}/issues/<map>/sub_issues --paginate --jq '.[] | select(.state == "open") | {number, title, assignees: [.assignees[].login], blocked_by: .issue_dependencies_summary.blocked_by}'`
  (or the task list in the map body), drop any with an open blocker (`blocked_by > 0`, or an open
  issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: assign the ticket to yourself (see **Assign**), the session's first write.
- **Resolve**: comment the answer, close the ticket, then append a context pointer (gist + link) to
  the map's Decisions-so-far by editing the map body:
  `gh api --method PATCH repos/{owner}/{repo}/issues/<map> -F body=@<file>`.
