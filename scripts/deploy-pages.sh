#!/usr/bin/env bash
# Build the static site (snapshots, webapp, llms.txt) and, with --push, publish
# it as a single orphan commit force-pushed to gh-pages. See docs/DEPLOY.md.
#
#   scripts/deploy-pages.sh [--store DIR] [--legacy-root DIR] [--out DIR] [--remote REMOTE] [--push]
#
# Env (the one place the deploy URLs are set):
#   PAGES_ORIGIN  where the bytes are served  (default https://vcarl.github.io/benchmark-local-llms/)
#   SITE_URL      the public, canonical URL   (default https://vcarl.com/evals/)
set -euo pipefail

PAGES_ORIGIN="${PAGES_ORIGIN:-https://vcarl.github.io/benchmark-local-llms/}"
SITE_URL="${SITE_URL:-https://vcarl.com/evals/}"
store="store"
legacy_root="."
out=""
remote="origin"
push=false

usage() { sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }
while [[ $# -gt 0 ]]; do
  case "$1" in
    --store) store="$2"; shift 2 ;;
    --legacy-root) legacy_root="$2"; shift 2 ;;
    --out) out="$2"; shift 2 ;;
    --remote) remote="$2"; shift 2 ;;
    --push) push=true; shift ;;
    *) usage ;;
  esac
done
for u in "$PAGES_ORIGIN" "$SITE_URL"; do
  [[ "$u" == */ ]] || { echo "ERROR: $u must end in /" >&2; exit 2; }
done

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

# --- Preflight ---
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "ERROR: tracked changes in the working tree; commit them first" >&2
  git status --short --untracked-files=no >&2
  exit 1
fi
if [[ -z "$out" ]]; then
  out="$(mktemp -d "${TMPDIR:-/tmp}/deploy-pages.XXXXXX")"
elif [[ -e "$out" && -n "$(ls -A "$out")" ]]; then
  # The webapp build empties its output directory.
  echo "ERROR: --out $out exists and is not empty" >&2
  exit 1
fi
mkdir -p "$out"
out="$(cd "$out" && pwd)"
short_sha="$(git rev-parse --short HEAD)"

# --- Build ---
echo "==> Snapshots → webapp/public/snapshots/ (store $store, legacy root $legacy_root)"
./bench report --store "$store" --legacy-root "$legacy_root"

echo "==> Webapp → $out (assets and data from $PAGES_ORIGIN, canonical $SITE_URL)"
(cd webapp && PAGES_ORIGIN="$PAGES_ORIGIN" SITE_URL="$SITE_URL" npx vite build --outDir "$out" --emptyOutDir)

echo "==> llms.txt and markdown pages"
node_modules/.bin/tsx webapp/src/llms/cli.ts "$out" --site-url "$SITE_URL" --data-origin "$PAGES_ORIGIN"
touch "$out/.nojekyll"

files="$(find "$out" -type f | wc -l | tr -d ' ')"
bytes="$(find "$out" -type f -exec stat -f%z {} + | awk '{s += $1} END {print s}')"
md_bytes="$(find "$out" -type f \( -name index.html -o -name '*.md' -o -name 'llms.txt' \) -exec stat -f%z {} + | awk '{s += $1} END {print s}')"
echo "==> Site: $out"
echo "    $files files, $bytes bytes; $md_bytes bytes of it (index.html, llms.txt, *.md) are served through $SITE_URL"

if [[ "$push" != true ]]; then
  echo "==> Not pushed. Inspect $out, then rerun with --push to publish."
  exit 0
fi

# --- Publish: one orphan commit replaces gh-pages, so its history never grows ---
git_dir="$(mktemp -d "${TMPDIR:-/tmp}/deploy-pages-git.XXXXXX")"
pub() { git --git-dir="$git_dir" --work-tree="$out" "$@"; }
pub init -q -b gh-pages
pub add -A
pub -c user.useConfigOnly=true commit -q -m "deploy: site from ${short_sha}"
remote_url="$(git remote get-url "$remote" 2>/dev/null || echo "$remote")"
echo "==> Force-pushing gh-pages to $remote_url"
pub push --force "$remote_url" gh-pages:gh-pages
rm -rf "$git_dir"
echo "==> Deployed ${short_sha} to gh-pages"
