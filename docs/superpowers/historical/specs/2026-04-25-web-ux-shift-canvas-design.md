# Web UX: shift-canvas redesign

**Date:** 2026-04-25
**Branch:** `worktree-web-ux`
**Scope:** Replace the home page's side-panel pattern with a horizontally-shifting "canvas" that re-frames the existing scatterplot, ranking list, and details pane as one wide spatial unit.

## Goal

Today the home route stacks Header → FilterBar → Scatter → ResultTable vertically, and clicking a ranking row opens `ModelDetailPanel` as a fixed-position right-side panel with a scrim overlay. The new model treats the three content elements (scatter / ranking / details) as a single ~170 vw canvas. The viewport is a window onto that canvas. Clicking a ranking row shifts the canvas left so the scatter slides off and the details pane slides into view. The ranking row itself is the anchor: its always-visible columns (rank, model name, score, metadata) sit in the overlap zone that is on-screen in both states; its overview-only columns (variant bars, capability tiles) sit in the overview zone and slide off-screen with the canvas, automatically simplifying the row in drill-down.

## UX model

Two states, both driven by URL:

- **Overview** (`?model=` absent or empty): viewport at canvas 0–100 vw, showing scatterplot on the left and the full ranking row (with breakdown columns) on the right.
- **Drill-down** (`?model=foo` present): viewport at canvas 70–170 vw, showing the right portion of the ranking row (rank · model · score · metadata only) and the details pane.

The ranking is the anchor across both states. The scatterplot is the "overview" focal point; the details pane is the "drill-down" focal point. Conceptually this replaces the side-panel "open over content" with a "navigate within a wider canvas" metaphor.

## Layout & geometry

Canvas dimensions (percentages are of canvas width, vw values describe canvas position):

| Region   | Canvas position | Width | Always-visible? |
|----------|-----------------|-------|-----------------|
| scatter  | 0–50 vw         | 50 vw | overview only   |
| ranking  | 50–100 vw       | 50 vw | partial (right half always visible, left half overview only) |
| details  | 100–170 vw      | 70 vw | drill-down only |

Viewport is the browser window, exactly 100 vw wide. The canvas is `width: 170vw` inside an `overflow: hidden` frame. State transitions translate the canvas:

- Overview: `transform: translateX(0)` → viewport sees canvas 0–100 vw.
- Drill-down: `transform: translateX(-70vw)` → viewport sees canvas 70–170 vw.

The 30 vw zone at canvas 70–100 vw is on-screen in both states. That zone holds the "always visible" portion of the ranking row.

### Ranking row internal layout

The ranking region is 50 vw wide. The zone boundary between overview-only and always-visible falls at canvas position 70 vw — which is 20 vw into the ranking region, i.e. 40 % from the left edge of the row.

The row uses a two-section grid: a 40 % left section for breakdown columns (canvas 50–70 vw, overview-only) and a 60 % right section for the always-visible columns (canvas 70–100 vw):

```
| variants | capabilities || rank | model name | score | mem | tokens |
|       40 % (20 vw)       ||              60 % (30 vw)                |
|     overview-only        ||           always-visible                  |
```

CSS sketch:

```css
.result-row {
  display: grid;
  grid-template-columns: 40% 60%;
}
.result-row-breakdown { /* sub-grid for variants + capabilities */ }
.result-row-always    { /* sub-grid for rank + model + score + mem + tokens */ }
```

The "less detailed in drill-down" effect is automatic: the breakdown sub-grid physically translates off-screen with the canvas. No CSS class swap, no opacity transition on individual cells — one transform animates everything.

### Chrome

Header and FilterBar render above the shift frame as ordinary block elements. They do **not** translate. Filter changes affect the data feeding scatter, ranking, and details, but the bar itself stays put.

## State & URL

The existing `?model=` query param is the single source of truth:

- absent / empty → overview state, canvas at translateX(0).
- present with any string → drill-down state, canvas at translateX(-70vw); details pane reads the value to fetch the model's runs.

Implications:
- **Browser back/forward** works without extra wiring (TanStack Router pushes history on `navigate`).
- **Bookmarks / URL sharing** drop the user directly into drill-down for that model.
- **Deep link with a model excluded by current filter:** details pane still renders correctly (`ModelDetailPanel` reads from full `DATA`, not the filtered set). The ranking row may not appear, which is acceptable.

## Animation

- `transform: translateX()` on `.shift-canvas`, 400 ms, `cubic-bezier(0.4, 0, 0.2, 1)`.
- GPU-accelerated; no layout thrash.
- `@media (prefers-reduced-motion: reduce)` disables the transition (snap).

## Back triggers

Wired in priority order:

1. **Click another ranking row** in drill-down — calls `navigate({ search: { ...s, model: newModel } })`. URL still has `model`, canvas stays shifted, only the details content swaps.
2. **Esc key** — handler on `document` removes the `model` param. Active only when shifted.
3. **Browser back** — works for free via URL state.
4. **Back-overlay button** — small `← Overview` button absolutely positioned at top-left of the details region, only visible when `.shifted`. Clicking removes the `model` param.

