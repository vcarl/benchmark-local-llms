#!/usr/bin/env bash
# Build the snapshots of every dataset manifest into webapp/public/snapshots/
# and the static report bundle into webapp/dist/. The output is a portable bundle
# that works at any mount point on gh-pages without rebuild.
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

echo "==> Building webapp/public/snapshots/ from datasets/"
./bench report

echo "==> Building webapp/dist/"
(cd webapp && npm run build)

echo "==> Done. Output at webapp/dist/"
