# gh-pages static webapp deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the webapp's `npm run build` into a static SPA bundle deployable on `gh-pages`, and add a one-shot deploy script that refreshes archive data, builds, and publishes to `gh-pages` with the existing per-run reports preserved under `/legacy/`.

**Architecture:** Replace TanStack Start's SSR build config with plain Vite + React targeting a static bundle in `webapp/dist/`. Use `createBrowserHistory` so deep links update the URL; emit a `404.html` copy of `index.html` as the gh-pages SPA fallback; copy `webapp/src/data/data.js` into the build output via an inline Vite plugin. A bash deploy script wraps `./bench report` + `webapp build` and pushes to `gh-pages` via a detached worktree, moving existing `benchmark-results/` into `legacy/benchmark-results/` on first run.

**Tech Stack:** Vite 7, React 19, `@tanstack/react-router` (not `@tanstack/react-start`), bash, git worktrees.

**Spec:** `docs/superpowers/specs/2026-04-24-gh-pages-static-webapp-deploy-design.md`

---

## File Structure

**Create:**
- `webapp/index.html` — SPA entry at webapp root (Vite's default location)
- `scripts/deploy-gh-pages.sh` — deploy script, invoked from repo root

**Modify:**
- `webapp/vite.config.ts` — plain Vite + React, no TanStack Start; inline `dataJsPlugin` + `write404HtmlPlugin`
- `webapp/src/report-entry.tsx` — switch `createMemoryHistory` → `createBrowserHistory`
- `webapp/src/routes/__root.tsx` — drop the `<html>`/`<body>` shell, `HeadContent`, `Scripts`, and the stylesheet link (all owned by static `index.html` now)
- `webapp/package.json` — remove `build:report` script
- `.gitignore` (repo root) — add `.git-gh-pages/`; remove now-obsolete `webapp/dist-report/`

**Delete:**
- `webapp/vite.report.config.ts`
- `webapp/report.html`

---

### Task 1: Flatten `__root.tsx` to a plain route component

**Files:**
- Modify: `webapp/src/routes/__root.tsx`

The current `__root.tsx` renders a full `<html><body>` document and uses TanStack Start's `HeadContent` / `Scripts` — conventions that belong to an SSR pipeline. For a plain SPA mounting into `<div id="root">`, the root route should only render the app outlet. Meta tags and the stylesheet link move into the static `index.html` (Task 3).

- [ ] **Step 1.1: Replace the file contents**

```tsx
import { Outlet, createRootRoute } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return <Outlet />;
}
```

- [ ] **Step 1.2: Verify the app still typechecks**

Run from the worktree root: `cd webapp && npx tsc --noEmit`
Expected: exits 0. No references to `HeadContent`, `Scripts`, or the removed `head` option anywhere.

- [ ] **Step 1.3: Commit**

```bash
git add webapp/src/routes/__root.tsx
git commit -m "refactor(webapp): drop SSR shell from __root route

HTML/body wrapping and stylesheet link move to the static index.html;
route components only render the app outlet."
```

---

### Task 2: Switch report entry to `createBrowserHistory`

**Files:**
- Modify: `webapp/src/report-entry.tsx`

`createMemoryHistory` never updates the address bar — clicking into a result detail page kept the URL at `/`, so deep links and reload-on-detail didn't work. Switch to `createBrowserHistory` so the URL tracks navigation; the 404.html fallback (Task 3) lets gh-pages serve the SPA on any deep-link path.

- [ ] **Step 2.1: Replace the file contents**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter, createBrowserHistory } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

const router = createRouter({
  routeTree,
  history: createBrowserHistory(),
  scrollRestoration: true,
});

const root = createRoot(document.getElementById("root")!);
root.render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
```

- [ ] **Step 2.2: Typecheck**

Run: `cd webapp && npx tsc --noEmit`
Expected: exits 0. `createBrowserHistory` is re-exported by `@tanstack/react-router` (sourced from `@tanstack/history`).

- [ ] **Step 2.3: Commit**

```bash
git add webapp/src/report-entry.tsx
git commit -m "feat(webapp): use browser history in SPA entry

Swaps createMemoryHistory for createBrowserHistory so URL state tracks
route navigation. Required for bookmarkable run detail pages on gh-pages."
```

---

### Task 3: Create static `webapp/index.html`

**Files:**
- Create: `webapp/index.html`

Vite treats a file named `index.html` at the project root as the default build entry; no rollup `input` override needed. This file owns the meta tags and stylesheet link that `__root.tsx` gave up in Task 1, and it script-loads `data.js` before the app bundle so `globalThis.__BENCHMARK_DATA` is populated by the time `src/lib/data.ts` reads it.

- [ ] **Step 3.1: Write the file**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Benchmark Analysis</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <div id="root"></div>
    <script src="%BASE_URL%data.js"></script>
    <script type="module" src="/src/report-entry.tsx"></script>
  </body>
</html>
```

