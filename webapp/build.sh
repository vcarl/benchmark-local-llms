#!/usr/bin/env bash
set -euo pipefail

# Usage: ./build.sh [path/to/benchmark.json]
# If no argument, looks for the most recent benchmark-*.json in ../results/

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ $# -ge 1 ]; then
  JSON_FILE="$1"
else
  JSON_FILE="$(ls -t ../benchmark-results/benchmark-*.json 2>/dev/null | head -1)"
  if [ -z "$JSON_FILE" ]; then
    echo "Error: No benchmark JSON found. Run 'python benchmark.py --report-only' first, or pass a path."
    exit 1
  fi
fi

echo "Using data: $JSON_FILE"

# Write data.js with benchmark data as a global variable (used by both dev and report builds)
echo "window.__BENCHMARK_DATA = $(cat "$JSON_FILE");" > src/data/data.js

# Extract timestamp from filename for output naming
BASENAME="$(basename "$JSON_FILE" .json)"

# Build
npm run build

# Rename output
if [ -d "dist" ]; then
  OUTPUT_DIR="../benchmark-results/${BASENAME}-report"
  rm -rf "$OUTPUT_DIR"
  mv dist "$OUTPUT_DIR"
  echo "Report built: $OUTPUT_DIR/"
  echo "Open: $OUTPUT_DIR/index.html"
fi
