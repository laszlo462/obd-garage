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
   (package registries and the NodeSource/nvm downloads must be reachable).
3. Paste the setup script below into the environment's setup script field.
4. Start a cloud session and check:
   - `node -v` reports v24.
   - `/wayfinder`, `/tdd`, `/spec-review`, `/implement-spec` and `/retro` are listed as slash commands.
   - The `explorer`, `shipper` and `implementer` agents are listed.
   - `gh api repos/{owner}/{repo}/issues` returns this repo's issues.

## Setup script

The images ship Node 20–22; the project needs Node 24 (see `docs/adr/`). The script uses nvm when
the image has it, otherwise installs Node 24 from NodeSource, and makes 24 the default either way.

```bash
#!/usr/bin/env bash
set -eo pipefail  # no -u: nvm.sh reads unset variables

SUDO=""
[ "$(id -u)" -ne 0 ] && SUDO="sudo"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
  nvm install 24
  nvm alias default 24
  # Put node 24 first on PATH for shells that don't load nvm.
  NODE_BIN="$(dirname "$(nvm which 24)")"
  for tool in node npm npx; do
    $SUDO ln -sf "$NODE_BIN/$tool" "/usr/local/bin/$tool"
  done
else
  curl -fsSL https://deb.nodesource.com/setup_24.x | $SUDO bash -
  $SUDO apt-get install -y nodejs
fi

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
