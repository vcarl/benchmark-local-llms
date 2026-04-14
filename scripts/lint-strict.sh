#!/usr/bin/env bash
# lint-strict.sh — enforces structural requirements that Biome cannot check.
# Runs alongside `biome check` as part of the `lint` script.
#
# Banned patterns (with allowed exceptions):
#   - try/catch  → use Effect error channels
#   - throw      → use Effect.fail() or typed errors
#   - console.*  → use Effect logging service
set -euo pipefail

errors=0

# Only enforce if src/ exists (allows running on a fresh checkout before TS project is scaffolded)
if [ ! -d src ]; then
  echo "lint-strict: src/ not found, skipping (no TypeScript project yet)"
  exit 0
fi

# Ban try/catch except in explicitly allowed files.
# - src/cli/main.ts: top-level entry point, Effect runtime boundary
# - src/interop/: Python subprocess interop bridges to Effect
if grep -rn 'try\s*{' src/ --include='*.ts' | grep -v 'src/cli/main.ts' | grep -v 'src/interop/'; then
  echo "ERROR: try/catch found outside allowed files. Use Effect error channels instead."
  errors=$((errors + 1))
fi

# Ban throw statements except in interop bridges.
if grep -rn 'throw ' src/ --include='*.ts' | grep -v 'src/interop/'; then
  echo "ERROR: throw statement found. Use Effect.fail() or typed errors instead."
  errors=$((errors + 1))
fi

# Ban console.* except in the CLI layer (where stdout/stderr output is the product).
if grep -rn 'console\.' src/ --include='*.ts' | grep -v 'src/cli/'; then
  echo "ERROR: console.* found. Use Effect logging service instead."
  errors=$((errors + 1))
fi

if [ "$errors" -gt 0 ]; then
  echo "Strict lint check failed with $errors violation(s)."
  exit 1
fi

echo "Strict lint checks passed."