There is no `panel-close` × button on the details pane itself, no scrim, and no scatter peek (the geometry doesn't expose any scatter in drill-down state).

## Component structure

```
HomePage (routes/index.tsx)
├── Header
├── FilterBar
└── ShiftFrame (new)
    ├── BackOverlay (absolute, only when shifted)
    └── .shift-canvas
        ├── .region-scatter  → Scatter (existing, unchanged)
        ├── .region-ranking  → ResultTable (revised row grid)
        └── .region-details  → ModelDetailPanel (revised — block, not fixed)
```

`ShiftFrame` owns the Esc keydown listener and the back-overlay button. It receives the current `model` value from the route component and toggles `.shifted` on the canvas.

## Files to change

- `webapp/src/routes/index.tsx` — wrap Scatter+ResultTable+ModelDetailPanel inside `<ShiftFrame model={panelModel} onClose={closePanel}>…</ShiftFrame>`. Drop the conditional render of `ModelDetailPanel` (always render it inside `region-details`, but skip when no model).
- `webapp/src/components/ShiftFrame.tsx` (new, ~80 LOC) — owns shift state derivation, Esc handler, back overlay, region wrappers.
- `webapp/src/components/ResultRow.tsx` — redesign grid: outer `40% 60%` split, breakdown sub-grid on the left holds `[variants][capabilities]`, always sub-grid on the right holds `[rank][model][score][mem][tokens]`. The score-efficiency stack lives in the always-visible half.
- `webapp/src/components/ResultTable.tsx` — match the new grid in `.result-header`; column labels in the new order. Header obeys the same 40/60 split.
- `webapp/src/components/ModelDetailPanel.tsx` — remove `position: fixed` styling, the `.panel-scrim` element, the `panel-close` × button, and the `onClose` prop. Becomes a normal block consumed by `region-details`. Keep all internal sections (capability profile, tabs, runs).
- `webapp/public/styles.css` — additions and modifications:
  - new: `.shift-frame`, `.shift-canvas`, `.shift-canvas.shifted`, `.region-scatter`, `.region-ranking`, `.region-details`, `.back-overlay`.
  - modified: `.result-row` and `.result-header` `grid-template-columns`.
  - removed: `.panel-scrim`, `.model-panel { position: fixed; … }`, `.panel-close`.
  - new: `@media (prefers-reduced-motion: reduce)` to disable transition.
  - new: `@media (max-width: 899px)` mobile fallback.

## Mobile / narrow viewport fallback

Below 900 px viewport width, the shift metaphor breaks down (regions become unusably thin). Below the breakpoint:

- `.shift-frame` reverts to a flat flow.
- `.shift-canvas` loses the `width: 170vw` and the transform; becomes a normal flex column.
- `.region-scatter`, `.region-ranking` stack vertically.
- `.region-details` reverts to `position: fixed; top: 0; right: 0; width: 90vw` — the existing side-panel CSS — and reintroduces a scrim overlay only in this branch.

Single set of components, two CSS branches. No JavaScript breakpoint logic.

## Edge cases

- **Mid-animation row clicks:** updating URL during transition is safe — React commits the new `model` value, but the canvas was already shifted; the details content swaps without re-running the slide.
- **Filter change while shifted:** scatter and ranking re-aggregate; details unchanged (it reads from full `DATA` by model name). If ranking becomes empty under filter, drill-down still functions for the URL-pinned model.
- **No `?model=` initially:** route lands in overview — same as today.
- **Browser back from drill-down to overview:** URL drops `model`, canvas slides back, focus returns to whatever was focused before navigation (browser default).

## Verification

Implementation complete when:

1. Overview state visual matches current home page (no regression in scatter, no regression in ranking columns aside from the new order).
2. Click row → URL gains `?model=…`, canvas slides 400 ms to drill-down, back-overlay appears.
3. Click another row in drill-down → URL changes, no slide, details swap.
4. Esc when shifted → URL drops `model`, slides back. Esc when overview → no-op.
5. Browser back/forward → matches expected state.
6. Back-overlay button click → drops `model`, slides back.
7. Filter change while shifted → ranking re-aggregates, canvas stays shifted, details unchanged.
8. `prefers-reduced-motion: reduce` → no slide animation.
9. Resize below 900 px → falls back to stacked layout with side-panel details.
10. `npm run -w webapp build` succeeds.
11. Existing webapp tests pass.

## Out of scope

- New data, new aggregations, or changes to scoring.
- Changes to `/run/$model/$name` route.
- Changes to scatter rendering internals (only its container width changes).
- Touch gesture / swipe input (the shift is click-driven; trackpad horizontal scroll is not wired).
- Animation polish beyond the basic ease-out (no parallax, no separate fades).
