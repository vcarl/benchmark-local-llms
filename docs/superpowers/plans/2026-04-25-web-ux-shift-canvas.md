# Web UX Shift-Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the home route's vertical-stack + side-panel UX with a horizontally-shifting ~170 vw canvas where scatter, ranking, and details are regions, and `?model=` toggles a `transform: translateX()` between two states.

**Architecture:** The route component renders Header + FilterBar above a new `<ShiftFrame>` that owns the canvas geometry. The canvas is a fixed-width (170 vw) `display: block` container with three absolute-positioned region wrappers. State derivation is a pure `isShifted(model)` helper. Esc and a back-overlay button both clear `?model=`. The ranking row is restructured into a 40/60 outer grid where the breakdown columns sit in the canvas overview-only zone and slide off-screen on shift; no per-cell density swap is needed.

**Tech Stack:** React 19, TanStack Router (`useSearch`/`useNavigate`), CSS-only animations (`transform`, `transition`), Vitest (node env, pure helpers only — there is no React component test setup in this repo).

**Spec:** `docs/superpowers/specs/2026-04-25-web-ux-shift-canvas-design.md`

**Palette note:** `webapp/public/styles.css` is dark-themed with hardcoded hex values (no CSS variables). All new CSS in this plan uses the existing palette: backgrounds `#0a0a0a` / `#111` / `#151515` / `#1a1a1a`, borders `#222` / `#333`, text `#ddd` / `#888` / `#666`. Do not introduce `var(--)` declarations.

---

## Task 1: Pure shift-state helper

**Why first:** Isolates the one piece of testable logic. Lets us TDD the URL-derivation contract before anything else.

**Files:**
- Create: `webapp/src/lib/shift-state.ts`
- Create: `webapp/src/lib/shift-state.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `webapp/src/lib/shift-state.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { isShifted } from "./shift-state";

