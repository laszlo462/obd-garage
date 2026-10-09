# Cloud environment (claude.ai/code)

How to set up Claude Code cloud sessions (claude.ai/code and the mobile app) for this repo, so the
project can be worked on from a phone without a computer running.

Cloud sessions load only what is committed: the repo's `CLAUDE.md` and `.claude/` (skills, agents,
`settings.json`, hooks). Plugins and anything in a user-level `~/.claude` don't load. That's why the
skills are vendored under `.claude/skills/` (see `.claude/skills/THIRD-PARTY.md`) and the agents live
in `.claude/agents/`.

## One-time setup checklist

1. Grant the Claude GitHub app access to this repository.
2. Create a cloud environment for the repo and set its network access level to **Trusted**
   (the npm registry must be reachable).
3. Paste the setup script below into the environment's setup script field.
4. Start a cloud session and check:
   - `node -v` reports v24. It resolves from `/opt/node22/bin/node`; the directory name is stale
     but the binary is 24 (see the setup script).
   - `/wayfinder`, `/tdd`, `/spec-review`, `/implement-spec` and `/retro` are listed as slash commands.
     Skills with `disable-model-invocation: true` (e.g. `/wayfinder`) are user-only: they show in
     your `/` menu but not in the agent's own skill list, so check the menu, not the agent.
   - The `explorer`, `shipper` and `implementer` agents are listed. Their `model:` pins are honoured
     in cloud sessions.
   - `gh api repos/{owner}/{repo}/issues` returns this repo's issues. `gh auth status` reports the
     token as invalid; ignore it, REST calls go through the session proxy and work.

## Setup script

The images ship Node 20–22; the project needs Node 24 (see `docs/adr/`). The script installs the
official Node 24 binary from the npm registry (`node-linux-x64` / `node-linux-arm64`) and links
every `node` the image ships to it. The image's own npm keeps working on Node 24.

Why not NodeSource or nvm: the Trusted network level blocks `deb.nodesource.com` (the setup failed
with a curl 403), and nvm isn't in the image and downloads from nodejs.org anyway. The npm registry
is on the Trusted allowlist.

```bash
#!/usr/bin/env bash
set -euo pipefail

SUDO=""
[ "$(id -u)" -ne 0 ] && SUDO="sudo"

case "$(uname -m)" in
  x86_64) ARCH=x64 ;;
  aarch64 | arm64) ARCH=arm64 ;;
  *) echo "unsupported arch: $(uname -m)" >&2; exit 1 ;;
esac

PREFIX=/opt/node24
$SUDO mkdir -p "$PREFIX"
$SUDO npm install --prefix "$PREFIX" --no-save --no-audit --no-fund "node-linux-$ARCH@24"
NODE24="$PREFIX/node_modules/node-linux-$ARCH/bin/node"

# The image puts its own node (e.g. /opt/node22/bin) ahead of /usr/local/bin on PATH, so point
# every image node at 24. The image's npm/npx run under whichever node is first on PATH.
for n in /usr/local/bin/node /opt/node*/bin/node $(which -a node); do
  [ -e "$n" ] || [ "$n" = /usr/local/bin/node ] || continue
  $SUDO ln -sf "$NODE24" "$n"
done

hash -r
# Fail loudly if an older node still wins on PATH.
node -v | grep -q '^v24\.' || { echo "node 24 is not first on PATH: $(command -v node) $(node -v)" >&2; exit 1; }
node -v
```

Dependencies are not installed here: the repo's `SessionStart` hook (in `.claude/settings.json`)
runs `npm ci` in cloud sessions once a `package-lock.json` exists.

## What cloud sessions can't do

- **`gh issue` / `gh pr`**: GraphQL is blocked. Use `gh api` REST, as in
  [issue-tracker.md](issue-tracker.md).
- **Personal notes and private infrastructure**: anything outside the repo on the owner's own
  machine or network isn't reachable.
- **Local browser testing**: not confirmed to work. Do browser checks in a local session.
- **Per-implementer worktrees** (`/implement-spec`): not confirmed to work. If they don't, run
  `/implement-spec` locally or implement the tickets one at a time.
- **Merging**: stays with the owner, as locally.
