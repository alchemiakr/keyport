#!/usr/bin/env bash
set -euo pipefail

# Apply only upstream changes, preserving deployment-specific edits via a three-way merge.
baseline=$(cat .keyport-upstream)
target=$(git rev-parse --verify "${1:?upstream commit required}^{commit}")
[[ "$baseline" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid upstream baseline' >&2; exit 1; }
git merge-base --is-ancestor "$baseline" "$target" || { echo 'Upstream history diverged; manual review required' >&2; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo 'Working tree must be clean' >&2; exit 1; }
patch=$(mktemp)
trap 'rm "$patch"' EXIT
git diff --binary "$baseline" "$target" -- . ':!.keyport-upstream' > "$patch"
if [[ -s "$patch" ]]; then
  git apply --3way --index "$patch"
fi
printf '%s\n' "$target" > .keyport-upstream
git add .keyport-upstream