Notes:
- `href="/styles.css"` resolves to `webapp/public/styles.css` during `vite dev` (public assets are served at root) and gets rewritten by Vite at build time to `<base>/styles.css`.
- `src="%BASE_URL%data.js"` uses Vite's HTML placeholder, which Vite substitutes with the resolved `base` value at both dev serve and build time. `data.js` isn't in Vite's module graph, so it needs the placeholder to get the `base` prefix — a plain `./data.js` stays unchanged.
- `type="module"` on the app bundle is what Vite expects for its default build; this is a web-hosted site, not `file://`, so module scripts are fine.

- [ ] **Step 3.2: Commit**

```bash
git add webapp/index.html
git commit -m "feat(webapp): add static index.html for SPA build

Defines the HTML shell Vite bundles against. Loads data.js before the
app bundle so globalThis.__BENCHMARK_DATA is populated at module eval."
```

---

### Task 4: Rewrite `vite.config.ts` as a plain SPA build

**Files:**
- Modify: `webapp/vite.config.ts`
- Modify: `webapp/package.json` (add `@tanstack/router-plugin` as direct devDependency)
- Modify: `webapp/src/routes/index.tsx` and `webapp/src/routes/run.$model.$name.tsx` (switch imports from `../lib/data-dev` to `../lib/data`)

Remove the TanStack Start plugin; swap in `@tanstack/router-plugin/vite` (which regenerates `src/routeTree.gen.ts` when route files change — previously provided transitively by `@tanstack/react-start`). Add two small inline plugins: `dataJsPlugin` makes `data.js` work in both dev (served via middleware) and build (copied into `dist/`); `write404HtmlPlugin` copies `dist/index.html` to `dist/404.html` for the gh-pages SPA fallback.

Also switch route files to import from `../lib/data` (the production module that reads `globalThis.__BENCHMARK_DATA`) rather than `../lib/data-dev` (a dev convenience that statically `import`s `../data/data.js`). The dev-dev path bundles the 14 MB data file into the app chunk AND prevents `dataJsPlugin`'s error handler from running — Rollup fails during module resolution before `writeBundle`. The production import keeps the bundle small and lets the plugin own data provisioning for both dev and build.

- [ ] **Step 4.1a: Add `@tanstack/router-plugin` as an explicit devDependency**

It's currently reachable only transitively through `@tanstack/react-start`. Making it direct means the build config keeps working if react-start is ever removed from dependencies.

Run from the worktree root: `cd webapp && npm install --save-dev @tanstack/router-plugin`
Expected: exits 0; `package.json` gains `"@tanstack/router-plugin": "^1"` under `devDependencies`.

- [ ] **Step 4.1c: Switch route files to import from `../lib/data`**

Edit `webapp/src/routes/index.tsx`:

```diff
-import { DATA, uniqueSorted, modelFamily, modelSizeRange, SIZE_RANGES } from "../lib/data-dev";
+import { DATA, uniqueSorted, modelFamily, modelSizeRange, SIZE_RANGES } from "../lib/data";
```

Edit `webapp/src/routes/run.$model.$name.tsx`:

```diff
-import { DATA } from "../lib/data-dev";
+import { DATA } from "../lib/data";
```

This removes the only remaining imports of `data-dev.ts`. The file becomes unused and can be deleted in a later cleanup, but this plan leaves it untouched to keep Task 4 scope focused.

- [ ] **Step 4.1b: Replace the file contents**

