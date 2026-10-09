#!/usr/bin/env bash
# Open (or update) an issue when mattpocock/skills has a release newer than the vendored copy.
# Run by .github/workflows/skills-release.yml; also runs locally with gh logged in.
# DRY_RUN=1 prints the writes instead of making them.
set -euo pipefail

UPSTREAM=mattpocock/skills
PREFIX="Re-sync vendored skills to "
REPO="${GITHUB_REPOSITORY:-$(gh api "repos/{owner}/{repo}" --jq .full_name)}"
NOTICE="$(dirname "$0")/../.claude/skills/THIRD-PARTY.md"

write() {
  if [ -n "${DRY_RUN:-}" ]; then echo "DRY_RUN: gh api $*"; else gh api "$@"; fi
}

# The vendored tag or commit, from "**mattpocock/skills <ref>**" (scripts/sync-skills.ts writes it).
current="$(sed -nE 's/.*\*\*mattpocock\/skills ([A-Za-z0-9._-]+)\*\*.*/\1/p' "$NOTICE" | head -n1)"
[ -n "$current" ] || { echo "no vendored version in $NOTICE" >&2; exit 1; }

latest="$(gh api "repos/$UPSTREAM/releases/latest" --jq .tag_name)"
notes="https://github.com/$UPSTREAM/releases/tag/$latest"

# "ahead" means the release has commits the vendored copy lacks. Comparing commits also works
# when the vendored version is a commit rather than a tag.
status="$(gh api "repos/$UPSTREAM/compare/$current...$latest" --jq .status)"
if [ "$status" != "ahead" ]; then
  echo "Up to date: vendored $current, latest release $latest ($status)."
  exit 0
fi

title="$PREFIX$latest"
# Every open sync issue shares the title prefix, so there is at most one to update.
existing="$(gh api "repos/$REPO/issues?state=open&per_page=100" --paginate \
  --jq ".[] | select(.pull_request | not) | select(.title | startswith(\"$PREFIX\")) | \"\(.number)\t\(.title)\"" |
  head -n1)"

body_file="$(mktemp)"
trap 'rm -f "$body_file"' EXIT

if [ -z "$existing" ]; then
  cat >"$body_file" <<EOF
[$UPSTREAM $latest]($notes) is out; the vendored skills are at \`$current\`.

Run \`node scripts/sync-skills.ts $latest\`, review the diff against the release notes, and commit
it. If the sync fails because a listed skill is gone upstream, update the list in
\`.claude/skills/THIRD-PARTY.md\` first.

_Opened by the \`skills-release\` workflow._
EOF
  write --method POST "repos/$REPO/issues" -f title="$title" -F body=@"$body_file" -f "labels[]=needs-triage" --jq .html_url
  exit 0
fi

number="${existing%%$'\t'*}"
old_title="${existing#*$'\t'}"
case "$old_title" in
  "$title" | "$title "*)
    echo "Already tracked in #$number."
    exit 0
    ;;
esac

# An older release's issue is still open: move it to the new release and say why.
old_ref="${old_title#"$PREFIX"}"
old_ref="${old_ref%% *}"
new_title="$title${old_title#"$PREFIX$old_ref"}"
printf '[%s %s](%s) is out, so this now targets %s instead of %s.\n' \
  "$UPSTREAM" "$latest" "$notes" "$latest" "$old_ref" >"$body_file"
write --method POST "repos/$REPO/issues/$number/comments" -F body=@"$body_file" --jq .html_url
write --method PATCH "repos/$REPO/issues/$number" -f title="$new_title" --jq .html_url
