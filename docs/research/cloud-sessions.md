# Claude Code cloud sessions: what the repo must carry

Resolves wayfinder research issue #2. Researched 2026-10-08 against the official Claude Code docs only.

Sources (all first-party):

- [Cloud sessions](https://code.claude.com/docs/en/claude-code-on-the-web) ("Cloud sessions page")
- [Cloud environments](https://code.claude.com/docs/en/cloud-environments) ("Environments page")
- [Settings, "Settings in cloud sessions"](https://code.claude.com/docs/en/settings#settings-in-cloud-sessions)

## Short answer

A cloud session is a fresh Ubuntu VM with a fresh clone of the repo. Anything committed in the repo
arrives; anything that lives only on the owner's machine does not. The big surprise: **plugins declared
in the project `.claude/settings.json` are not installed in cloud sessions.**

## Findings

### 1. Project plugins (`enabledPlugins` / `extraKnownMarketplaces`)

- **Not honoured.** The Environments page ("What carries over from your setup") says a cloud session
  doesn't install plugins a repo turns on under `enabledPlugins`, including ones from marketplaces listed
  under `extraKnownMarketplaces`. The Settings page repeats this.
- Plugins enabled only in user settings also do not carry over (same table).
- This covers `mattpocock-skills` from `claude-plugins-official` and a community plugin like `ste-prompt`.
  Neither can be relied on in the cloud via settings.
- Practical alternatives the docs support: commit the needed skills/agents/commands as files in the repo's
  `.claude/` directory ("Commit them to the repo's `.claude/` directory instead").
- The docs also say cloud sessions "automatically load skills you enable on claude.ai". Which skills
  count and whether plugin skills are included is not specified.
- NOT CONFIRMED: whether a setup script could install a plugin (for example with a `claude plugin` CLI
  command). The docs do not describe this. Also not confirmed: whether the `/plugin` command is
  unavailable (the Cloud sessions page says terminal-only commands such as `/plugin` are not available).

### 2. Project subagents

- `.claude/agents/`, `.claude/skills/`, `.claude/commands/`, `.claude/rules/` in the repo are all
  available (Environments page table, "Part of the clone").
- The Cloud sessions page: "Subagents defined in your repo's `.claude/agents/` are picked up automatically."
- User-level `~/.claude/agents/`, `~/.claude/skills/`, `~/.claude/commands/` are not available. The
  existing `explorer` and `shipper` agents live at user level, so they must be copied into the repo to
  exist in the cloud.
- NOT CONFIRMED: whether a pinned `model:` in agent frontmatter is honoured in the cloud. The docs don't
  say it isn't; they say subagents "work the same way they do locally". The `/model` command exists in
  cloud sessions, and `availableModels` from server-managed settings is enforced there.

### 3. How the environment is defined

- **Setup script**: configured in the web UI (environment dialog at claude.ai/code), not in the repo.
  A Bash script run as root before Claude starts. Must exit 0 (non-zero fails the session) and finish in
  about five minutes so the result can be cached. The cache keeps files (packages, Docker images), not
  running processes, and rebuilds when the script or allowed hosts change, or after about seven days.
- **SessionStart hook**: lives in the repo's `.claude/settings.json`, so it IS versioned. It runs on
  every session including resumed ones, after Claude starts, locally and in the cloud. The docs' example
  guards cloud-only work with `CLAUDE_CODE_REMOTE=true`. Only read in a session with exactly one repo.
  Use the hook for project setup (`npm install`); use the setup script for tools not preinstalled.
- **Environment choice**: personal environments; the Default one is created at onboarding. `/remote-env`
  sets the default for `claude --cloud`.
- **Node version**: Node 20, 21 and 22 are installed, 22 on `PATH` by default. Node 24 (used locally)
  is not listed. .NET is explicitly not preinstalled ("such as the .NET SDK"); install via a setup script.
  Also preinstalled: Python 3.x, git, gh, jq, ripgrep, PostgreSQL 16, Redis 7.
- Resources: about 4 vCPU, 16 GB RAM, 30 GB disk (approximate, may change).

### 4. Network access

- Four levels: None, Trusted (default), Full, Custom (own allowlist, optionally plus the defaults).
- Trusted allowlist includes GitHub hosts, npm (`registry.npmjs.org`), Docker Hub, `mcr.microsoft.com`,
  `packages.microsoft.com`, `dotnet.microsoft.com`, and nuget.org (Environments page, "Default allowed domains").
- GitHub traffic goes through a separate proxy regardless of level. The proxy blocks GraphQL, so
  `gh pr` and `gh issue` fail in the cloud; use `gh api repos/{owner}/{repo}/...` (REST). Branch
  deletes and tag pushes are rejected.
- At level None, installs fail; the Anthropic API stays reachable.
- Calling the Claude API from the app's tests needs `api.anthropic.com`, which stays reachable.

### 5. Env vars and secrets

- Environment variables are set per environment in the web UI in `.env` format. **Anyone who uses the
  environment can read them**, so the docs advise against secrets there.
- Pro/Max plans: "network secrets" attach a key to requests for hosts you list, outside the VM, so the
  session never sees the key. Not available on Team/Enterprise. It never applies to GitHub, the Anthropic
  API, or public package registries, and does not apply during the setup script.
- Env vars are re-read each time Claude starts in the VM; edits don't reach a running session until
  its VM restores.
- GitHub needs no token: `GH_TOKEN`/`GITHUB_TOKEN` read as `proxy-injected` and the proxy substitutes
  the real credential.
- For this repo: the optional Claude analysis key would be a server-side runtime secret and is not
  needed to build or test the app (the app must work without the LLM).

### 6. What to restate from the user-level `CLAUDE.md`

- User-level `~/.claude/CLAUDE.md`, `~/.claude/settings.json`, user hooks and `settings.local.json`
  are not read in the cloud.
- The repo's own `CLAUDE.md` is read. So any rule the cloud session needs must be stated there, in
  generic form with no personal paths, hosts or secrets.
- Candidates from the user file that matter in the cloud: the subagent policy (spawning allowed,
  implementation on Sonnet), the "keep personal details out of repos" rule, and commit/PR attribution
  conventions. Environment notes for Windows, WSL Docker, Edge and local Node 24 do not apply in the cloud.
- The docs offer a way to keep personal preferences out of the repo: a setup script that writes
  `~/.claude/CLAUDE.md` inside the VM (Environments page, "Add personal preferences without committing
  to the repo"). Put it on a personal environment, not a shared one. The setup script text is visible
  to anyone using the environment, so no secrets in it.

### 7. Limits that affect development

- **Docker**: docker, dockerd and docker compose are preinstalled. `docker compose up` works; pulls follow
  the network level and Docker Hub is in Trusted. Pre-pull in the setup script so it is cached. Running
  containers are not cached between sessions.
- **Long-running work**: foreground command default timeout 2 min, max 10 min; timed-out commands move
  to the background and are killed after 30 more minutes. Idle sessions pause after a few minutes; a
  paused VM can be reclaimed, which stops background processes (subagents, shell commands).
  `BASH_DEFAULT_TIMEOUT_MS` and `BASH_MAX_TIMEOUT_MS` env vars raise the limits.
- **Dev servers / browser testing**: NOT CONFIRMED. The docs list `chromedriver` but no browser, and say
  nothing about exposing a port or viewing a rendered page. The user can't open a shell in the VM ("You
  don't get a shell into the session VM"). Plan to verify through headless tests in the VM, not a
  human-visible preview. Whether a headless Chromium can be installed from the allowlisted hosts was
  not checked.
- **Several repos**: a session with more than one repo ignores repo hooks, MCP config, and settings.
- **Multiple-platform**: the VM is x86_64 Linux; use Linux builds of native dependencies.
- **Slash commands**: terminal-only commands such as `/plugin` and `/resume` are unavailable; `/clear` doesn't work.
- Cloud sessions are GitHub-only for clone and PR; usage counts against the plan's limits.

## Implication for "What goes in the repo's .claude/ for cloud work?"

Commit: `CLAUDE.md` rules, `.claude/agents/*.md`, any needed `.claude/skills/` copied out of plugins,
a SessionStart hook in `.claude/settings.json` that installs dependencies (guarded by
`CLAUDE_CODE_REMOTE`). Configure outside the repo (web UI): network level, env vars, setup script (for
tools such as the .NET SDK, if ever needed, and Docker image pre-pull). Do not rely on `enabledPlugins`.