describe("isShifted", () => {
  it("is false when model is undefined", () => {
    expect(isShifted(undefined)).toBe(false);
  });

  it("is false when model is the empty string", () => {
    expect(isShifted("")).toBe(false);
  });

  it("is true for any non-empty string", () => {
    expect(isShifted("qwen2.5-coder-32b")).toBe(true);
  });

  it("is true for whitespace-only — URL truthiness, not semantic validity", () => {
    expect(isShifted("   ")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run webapp/src/lib/shift-state.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the implementation**

Create `webapp/src/lib/shift-state.ts`:

```typescript
export const isShifted = (model: string | undefined): boolean =>
  model !== undefined && model !== "";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run webapp/src/lib/shift-state.test.ts`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/lib/shift-state.ts webapp/src/lib/shift-state.test.ts
git commit -m "feat(webapp): add isShifted helper for canvas drill-down state"
```

---

## Task 2: Add shift-canvas CSS (additive only)

**Why now:** Land the CSS first so subsequent component code has the classes it expects. Purely additive — no existing rules are touched in this task. The new rules don't affect anything until a component opts in by using the classes.

**Files:**
- Modify: `webapp/public/styles.css` (append at bottom)

- [ ] **Step 1: Append new CSS rules to `webapp/public/styles.css`**

Append at the end of the file:

```css
/* Shift canvas — horizontally-translating frame for scatter/ranking/details */
.shift-frame {
  position: relative;
  overflow: hidden;
  margin: 16px;
  border: 1px solid #222;
  border-radius: 8px;
  background: #0a0a0a;
  /* Frame fills the remaining viewport height after header + filter bar + margins.
     Tune the constant if chrome changes height; min-height provides a floor. */
  height: calc(100vh - 160px);
  min-height: 500px;
}
.shift-canvas {
  position: relative;
  width: 170vw;
  height: 100%;
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  will-change: transform;
}
.shift-canvas.shifted {
  transform: translateX(-70vw);
}
.region-scatter,
.region-ranking,
.region-details {
  position: absolute;
  top: 0;
  height: 100%;
  overflow-y: auto;
}
.region-scatter { left: 0; width: 50vw; }
.region-ranking { left: 50vw; width: 50vw; z-index: 2; }
.region-details { left: 100vw; width: 70vw; }
.back-overlay {
  position: absolute;
  top: 12px;
  left: calc(100vw + 12px);
  z-index: 10;
  background: #1a1a1a;
  color: #ddd;
  border: 1px solid #333;
  border-radius: 4px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s;
}
.back-overlay:hover { background: #222; }
.shift-canvas.shifted .back-overlay {
  opacity: 1;
  pointer-events: auto;
}
```

- [ ] **Step 2: Verify the build still succeeds**

Run: `npm -w webapp run build`
Expected: build completes, no errors. The CSS is parsed; no class is yet referenced from JSX so nothing should look different.

- [ ] **Step 3: Commit**

```bash
git add webapp/public/styles.css
git commit -m "feat(webapp): add shift-canvas CSS rules for canvas/regions/back-overlay"
```

---

## Task 3: Create ShiftFrame component

**Files:**
- Create: `webapp/src/components/ShiftFrame.tsx`

- [ ] **Step 1: Create the component**

Create `webapp/src/components/ShiftFrame.tsx`:

```tsx
import { useEffect, type ReactNode } from "react";
import { isShifted } from "../lib/shift-state";

interface Props {
  model: string | undefined;
  onClose: () => void;
  scatter: ReactNode;
  ranking: ReactNode;
  details: ReactNode;
}

export function ShiftFrame({ model, onClose, scatter, ranking, details }: Props) {
  const shifted = isShifted(model);

  useEffect(() => {
    if (!shifted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shifted, onClose]);

  return (
    <div className="shift-frame">
      <div className={shifted ? "shift-canvas shifted" : "shift-canvas"}>
        <div className="region-scatter">{scatter}</div>
        <div className="region-ranking">{ranking}</div>
        <div className="region-details">{details}</div>
        <button
          type="button"
          className="back-overlay"
          onClick={onClose}
          aria-label="Back to overview"
        >
          ← Overview
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit -p webapp/tsconfig.json`
Expected: no type errors. (Note: this command may emit some warnings about `webapp/src/data/data.js` being missing — that file is generated; ignore those.)

- [ ] **Step 3: Verify build still succeeds**

Run: `npm -w webapp run build`
Expected: build completes, no errors. ShiftFrame is unused so far; bundler may tree-shake it but that's fine.

- [ ] **Step 4: Commit**

```bash
git add webapp/src/components/ShiftFrame.tsx
git commit -m "feat(webapp): add ShiftFrame component for canvas drill-down UX"
```

---

## Task 4: Strip ModelDetailPanel chrome (close button, scrim, fixed positioning)

**Why now:** Before wiring `ShiftFrame`, remove the panel's overlay-style chrome so it can render as a normal block in `region-details`. This task leaves a brief visual regression (panel renders inline below scatter, no close affordance) — fixed in Task 5.

**Files:**
- Modify: `webapp/src/components/ModelDetailPanel.tsx`
- Modify: `webapp/public/styles.css`
- Modify: `webapp/src/routes/index.tsx`

- [ ] **Step 1: Remove `panel-scrim`, the `panel-close` button, and the `onClose` prop in ModelDetailPanel**

In `webapp/src/components/ModelDetailPanel.tsx`, replace the entire component (preserve all other logic/sections; only chrome is changing):

```tsx
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { BenchmarkResult } from "../lib/data";
import { PASS_THRESHOLD, CAPABILITY_TAGS, scoreBand } from "../lib/constants";

interface Props {
  model: string;
  data: BenchmarkResult[];
}

export function ModelDetailPanel({ model, data }: Props) {
  const [tab, setTab] = useState<"all" | "prompts" | "scenarios">("all");
  const navigate = useNavigate();

  const runs = useMemo(() => data.filter((d) => d.model === model), [data, model]);
  const filtered = useMemo(() => {
    if (tab === "prompts") return runs.filter((r) => !r.is_scenario);
    if (tab === "scenarios") return runs.filter((r) => r.is_scenario);
    return runs;
  }, [runs, tab]);

  const mean = runs.length === 0 ? 0 : runs.reduce((s, r) => s + r.score, 0) / runs.length;
  const pass = runs.length === 0 ? 0 : runs.filter((r) => r.score >= PASS_THRESHOLD).length / runs.length;

  const profile = useMemo(() => {
    const byTag = new Map<string, number[]>();
    for (const r of runs) for (const t of r.tags) {
      const a = byTag.get(t); if (a) a.push(r.score); else byTag.set(t, [r.score]);
    }
    const out: Record<string, { mean: number; count: number }> = {};
    for (const [t, ss] of byTag) out[t] = { mean: ss.reduce((s, v) => s + v, 0) / ss.length, count: ss.length };
    return out;
  }, [runs]);

  const first = runs[0];

  return (
    <aside className="model-panel">
      <header className="model-panel-header">
        <h2>{model}</h2>
        {first && <div className="panel-subtitle">{first.runtime} · {first.quant} · temp {first.temperature}</div>}
        <div className="panel-metrics">
          <span className={`cap-${scoreBand(mean)}`}>score {mean.toFixed(2)}</span>
          <span>pass {Math.round(pass * 100)}%</span>
        </div>
      </header>

      <section className="panel-section">
        <h3>Capability profile</h3>
        <div className="panel-profile">
          {CAPABILITY_TAGS.map((tag) => {
            const cell = profile[tag];
            return (
              <div key={tag} className="panel-profile-row">
                <span className="panel-profile-name">{tag}</span>
                <div className="panel-profile-bar">
                  {cell !== undefined && (
                    <div
                      className={`cap-${scoreBand(cell.mean)}`}
                      style={{ width: `${Math.round(cell.mean * 100)}%`, height: "100%" }}
                    />
                  )}
                </div>
                <span className="panel-profile-value">
                  {cell !== undefined ? cell.mean.toFixed(2) : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel-section">
        <div className="panel-tabs">
          <button className={tab === "all" ? "active" : ""} onClick={() => setTab("all")}>All ({runs.length})</button>
          <button className={tab === "prompts" ? "active" : ""} onClick={() => setTab("prompts")}>Prompts</button>
          <button className={tab === "scenarios" ? "active" : ""} onClick={() => setTab("scenarios")}>Scenarios</button>
        </div>
        <div className="panel-runs" key={tab}>
          {filtered.map((r) => (
            <button
              key={`${r.prompt_name}·${r.temperature}·${r.quant}·${r.runtime}`}
              className="panel-run"
              onClick={() => navigate({ to: "/run/$model/$name", params: { model, name: r.prompt_name } })}
            >
              <span>{r.prompt_name}</span>
              <span className="panel-run-tier">t{r.tier}</span>
              <span className={`cap-${scoreBand(r.score)} panel-run-score`}>{r.score.toFixed(2)}</span>
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}
```

Changes from before: removed `onClose` from `Props`, removed the `<div className="panel-scrim" />` and the panel-close `<button>` element.

- [ ] **Step 2: Update `.model-panel` CSS to drop fixed positioning**

In `webapp/public/styles.css`, find the line containing `.model-panel { position: fixed;` (around line 90). Replace that single rule:

```css
.model-panel { position: fixed; top: 0; right: 0; bottom: 0; width: 560px; max-width: 90vw; background: #151515; border-left: 1px solid #333; z-index: 51; overflow-y: auto; color: #ddd; }
```

with:

```css
.model-panel { background: #151515; border-left: 1px solid #333; overflow-y: auto; color: #ddd; height: 100%; }
```

Leave `.panel-scrim` and `.panel-close` rules in place for now — Task 7 will remove them.

- [ ] **Step 3: Drop the now-extraneous `onClose` prop at the call site in `index.tsx`**

In `webapp/src/routes/index.tsx`, find the existing JSX:

```tsx
{panelModel !== undefined && panelModel !== "" && (
  <ModelDetailPanel model={panelModel} data={DATA} onClose={closePanel} />
)}
```

Remove the `onClose={closePanel}` attribute (keep `closePanel` defined — it'll be used in Task 5):

```tsx
{panelModel !== undefined && panelModel !== "" && (
  <ModelDetailPanel model={panelModel} data={DATA} />
)}
```

- [ ] **Step 4: Verify typecheck and build**

Run: `npx tsc --noEmit -p webapp/tsconfig.json && npm -w webapp run build`
Expected: clean. The panel renders inline (without fixed positioning) below the scatter; this is intentionally ugly and fixed in Task 5.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/components/ModelDetailPanel.tsx webapp/public/styles.css webapp/src/routes/index.tsx
git commit -m "refactor(webapp): drop ModelDetailPanel scrim/close-button/fixed positioning"
```

---

## Task 5: Wire ShiftFrame into the home route

**Files:**
- Modify: `webapp/src/routes/index.tsx`

- [ ] **Step 1: Replace the body of `HomePage` to use `ShiftFrame`**

Open `webapp/src/routes/index.tsx`. Add the import for ShiftFrame near the others:

```tsx
import { ShiftFrame } from "../components/ShiftFrame";
```

Replace the `return` block of `HomePage` with:

```tsx
return (
  <div className="app">
    <header className="app-header">
      <h1>Benchmark Analysis</h1>
      <div className="app-subtitle">{DATA.length} runs · {allValues.tags.length} tags · {allValues.runtimes.length} runtimes</div>
    </header>
    <FilterBar allValues={allValues} />
    <ShiftFrame
      model={panelModel}
      onClose={closePanel}
      scatter={<Scatter data={filtered} />}
      ranking={<ResultTable rows={rows} sortKey={sortKey} onSortChange={setSortKey} onRowClick={handleRowClick} />}
      details={panelModel !== undefined && panelModel !== "" ? <ModelDetailPanel model={panelModel} data={DATA} /> : null}
    />
  </div>
);
```

The `ModelDetailPanel` no longer takes `onClose`; the close action is owned by `ShiftFrame`.

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit -p webapp/tsconfig.json`
Expected: no errors related to `onClose` on `ModelDetailPanel`.

- [ ] **Step 3: Verify build**

Run: `npm -w webapp run build`
Expected: clean build.

- [ ] **Step 4: Smoke-test in browser**

Run: `npm -w webapp run dev` (start dev server)
Open the local URL. Manually verify:
- Overview state: header + filter bar at top, scatter on left, ranking on right (full-height row, breakdown columns may look squished in the 50 vw region — that's expected; Task 6 fixes the row layout).
- Click a ranking row: URL gains `?model=…`, canvas slides 400 ms, back-overlay button appears at top-left of details region, details pane renders.
- Click "← Overview" button: URL drops `model`, canvas slides back.
- Press Esc while shifted: same as button click.
- Browser back: matches.

If any of those fail, do not proceed. Stop and diagnose.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/routes/index.tsx
git commit -m "feat(webapp): wire ShiftFrame into home route, replace overlay panel"
```

---

## Task 6: Restructure ResultRow + ResultTable to 40/60 grid

**Why now:** The ranking region is 50 vw wide but the row still uses the old 7-column grid sized for ~100 vw. The result is squished columns. This task splits the row into a breakdown section (40 % / canvas 50–70 vw) and an always-visible section (60 % / canvas 70–100 vw).

**Files:**
- Modify: `webapp/src/components/ResultRow.tsx`
- Modify: `webapp/src/components/ResultTable.tsx`
- Modify: `webapp/public/styles.css`

- [ ] **Step 1: Replace the JSX in `ResultRow` to use the two-section structure**

In `webapp/src/components/ResultRow.tsx`, replace the returned JSX (keep imports and helpers) with:

```tsx
return (
  <div
    ref={rowRef}
    className="result-row"
    onClick={onClick}
    onMouseEnter={handleMouseEnter}
    onMouseLeave={handleMouseLeave}
    role="button"
  >
    <div className="result-row-breakdown">
      <div className="result-variants">
        {row.variants.map((v, i) => {
          const opacity = 0.55 + 0.45 * (1 - i / Math.max(1, row.variants.length - 1));
          const tokenPct = Math.max(0, Math.min(100, (v.tokens / maxVariantTokens) * 100));
          const variantTitle = `${Math.round(v.tokens).toLocaleString()} tokens/run`;
          return (
            <div key={`${v.runtime}|${v.quant}|${v.temperature}`} className="result-variant">
              <span className="result-variant-label">{abbrevRuntime(v.runtime)} {v.quant} t{v.temperature}</span>
              <span className="result-variant-track" title={variantTitle}>
                <span
                  className="result-variant-fill"
                  style={{ width: `${Math.max(0, Math.min(100, v.score))}%`, background: rowColor, opacity }}
                />
                <span
                  className="result-variant-tokens"
                  style={{ width: `${tokenPct}%`, background: rowColor, boxShadow: `0 0 6px ${rowColor}` }}
                />
              </span>
              <span className="result-variant-score">{v.score.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>

      <div
        className="result-capability"
        onMouseEnter={(ev) => {
          const rect = rowRef.current?.getBoundingClientRect();
          if (rect) setCapTip({ x: ev.clientX - rect.left, y: ev.clientY - rect.top });
        }}
        onMouseMove={(ev) => {
          const rect = rowRef.current?.getBoundingClientRect();
          if (rect) setCapTip({ x: ev.clientX - rect.left, y: ev.clientY - rect.top });
        }}
        onMouseLeave={() => setCapTip(null)}
      >
        {row.capability.map((c) => (
          <div
            key={c.tag}
            className={c.pass === null ? "result-cap-cell cap-absent" : `result-cap-cell cap-${scoreBand(c.pass)}`}
            title={c.pass === null ? `${c.tag}: no runs` : `${c.tag}: ${Math.round(c.pass * 100)}%`}
          />
        ))}
        {capTip !== null && (
          <div style={{ position: "absolute", left: capTip.x + 12, top: capTip.y + 12, pointerEvents: "none" }}>
            <CapabilityHoverCard title={row.key} capability={row.capability} />
          </div>
        )}
      </div>
    </div>

    <div className="result-row-always">
      <div className="result-rank">{rank}</div>
      <div className="result-model">
        <div className="result-model-name">{row.key}</div>
        {row.family !== null && <div className="result-model-family">{row.family}</div>}
      </div>
      <div className="result-score-cell">
        <div className={`result-score cap-${scoreBand(row.bestScore / 100)}`}>
          {row.bestScore.toFixed(0)}%
        </div>
        <div
          className={`result-efficiency${anyBrokenTokens ? " result-efficiency--broken" : ""}`}
          title={anyBrokenTokens ? brokenTitle : undefined}
        >
          {row.efficiency} tok/pt
        </div>
      </div>
      <div className="result-numeric">
        <span>{row.mem.toFixed(1)} GB</span>
        <span className="result-numeric-sub">{row.bestVariant.quant}</span>
      </div>
      <div
        className={`result-numeric${anyBrokenTokens ? " result-numeric--broken" : ""}`}
        title={anyBrokenTokens ? brokenTitle : undefined}
      >
        <span>{Math.round(row.avgTokens).toLocaleString()}</span>
        <span className="result-numeric-sub">avg/run</span>
      </div>
    </div>
  </div>
);
```

- [ ] **Step 2: Replace the `ResultTable` header to match the two-section structure**

In `webapp/src/components/ResultTable.tsx`, replace the `result-header` div with:

```tsx
<div className="result-header">
  <div className="result-row-breakdown">
    <div>Pass rate by variant</div>
    <div>Capabilities</div>
  </div>
  <div className="result-row-always">
    <div className="result-rank">#</div>
    <div>Model</div>
    <div className="result-score-header">Score / efficiency</div>
    <div className="result-numeric-header">Memory</div>
    <div className="result-numeric-header">Tokens</div>
  </div>
</div>
```

- [ ] **Step 3: Replace the grid CSS for `.result-row` and `.result-header`**

In `webapp/public/styles.css`, find the existing rules near the bottom of the file:

```css
.result-row {
  display: grid;
  grid-template-columns: 28px 1fr 100px minmax(260px, 2fr) auto 72px 72px;
  ...
}
```

and:

```css
.result-header {
  display: grid;
  grid-template-columns: 28px 1fr 100px minmax(260px, 2fr) auto 72px 72px;
  ...
}
```

Replace those grid-template-columns lines with `grid-template-columns: 40% 60%;` and append new sub-grid rules just after `.result-row { ... }`:

```css
.result-row-breakdown {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding-right: 12px;
  border-right: 1px dashed #222;
  min-width: 0;
}
.result-row-always {
  display: grid;
  grid-template-columns: 28px minmax(0, 1.5fr) 100px 72px 72px;
  gap: 12px;
  align-items: center;
  padding-left: 12px;
  min-width: 0;
}
```

Also update the `.result-row` rule itself: remove the `grid-template-columns` that lists the 7 widths, replace with `grid-template-columns: 40% 60%;`. Keep the rest of the rule (gap, padding, border-bottom, cursor, etc.) unchanged.

Same for `.result-header`: replace the 7-column template with `grid-template-columns: 40% 60%;` and keep other declarations.

- [ ] **Step 4: Verify typecheck and build**

Run: `npx tsc --noEmit -p webapp/tsconfig.json && npm -w webapp run build`
Expected: clean.

- [ ] **Step 5: Smoke-test in browser**

`npm -w webapp run dev`. Verify in overview state:
- Ranking row shows: variants + capabilities on the LEFT half, then a vertical dashed divider, then rank + model + score + memory + tokens on the RIGHT half.
- Header columns line up with their row cells.
- Click a row → canvas slides; in drill-down, only the right half of the row is visible (rank + model + score + memory + tokens).
- Click another row in drill-down → details swap, no re-slide.
- The breakdown columns are NOT visible in drill-down state.

- [ ] **Step 6: Commit**

```bash
git add webapp/src/components/ResultRow.tsx webapp/src/components/ResultTable.tsx webapp/public/styles.css
git commit -m "refactor(webapp): split ResultRow into breakdown/always halves for shift canvas"
```

---

## Task 7: Remove dead CSS, add reduced-motion + mobile fallback

**Files:**
- Modify: `webapp/public/styles.css`

- [ ] **Step 1: Remove `.panel-scrim` and `.panel-close` rules**

In `webapp/public/styles.css`, find and delete:

```css
.panel-scrim { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 50; }
```

and:

```css
.panel-close { position: absolute; top: 8px; right: 12px; background: none; border: none; color: #888; font-size: 20px; cursor: pointer; }
```

Both should be the only references; verify with `grep -n "panel-scrim\|panel-close" webapp/public/styles.css` returning no matches after deletion.

- [ ] **Step 2: Append reduced-motion media query**

Append at the end of the file:

```css
@media (prefers-reduced-motion: reduce) {
  .shift-canvas { transition: none; }
}
```

- [ ] **Step 3: Append mobile fallback media query**

Append at the end of the file:

```css
@media (max-width: 899px) {
  .shift-frame { overflow: visible; min-height: 0; margin: 0; border: none; border-radius: 0; }
  .shift-canvas { width: 100%; transform: none !important; }
  .region-scatter,
  .region-ranking,
  .region-details { position: static; width: 100%; }
  .region-ranking { z-index: auto; }
  .region-details {
    position: fixed;
    top: 0; right: 0; bottom: 0;
    width: 90vw;
    background: #151515;
    border-left: 1px solid #333;
    z-index: 51;
    overflow-y: auto;
    transform: translateX(100%);
    transition: transform 0.3s ease-out;
  }
  .shift-canvas.shifted .region-details { transform: translateX(0); }
  .back-overlay {
    position: fixed;
    top: 12px;
    left: 12px;
  }
}
```

- [ ] **Step 4: Verify build**

Run: `npm -w webapp run build`
Expected: clean.

- [ ] **Step 5: Smoke-test reduced motion**

Open the dev server in a browser. Open DevTools → Rendering → "Emulate CSS media feature prefers-reduced-motion: reduce" → reload. Click a row: the canvas should snap to drill-down, no slide animation. Click "← Overview" or press Esc: should snap back.

- [ ] **Step 6: Smoke-test mobile fallback**

In DevTools, set viewport to 800 × 1000 (below 900 px). Verify:
- Header + filter bar + scatter + ranking stack vertically.
- Click a row → details slides in from the right as a fixed overlay (90 vw wide), back-overlay button appears at top-left of viewport.
- Click button or press Esc → details slides back out.
- Resize viewport above 900 px → falls back to canvas mode.

- [ ] **Step 7: Commit**

```bash
git add webapp/public/styles.css
git commit -m "feat(webapp): add reduced-motion + narrow-viewport fallbacks for shift canvas"
```

---

## Task 8: Final verification

**Files:** none modified.

- [ ] **Step 1: Run all tests**

Run from repo root: `npm test`
Expected: all tests pass, including the new `shift-state.test.ts`.

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit -p webapp/tsconfig.json`
Expected: clean.

- [ ] **Step 3: Run lint**

Run from repo root: `npm run lint`
Expected: clean. (Biome is configured in repo root.)

- [ ] **Step 4: Run production build**

Run: `npm -w webapp run build`
Expected: build completes; check `webapp/dist/` for output. Open the built `index.html` if possible to verify.

- [ ] **Step 5: Browser verification — full checklist**

Start dev server: `npm -w webapp run dev`. In the browser, run through the spec's verification checklist:

1. **Overview baseline:** Scatter on left half, ranking on right half. Header + filter bar above. Ranking row shows breakdown on left of dashed divider, model + score + meta on right.
2. **Click row:** URL gains `?model=…`. Canvas slides 400 ms. Back-overlay appears.
3. **Click another row in drill-down:** URL changes, no slide, details swap.
4. **Esc while shifted:** URL drops `model`, slides back.
5. **Esc while overview:** no-op.
6. **Browser back/forward:** matches state.
7. **Back-overlay button:** drops `model`, slides back.
8. **Filter change while shifted:** ranking re-aggregates under the canvas, drill-down state preserved, details unchanged.
9. **Reduced motion:** snap, no animation. (DevTools → Rendering panel.)
10. **Resize below 900 px:** falls back to stacked layout + side-panel details.
11. **Refresh on `?model=qwen2.5-coder-32b`:** lands directly in drill-down.

Any failures: stop, diagnose, fix, re-run from the relevant earlier task.

- [ ] **Step 6: No commit needed if all checks pass**

The final state is already committed across Tasks 1–7.

---

## Summary of files touched

- Created: `webapp/src/lib/shift-state.ts`, `webapp/src/lib/shift-state.test.ts`, `webapp/src/components/ShiftFrame.tsx`
- Modified: `webapp/src/routes/index.tsx`, `webapp/src/components/ResultRow.tsx`, `webapp/src/components/ResultTable.tsx`, `webapp/src/components/ModelDetailPanel.tsx`, `webapp/public/styles.css`
- Deleted: nothing (only CSS rules removed within `styles.css`)
