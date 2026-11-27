# gh-pages static webapp deploy — design

Date: 2026-04-24
Branch: `main` (worktree: `reports-site`)

## Overview

Publish the current webapp at the root of the `gh-pages` branch with fresh archive data, and relocate the existing per-run reports on that branch to `/legacy/`.

Two changes land together:

1. **Collapse the webapp's two build configs into a single static SPA build**, driven by `npm run build` in `webapp/`. Output is a deployable-anywhere static bundle at `webapp/dist/`.
2. **Add a one-shot deploy script** that refreshes archive data, runs the build, and publishes to `gh-pages` with legacy content preserved under `/legacy/benchmark-results/`.

Out of scope: a GitHub Action for automated deploys, regenerating the old per-run HTML format, and any new landing page beyond what the webapp already provides.

## Motivation

`gh-pages` was last updated 2026-04-11 with a flat pile of per-run HTML snapshots. The reporting pipeline has since moved to a unified webapp that reads from `benchmark-archive/*.jsonl` and renders everything in one SPA. The per-run HTML format is no longer produced.

The webapp already has two build configs:

- `npm run build` — TanStack Start SSR build. Emits `dist/client/_shell.html` + `dist/server/server.js`. The client shell requires the server to render; not deployable as static.
- `npm run build:report` — plain Vite build using `vite.report.config.ts`, designed for `file://`. Uses `MemoryHistory` so the URL never updates, which breaks deep links like `/run/:model/:name`.

Neither output is suitable for gh-pages as-is.

## Part 1 — Static SPA build

### Files changed

- **Delete** `webapp/vite.report.config.ts`.
- **Delete** `webapp/report.html` (replaced by a single `index.html`).
- **Rewrite** `webapp/vite.config.ts`: plain Vite + React, no TanStack Start plugin, `base: "./"`, output to `dist/`. Keep a post-build plugin that writes `dist/404.html` as a byte-identical copy of `dist/index.html` (gh-pages SPA fallback).
- **Rewrite** `webapp/src/report-entry.tsx` → keep name and location, but switch from `createMemoryHistory` to `createBrowserHistory` so `/run/:model/:name` updates the address bar and is bookmarkable.
- **Flatten** `webapp/src/routes/__root.tsx` → drop the `<html>`/`<body>` wrapping, `HeadContent`, `Scripts`, and the stylesheet link. Those are TanStack Start conventions that would render invalid nested HTML when the SPA mounts into `<div id="root">`. The static `index.html` owns meta tags and the stylesheet link instead.
- **Create** `webapp/index.html` at the webapp root (the Vite default location). Contains `<div id="root">`, loads `data.js` before the app bundle.
- **Update** `webapp/package.json` scripts: remove `build:report`; `build` is now the static SPA build; `dev` stays as `vite dev`.

### Entry behavior

The SPA entry (`report-entry.tsx`) creates a router with `createBrowserHistory()` and renders it into `#root`. `data.js` runs before the app bundle and populates `globalThis.__BENCHMARK_DATA`, matching the existing loading convention in `src/lib/data.ts`.

No change to `src/router.tsx`, `routeTree.gen.ts`, route files other than `__root.tsx`, components, or `data.js` generation.

### Output layout

After `npm run build`, `webapp/dist/` contains:

```
index.html          # SPA entry, relative asset URLs
404.html            # byte-identical to index.html (gh-pages fallback)
data.js             # copied from webapp/src/data/data.js (Vite public asset or rollup input)
assets/             # hashed JS chunks + CSS
```

`base: "./"` keeps all asset URLs relative. The bundle works whether gh-pages serves it at `https://<user>.github.io/<repo>/` or at a custom domain root.

### data.js handling

`webapp/src/data/data.js` is gitignored and ~14 MB. In production the file is loaded via a `<script>` tag that sets `globalThis.__BENCHMARK_DATA`, which `src/lib/data.ts` reads. `./bench report` writes to `webapp/src/data/data.js`; we don't change that.

Build wiring: a small inline Vite plugin in `vite.config.ts` copies `webapp/src/data/data.js` → `webapp/dist/data.js` in its `writeBundle` hook. If the source file does not exist, the plugin throws with a message: `"data.js missing — run './bench report --output webapp/src/data' before building"`. No fallback to an empty stub; a stale or missing data file should fail the build loudly.

