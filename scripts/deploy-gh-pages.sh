#!/usr/bin/env bash
# Refresh webapp data, build the static bundle, and publish to gh-pages.
# Preflight requires a clean main tree synced with origin/main.
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

worktree_path=".git-gh-pages"

cleanup() {
  if [[ -d "$worktree_path" ]]; then
    git worktree remove --force "$worktree_path" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# --- Preflight ---
current_branch="$(git symbolic-ref --short HEAD)"
if [[ "$current_branch" != "main" ]]; then
  echo "ERROR: must be on main (currently on $current_branch)" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: working tree not clean" >&2
  git status --short >&2
  exit 1
fi

git fetch origin main gh-pages

local_sha="$(git rev-parse HEAD)"
remote_sha="$(git rev-parse origin/main)"
if [[ "$local_sha" != "$remote_sha" ]]; then
  echo "ERROR: HEAD ($local_sha) is not origin/main ($remote_sha)" >&2
  echo "Push or pull first." >&2
  exit 1
fi

short_sha="$(git rev-parse --short "$local_sha")"

# --- Refresh data + build ---
echo "==> Regenerating webapp/src/data/data.js from benchmark-archive/"
./bench report --archive-dir ./benchmark-archive --output webapp/src/data

echo "==> Building webapp/dist/"
(cd webapp && npm run build)

# --- Prepare gh-pages worktree ---
echo "==> Checking out origin/gh-pages into $worktree_path"
if [[ -d "$worktree_path" ]]; then
  git worktree remove --force "$worktree_path"
fi
git worktree add --detach "$worktree_path" origin/gh-pages

# --- Drop fresh bundle at root ---
pushd "$worktree_path" >/dev/null
echo "==> Replacing site root with webapp/dist/"
rm -rf index.html 404.html data.js assets .nojekyll
cp -R "$repo_root/webapp/dist/." .
touch .nojekyll

# --- Commit and push ---
git add -A
if git diff --cached --quiet; then
  echo "==> No changes to deploy"
else
  git -c user.useConfigOnly=true commit -m "deploy: webapp build from main@${short_sha}"
  git push origin HEAD:gh-pages
  echo "==> Deployed main@${short_sha} to origin/gh-pages"
fi
popd >/dev/null