```ts
import { defineConfig, type Plugin } from "vite";
import viteReact from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import path from "node:path";
import fs from "node:fs";

// Serves webapp/src/data/data.js at /data.js in dev and copies it to
// dist/data.js at build time. `./bench report --output webapp/src/data`
// writes the source file; the build fails loudly if it's missing so a
// stale deploy is impossible.
function dataJsPlugin(): Plugin {
  const srcPath = path.resolve(__dirname, "src/data/data.js");
  let baseUrl = "/";
  return {
    name: "data-js",
    configResolved(config) {
      baseUrl = config.base;
    },
    configureServer(server) {
      server.middlewares.use(`${baseUrl}data.js`, (_req, res, next) => {
        if (!fs.existsSync(srcPath)) return next();
        res.setHeader("Content-Type", "application/javascript");
        fs.createReadStream(srcPath).pipe(res);
      });
    },
    writeBundle(options) {
      if (!fs.existsSync(srcPath)) {
        throw new Error(
          "data.js missing — run './bench report --output webapp/src/data' before building",
        );
      }
      const destPath = path.resolve(options.dir ?? "dist", "data.js");
      fs.copyFileSync(srcPath, destPath);
    },
  };
}

// gh-pages serves 404.html as a fallback for any path that doesn't exist
// on disk. Duplicating index.html as 404.html makes the SPA handle every
// deep-link URL client-side after reload.
function write404HtmlPlugin(): Plugin {
  return {
    name: "write-404-html",
    writeBundle(options) {
      const indexPath = path.resolve(options.dir ?? "dist", "index.html");
      const notFoundPath = path.resolve(options.dir ?? "dist", "404.html");
      if (fs.existsSync(indexPath)) {
        fs.copyFileSync(indexPath, notFoundPath);
      }
    },
  };
}

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    viteReact(),
    dataJsPlugin(),
    write404HtmlPlugin(),
  ],
  base: "/benchmark-local-llms/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
```

Why `base: "/benchmark-local-llms/"`: the site deploys to `https://vcarl.github.io/benchmark-local-llms/` (GitHub Pages project page). Relative paths like `./assets/...` would break on deep-link hard-reload, because gh-pages serves `404.html` while the browser URL is at e.g. `/benchmark-local-llms/run/model/name`, making `./assets/...` resolve to `/benchmark-local-llms/run/model/assets/...` — 404. An absolute `base` makes Vite emit fully-qualified paths like `/benchmark-local-llms/assets/index-<hash>.js` that always resolve correctly regardless of the browser's current URL. If the repo is ever renamed, update this string.

The `tanstackRouter` plugin must run before `viteReact()` so generated route files are transformed by the React plugin.

- [ ] **Step 4.2: Run the build**

Run from the worktree root: `cd webapp && npm run build`
Expected: exits 0. Output includes `✓ built in ...`, no references to `ssr`, `server.js`, or `_shell.html`.

- [ ] **Step 4.3: Inspect the output tree**

Run: `cd webapp && ls dist && ls dist/assets`
Expected: `dist/` contains `index.html`, `404.html`, `data.js`, `assets/`. `dist/assets/` contains hashed `.js` chunks and a hashed `.css` file. `dist/index.html` references `./assets/<chunk>.js` with `type="module"`, and `dist/404.html` is byte-identical to `index.html`.

Verify byte-identity: `cd webapp && diff dist/index.html dist/404.html`
Expected: no output (files match).

- [ ] **Step 4.4: Serve and smoke-test**

Run: `cd webapp/dist && python3 -m http.server 8765`
Then in a browser: open `http://localhost:8765/`.
Expected:
- Home route renders the filter bar and result table.
- URL shows `http://localhost:8765/`.
- Clicking a result navigates to `/run/<model>/<name>` and the URL updates.
- Hard-reload on the detail URL re-renders the detail view (via 404.html fallback).
- No console errors about missing files or undefined `__BENCHMARK_DATA`.

Stop the server (Ctrl-C) before moving on.

- [ ] **Step 4.5: Verify the missing-data error path**

Run:
```bash
cd webapp
mv src/data/data.js src/data/data.js.bak
npm run build 2>&1 | tail -5 || true
mv src/data/data.js.bak src/data/data.js
```
Expected: the build exits non-zero with the message `data.js missing — run './bench report --output webapp/src/data' before building`.

- [ ] **Step 4.6: Commit**

```bash
git add webapp/vite.config.ts webapp/package.json webapp/package-lock.json \
        webapp/src/routes/index.tsx webapp/src/routes/run.$model.$name.tsx
git commit -m "feat(webapp): replace SSR build with static SPA config

Drops the @tanstack/react-start plugin in favor of plain Vite + React
with @tanstack/router-plugin for file-based route generation. Adds an
inline plugin that serves src/data/data.js in dev and copies it to
dist/ at build time, failing loudly if it's missing. A second plugin
writes dist/404.html as a copy of dist/index.html so gh-pages falls
back to the SPA for every deep-link URL.

Route files now import from ../lib/data (production) rather than
../lib/data-dev (dev convenience that statically bundled the 14 MB
archive into the app chunk)."
```

---

### Task 5: Verify `npm run dev`

**Files:** none modified; smoke test only.