`webapp/index.html` references the copied file with `<script src="./data.js"></script>` placed before the app bundle script tag, preserving the load order `data.js` → app bundle. The relative path works at any gh-pages subpath because `base: "./"` keeps asset URLs relative.

### Risks / tradeoffs

- **`404.html` = `index.html`** means every real 404 serves the app. Acceptable for this site — there are no other paths we care about 404-ing.
- **Bundle size warning** is already present (`constants-*.js` ~14 MB due to embedded data). Unchanged by this work.
- Dropping the TanStack Start config is a one-way door unless someone wants SSR back. Given the comment at the top of `vite.config.ts` that SSR causes hydration mismatches here, SSR is already deliberately disabled; removing the plugin completes that choice.

## Part 2 — Deploy script

### File

New bash script at `scripts/deploy-gh-pages.sh`, invoked from the repo root.

### Steps

1. **Preflight**:
   - Current branch is `main`.
   - Working tree is clean (`git status --porcelain` empty).
   - `origin/main` is reachable; current HEAD is pushed.
   - Abort with a clear message if any check fails.
2. **Refresh data**: `./bench report --archive-dir ./benchmark-archive --output webapp/src/data`.
3. **Build**: `(cd webapp && npm run build)`.
4. **Prepare gh-pages worktree**:
   - `git fetch origin gh-pages`.
   - `git worktree add .git-gh-pages origin/gh-pages` at a fresh path (ignored by `.gitignore`).
   - In the worktree, create a branch tracking `origin/gh-pages`.
5. **Rearrange legacy content** (first-run only, idempotent):
   - If `benchmark-results/` exists at the worktree root and `legacy/benchmark-results/` does not: `git mv benchmark-results legacy/benchmark-results`.
   - If `legacy/benchmark-results/` already exists, skip.
6. **Drop fresh bundle**:
   - `rm -rf` any existing top-level files that the webapp build would replace (`index.html`, `404.html`, `data.js`, `assets/`).
   - `cp -R webapp/dist/* <worktree>/`.
   - Write `.nojekyll` at the worktree root (prevents GitHub's Jekyll preprocessing).
7. **Commit and push**:
   - `git add -A` in the worktree.
   - If tree is unchanged, skip commit.
   - Otherwise commit with message `deploy: webapp build from <short-sha of main>` (include `legacy: moved old reports to legacy/benchmark-results/` in the body on first run).
   - `git push origin HEAD:gh-pages`.
8. **Cleanup**: `git worktree remove .git-gh-pages`.

The script exits non-zero on any failure. No force-push is used — the script always adds commits on top of the existing `gh-pages`.

### `.gitignore`

Add `.git-gh-pages/` to the root `.gitignore` so the temporary worktree never shows up as untracked if the script is interrupted. Remove the now-obsolete `webapp/dist-report/` line from `.gitignore` (generic `dist/` already covers `webapp/dist/`).

## Non-goals

- No GitHub Action. Adding one is straightforward later if the manual script proves painful.
- No landing page other than the webapp itself — its `/` route already lists and filters all runs via `FilterBar` + `ResultTable`.
- No attempt to regenerate the old per-run `-report/` format. The 139 existing timestamped artifacts on `gh-pages` move to `/legacy/` unchanged.

## Acceptance

- `cd webapp && npm run build` exits 0 and produces `webapp/dist/` with `index.html`, `404.html`, `data.js`, and an `assets/` dir.
- Serving `webapp/dist/` via `python3 -m http.server` loads the home route, filter state works, and clicking into a result navigates to `/run/:model/:name` with the URL updating; reload on that URL re-renders the detail page (via the 404 fallback).
- Running `scripts/deploy-gh-pages.sh` on a clean `main`:
  - Pushes a new commit to `origin/gh-pages`.
  - `gh-pages` head contains `index.html`, `404.html`, `data.js`, `assets/`, `.nojekyll` at root, and `legacy/benchmark-results/` with all 139 original artifacts.
  - The `legacy/` path is preserved across subsequent runs.
