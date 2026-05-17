#!/usr/bin/env bash
# Refresh webapp/src/data/data.js from benchmark-archive/ and build the
# static report bundle into webapp/dist/. No deployment, no git operations.
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

echo "==> Regenerating webapp/src/data/data.js from benchmark-archive/"
./bench report --archive-dir ./benchmark-archive --output webapp/src/data

echo "==> Building webapp/dist/"
(cd webapp && npm run build)

echo "==> Done. Output at webapp/dist/"