The new config changes how `vite dev` serves the app (no more TanStack Start server). Confirm the dev loop still works before removing the old entry files in Task 6.

- [ ] **Step 5.1: Start the dev server in the background**

Run from the worktree root: `cd webapp && npm run dev -- --port 8766`
Let it run; it prints `Local: http://localhost:8766/` when ready.

- [ ] **Step 5.2: Exercise the page**

In a browser: open `http://localhost:8766/`.
Expected:
- Home route renders with live data (HMR attached).
- `/data.js` request returns 200 with the archive blob (check Network tab).
- Clicking a result navigates to `/run/<model>/<name>` and the URL updates.
- Editing a component file triggers HMR without a full reload.

- [ ] **Step 5.3: Stop the dev server** (Ctrl-C) and move on. No commit needed.

---

### Task 6: Remove obsolete files and the `build:report` script

**Files:**
- Delete: `webapp/vite.report.config.ts`
- Delete: `webapp/report.html`
- Modify: `webapp/package.json`

With the new single build config verified, the old `vite.report.config.ts` (file:// target using `MemoryHistory`) and `webapp/report.html` (its input) are dead code.

- [ ] **Step 6.1: Delete the files**

```bash
git rm webapp/vite.report.config.ts webapp/report.html
```

- [ ] **Step 6.2: Edit `webapp/package.json`**

Remove the `build:report` entry from `scripts`. Final `scripts` block:

```json
"scripts": {
  "dev": "vite dev",
  "build": "vite build"
}
```

- [ ] **Step 6.3: Rerun the build to confirm no one referenced the deleted files**

Run: `cd webapp && npm run build`
Expected: exits 0, same output as Task 4.2.

- [ ] **Step 6.4: Commit**

```bash
git add webapp/package.json
git commit -m "chore(webapp): remove obsolete build:report config

vite.report.config.ts and report.html were inputs to the file://
variant of the build. The new single SPA build replaces them."
```

---

### Task 7: Update `.gitignore`

**Files:**
- Modify: `.gitignore` (repo root)

`webapp/dist/` is already covered by the generic `dist/` entry; the old `webapp/dist-report/` line is obsolete. Add `.git-gh-pages/` so the temporary worktree the deploy script creates is never accidentally staged if the script is interrupted.

- [ ] **Step 7.1: Replace the line `webapp/dist-report/` with `.git-gh-pages/`**

Before (lines ~9-10 of `.gitignore`):
```
webapp/src/data/data.js
webapp/dist-report/
```

After:
```
webapp/src/data/data.js
.git-gh-pages/
```

- [ ] **Step 7.2: Verify ignore behavior**

Run: `mkdir -p .git-gh-pages && git check-ignore -v .git-gh-pages/ && rmdir .git-gh-pages`
Expected: output shows `.gitignore:N:.git-gh-pages/` confirming the pattern matches.

- [ ] **Step 7.3: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore deploy worktree path, drop dist-report entry

.git-gh-pages/ is the temp worktree the deploy script creates.
webapp/dist-report/ is obsolete; generic dist/ already covers the new
webapp/dist/ output."
```

---

### Task 8: Write `scripts/deploy-gh-pages.sh`

**Files:**
- Create: `scripts/deploy-gh-pages.sh`

One-shot deploy: preflight checks, refresh data, build, publish to `gh-pages` via a detached worktree. First run also moves existing `benchmark-results/` into `legacy/benchmark-results/`; subsequent runs are no-ops for that rename.

- [ ] **Step 8.1: Create the script**

```bash
#!/usr/bin/env bash
# Refresh webapp data, build the static bundle, and publish to gh-pages.
# On first run, existing top-level benchmark-results/ on gh-pages is
# moved to legacy/benchmark-results/ so the new webapp can claim the
# site root.
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

# --- Relocate legacy content (idempotent) ---
pushd "$worktree_path" >/dev/null
if [[ -d benchmark-results && ! -d legacy/benchmark-results ]]; then
  echo "==> Moving benchmark-results/ to legacy/benchmark-results/"
  mkdir -p legacy
  git mv benchmark-results legacy/benchmark-results
fi

# --- Drop fresh bundle at root ---
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
```

Notes:
- `trap cleanup EXIT` removes the worktree even on failure.
- `git worktree add --detach` avoids creating or moving any named local branch; pushing `HEAD:gh-pages` updates the remote branch from a detached commit.
- `git -c user.useConfigOnly=true commit` respects global user.name/user.email (no special fallback needed).
- The `cp -R webapp/dist/.` pattern copies everything including hidden files inside `dist/` (there aren't any, but this is the safer form).
- `rm -rf index.html 404.html data.js assets .nojekyll` clears only the paths the webapp build owns, leaving `legacy/` and any other unrelated content untouched.

- [ ] **Step 8.2: Make the script executable**

Run: `chmod +x scripts/deploy-gh-pages.sh`

- [ ] **Step 8.3: Sanity-check syntax without executing**

Run: `bash -n scripts/deploy-gh-pages.sh`
Expected: no output, exit 0.

- [ ] **Step 8.4: Commit**

```bash
git add scripts/deploy-gh-pages.sh
git commit -m "feat(scripts): add one-shot gh-pages deploy script

Regenerates webapp/src/data/data.js from benchmark-archive/, runs
'npm run build' in webapp/, and pushes the static bundle to
origin/gh-pages via a detached worktree. First run also moves the
existing per-run reports from benchmark-results/ into
legacy/benchmark-results/."
```

---

### Task 9: Execute the deploy

**Files:** none modified; runs the script and verifies the result on `origin/gh-pages`.

This is the one-shot refresh the whole plan is building toward. Run it from this worktree on a clean tree.

- [ ] **Step 9.1: Pre-merge safety check**

Tasks 1–8 have been committed on this worktree's branch. The deploy script requires `HEAD == origin/main`. Before running it:

```bash
git log --oneline -10
git status
```
Expected: clean working tree, recent commits are the implementation.

If the worktree is on a feature branch, **merge to main and push it first**, then re-run from a checkout that's on `main`. The script will abort otherwise.

- [ ] **Step 9.2: Run the deploy**

Run from the repo root on `main`: `./scripts/deploy-gh-pages.sh`

Expected console output (abbreviated):
```
==> Regenerating webapp/src/data/data.js from benchmark-archive/
report: wrote <N> records from <M> archives → webapp/src/data/data.js
==> Building webapp/dist/
✓ built in ...
==> Checking out origin/gh-pages into .git-gh-pages
==> Moving benchmark-results/ to legacy/benchmark-results/
==> Replacing site root with webapp/dist/
==> Deployed main@<short-sha> to origin/gh-pages
```

Exit 0.

- [ ] **Step 9.3: Verify gh-pages state**

Run:
```bash
git fetch origin gh-pages
git log origin/gh-pages -2 --format='%h %s'
git ls-tree origin/gh-pages --name-only | sort
```

Expected:
- Most recent commit on `origin/gh-pages` is `deploy: webapp build from main@<short-sha>`.
- Root listing includes `.nojekyll`, `404.html`, `assets`, `data.js`, `index.html`, `legacy`.
- `git ls-tree origin/gh-pages legacy/benchmark-results | head` shows the original 274 legacy files moved under the new prefix.

- [ ] **Step 9.4: Smoke-test the live site**

Open `https://<owner>.github.io/<repo>/` in a browser (GitHub Pages may take a minute or two to refresh after push).

Expected:
- Home route loads with up-to-date data (latest run should be from 2026-04-24 or newer).
- Clicking a result navigates; the URL updates.
- Hard-reload on a run detail URL still loads the page (404 fallback in action).
- `https://<owner>.github.io/<repo>/legacy/benchmark-results/benchmark-20260411-160606-report/` still renders the old per-run report.

- [ ] **Step 9.5: Done — no commit, deploy is already pushed.**

---

## Out of Scope (restated from spec)

- No GitHub Action. Manual script only.
- No separate landing/index page. The webapp's `/` route is the landing page.
- No rewrite of old per-run report HTML. They move to `legacy/` as-is.

## Risks / Gotchas

- **First-run deploy is a big commit** because hundreds of files rename under `legacy/`. Git records these as renames (not add+delete) so history is preserved.
- **Local `gh-pages` branch** exists from prior work. The script uses `--detach` and pushes to `origin/gh-pages`, so the local branch is untouched and may drift. Harmless; `git fetch origin gh-pages` + `git branch -f gh-pages origin/gh-pages` resyncs if desired.
- **Detail-route hard-reload depends on 404.html fallback**, which is only active on GitHub Pages (and in the `python3 -m http.server` smoke test because it serves `404.html` when a path isn't found — but some static servers don't; if the dev-time smoke test doesn't fall back, trust the production behavior: GitHub Pages handles this correctly).
- **`base: "./"` only works because the SPA uses browser history**, not hash routing. Vite rewrites asset URLs relative to `index.html`; the router navigates via `pushState`, which operates on absolute paths and is unaffected by `base`.
