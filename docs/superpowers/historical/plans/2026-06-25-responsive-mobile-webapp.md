# Responsive / mobile webapp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the benchmark report webapp usable on phones (filtering, reading the ranking table, drilling into a model) via pure CSS reflow plus a small ShiftFrame markup add, without touching the existing desktop layout.

**Architecture:** Hybrid breakpoint mechanism. The existing `@container shiftFrame (max-width: 899px)` container query keeps driving the STRUCTURAL scatter/ranking/details pivot unchanged. All NEW within-component phone reflow (header wrapping, filter stacking, two-tier rows, scatter height, sheet sizing) uses VIEWPORT media queries at a single breakpoint, `@media (max-width: 600px)`. Because `ShiftFrame` fills the viewport, container width ≈ viewport width, so the two mechanisms do not fight.

**Tech Stack:** React 19, Vite 7, TypeScript, vanilla CSS Modules + design tokens

## Global Constraints

- Phone breakpoint is `@media (max-width: 600px)`, documented with a comment at first use in each file.
- The existing `@container shiftFrame (max-width: 899px)` structural pivot stays; do not alter its rules except the one explicit close-affordance reveal.
- Desktop ≥900px layout must render identically after this work (regression-check every task).
- No component-logic rewrites; only CSS plus the small ShiftFrame.tsx markup add for the sheet backdrop + close button.

---

## Setup / how to verify

There is **no test runner** in the webapp (its `package.json` scripts are only `dev` and `build`). Every task is verified by **browser observation** with a red→green shape, not unit tests.

**Run the dev server:**

1. The app requires `webapp/src/data/data.js` to exist. If it is missing, from the repo root `/Users/vcarl/workspace/testbench/llms` run:
   ```
   ./bench report --output webapp/src/data
   ```
2. From `/Users/vcarl/workspace/testbench/llms/webapp` run:
   ```
   npm run dev
   ```
   Vite serves at http://localhost:5173.

**Verification widths (test every task at all four):**

- **375px** — small phone (primary).
- **414px** — large phone.
- **600px** — breakpoint boundary (confirm the phone rules engage at/below 600 and the desktop rules resume at 601).
- **≥900px** — desktop regression spot-check: confirm the layout is byte-for-byte identical to before the change.

**How to resize the viewport:** either browser devtools responsive mode (toggle device toolbar, type the exact px width), or the Claude-in-chrome MCP tools `resize_window` (set width) / `computer` (screenshot + interact). Load the chrome MCP tools first with a single `ToolSearch` `select:` call if you intend to drive the browser via MCP.

**RED/GREEN convention:** RED = before the edit, load the app at a phone width and observe the named breakage (overflow / squeeze / hidden control). GREEN = after the edit, observe it reflow correctly at 375/414/600, then spot-check ≥900 unchanged.

---

### Task 1 — Header wrapping

The header's title + three action links (Request a model / Request a challenge) plus the conditional "← Overview" button overflow horizontally at 375px because `.appHeader` is a non-wrapping flex row and `.appHeaderActions` is `flex: 0 0 auto`.

**Files:**
- Modify: `webapp/src/routes/index.module.css` (append phone query at end of file; current `.appHeader` lines 9-16, `.appHeaderActions` lines 21-26)

- [ ] **RED:** Load http://localhost:5173 at 375px. Observe the header action links overflow the right edge / get clipped or push the title (open a drilldown so the "← Overview" button is also present to make the overflow worse).
- [ ] Append this block to the END of `webapp/src/routes/index.module.css`:
  ```css
  /* Phone breakpoint — keep 600px in sync across modules */
  @media (max-width: 600px) {
    .appHeader { flex-wrap: wrap; gap: var(--space-4); padding: var(--space-5) var(--space-6); }
    .appHeaderActions { flex-wrap: wrap; gap: var(--space-4); width: 100%; }
  }
  ```
- [ ] **GREEN:** Reload at 375px. The action links wrap onto their own full-width row below the title; nothing is clipped. Confirm at 414px and at 600px.
- [ ] **Desktop regression:** At ≥900px confirm the header is a single non-wrapped row, identical to before.
- [ ] **Commit:**
  ```
  git add webapp/src/routes/index.module.css
  git commit -m "feat(webapp): wrap app header actions on phone widths"
  ```

---

### Task 2 — Filter panel stacking + pill wrap + 44px touch targets

At 375px the filter `.panel` 5-column grid (`1fr 1fr 1fr 1fr 2fr`) is unusable (columns crush to a few px each), and the vertical pill stacks inside each group are very tall. Collapse to a single column, let pills wrap horizontally within each group, and bump pills to ≥44px touch height.

**Files:**
- Modify: `webapp/src/components/FilterPanel.module.css` (append phone query at end; current `.panel` lines 3-8, `.pillGroup` line 22, `.pillGroupTwoCol` lines 25-30, `.pill` lines 31-41)

Note (reconciled from reading the file): the outer per-filter wrapper is `.pillRow` (a column flex of label + pill group) and stays column-stacked; the spec's target only restyles `.pillGroup` / `.pillGroupTwoCol` / `.pill`, which is correct — `.panel` going single-column already stacks the `.pillRow`s vertically, and within each group we flip the pill container to wrapping rows.

- [ ] **RED:** Load the app at 375px and scroll to the filter panel (in the scatter lane's bottom pane). Observe the 5-column grid squeezing each filter group into an unusably narrow column; pills inside `.pillGroupTwoCol` (Challenge) sit in a cramped 2-col grid.
- [ ] Append this block to the END of `webapp/src/components/FilterPanel.module.css`:
  ```css
  /* Phone breakpoint — keep 600px in sync across modules */
  @media (max-width: 600px) {
    .panel { grid-template-columns: 1fr; gap: var(--space-5); }
    .pillGroup { flex-direction: row; flex-wrap: wrap; }
    .pillGroupTwoCol { display: flex; flex-direction: row; flex-wrap: wrap; }
    .pill { min-height: 44px; display: inline-flex; align-items: center; }
  }
  ```
- [ ] **GREEN:** Reload at 375px. Each filter group is full-width and stacked; pills wrap horizontally and fill the row width; every pill is at least 44px tall (verify by inspecting computed height in devtools). Confirm at 414px and 600px.
- [ ] **Desktop regression:** At ≥900px confirm the panel is still the 5-column grid with column-stacked pill groups, identical to before.
- [ ] **Commit:**
  ```
  git add webapp/src/components/FilterPanel.module.css
  git commit -m "feat(webapp): stack filter panel and wrap pills with 44px targets on phone"
  ```

---

### Task 3 — Ranking row two-tier reflow

This is the key task. The ranking row grid is `var(--col-rank) minmax(0,1fr) var(--col-score) var(--col-stats)` with `--col-rank:24px; --col-score:5ch; --col-stats:184px`. The fixed 184px stats track squeezes the model name at 375px. Collapse the parent grid to 3 columns and turn `.resultRowAlways` into a 2-row `grid-template-areas` layout so the four stats wrap full-width below tier 1.

**Header reconciliation (from reading `webapp/src/components/RunGroupTable.tsx`, lines 146-180):** the header row is `.resultHeader` wrapping a `.resultRowAlways` whose four children are, in order: `.resultRank` (`#`), a bare `<div>Model / variant</div>`, `.resultScoreHeader` (`Score` + ⓘ popover), and `.resultStatsHeader` (`tok · t/s · mem · wall`). In `RunTable.module.css` line 276, `.resultScoreHeader, .resultStatsHeader { text-align: right; }`. Once stats wrap below each row there is no aligned 4th column for the stats header to label, so it must be **hidden on phone** (`.resultStatsHeader { display: none; }` inside the phone query). The header's `.resultRowAlways` shares the same `grid-template-columns: subgrid` and `grid-column: 1 / 5` as the data rows (RunTable.module.css lines 81-88), so the phone override applies to the header too: its `.resultRank` / bare-model-div / `.resultScoreHeader` land in the `rank model score` areas of tier 1, and (with the stats header hidden) nothing occupies the `stats` area — exactly what we want.

Dropping `subgrid` for explicit columns on `.resultRowAlways` is intentional: the areas grid needs its own named tracks.

**Files:**
- Read: `webapp/src/components/RunGroupTable.tsx` (header markup, lines 146-180) — confirm `.resultStatsHeader` is the stats column header
- Modify: `webapp/src/components/RunTable.module.css` (append phone query at end; current parent grid lines 22-44, `.resultRowAlways` lines 81-88, stats lines 116-121, header lines 266-276)

- [ ] Read `webapp/src/components/RunGroupTable.tsx` lines 146-180 and confirm the header structure described above (`.resultRowAlways` with `.resultRank`, bare model div, `.resultScoreHeader`, `.resultStatsHeader`).
- [ ] **RED:** Load the app at 375px and scroll to the ranking table. Observe the model name column crushed by the fixed 184px stats track — names ellipsize hard and stats are jammed against the right edge.
- [ ] Append this block to the END of `webapp/src/components/RunTable.module.css`:
  ```css
  /* Phone breakpoint — keep 600px in sync across modules */
  @media (max-width: 600px) {
    .resultRow,
    .resultRowCompact,
    .resultHeader {
      grid-template-columns: var(--col-rank) minmax(0, 1fr) var(--col-score);
    }
    .resultRowAlways {
      grid-column: 1 / -1;
      grid-template-columns: var(--col-rank) minmax(0, 1fr) var(--col-score);
      grid-template-areas:
        "rank model score"
        "stats stats stats";
      row-gap: var(--space-3);
    }
    .resultRank      { grid-area: rank; }
    .resultModel     { grid-area: model; }
    .resultScoreCell { grid-area: score; }
    .resultStats     { grid-area: stats; justify-content: flex-start; }
    .resultStatsHeader { display: none; }
  }
  ```
- [ ] **GREEN:** Reload at 375px. Each row is two tiers: tier 1 = rank + model name + score; tier 2 = the four stats wrapping full-width below, left-aligned. The model name now has room and no longer hard-ellipsizes prematurely. The header row shows `# / Model / variant / Score` with NO stats-column header. Confirm at 414px and 600px. Tap a row and confirm it still navigates to the drilldown.
- [ ] **Desktop regression:** At ≥900px confirm rows are still the single-line 4-column layout with the right-aligned 184px stats block and the `tok · t/s · mem · wall` header present, identical to before.
- [ ] **Commit:**
  ```
  git add webapp/src/components/RunTable.module.css
  git commit -m "feat(webapp): reflow ranking rows into two-tier cards on phone"
  ```

---

### Task 4 — Scatter phone height

The container query block sets `:where(.regionScatter) { height: 70vh; min-height: 360px; }` (ShiftFrame.module.css line 69). 70vh is too tall on a phone, pushing the ranking table far below the fold. Add a viewport media query AFTER the container-query block to shrink it. DO NOT edit the container-query rule itself.

**Files:**
- Modify: `webapp/src/components/ShiftFrame.module.css` (add phone query AFTER the `@container` block which ends at line 83; current scatter rule line 69 — do not touch it)

- [ ] **RED:** Load the app at 375px. Observe the scatter plot eats ~70% of the viewport height, pushing the ranking table well below the fold.
- [ ] Add this block to `webapp/src/components/ShiftFrame.module.css` AFTER the `@container shiftFrame (max-width: 899px) { ... }` block (i.e. after line 83, before or after the `prefers-reduced-motion` block — keep it as a sibling top-level query):
  ```css
  /* Phone breakpoint — keep 600px in sync across modules */
  @media (max-width: 600px) {
    .regionScatter { height: 40vh; min-height: 260px; }
  }
  ```
- [ ] **GREEN:** Reload at 375px. The scatter is now ~40vh (min 260px); the ranking table starts much higher and is reachable with little scrolling. Confirm at 414px and 600px. (Specificity note: the plain `.regionScatter` rule beats the container query's zero-specificity `:where(.regionScatter)`, so it reliably overrides.)
- [ ] **Desktop regression:** At ≥900px confirm the scatter is its full desktop height in the side-by-side layout, identical to before (the 600px query does not match desktop).
- [ ] **Commit:**
  ```
  git add webapp/src/components/ShiftFrame.module.css
  git commit -m "style(webapp): shorten scatter plot height on phone"
  ```

---

### Task 5 — Drilldown sheet: full-width + backdrop + in-sheet close button

Below 899px the container query makes `.regionDetails` a `position: fixed; width: 90vw` right overlay at `z-index: var(--z-modal)` that COVERS the header — so the header "← Overview" close button (rendered in `routes/__root.tsx` only when shifted) is hidden, and there is no in-sheet close and no tap-dismiss backdrop. Dismiss currently works only via Escape (ShiftFrame.tsx useEffect, lines 13-20). Add a tap-dismiss backdrop and an in-sheet close button, and on phone widen the sheet to full width.

**Reconciliation (from reading `webapp/src/components/ShiftFrame.tsx`):** the component prop for closing is `onClose` (line 6, 12), and the current details JSX is exactly `<div className={styles.regionDetails}>{details}</div>` (line 27). The new backdrop is rendered as a sibling INSIDE `.shiftFrame`, just before `.shiftCanvas`, gated on `shifted`. The close button is rendered as the first child INSIDE `.regionDetails`. Both new elements default to `display: none` and are revealed only at `@media (max-width: 899px)` (the overlay range — this also fixes the pre-existing tablet gap where the overlay covers the header), with the phone query additionally widening the sheet to 100vw. Tokens `--r-4` (4px), `--fz-16` (16px), `--z-modal` (51), `--surface-3`, `--border-default`, `--text-primary` all confirmed present in `tokens.css` — no substitutions needed.

**Files:**
- Modify: `webapp/src/components/ShiftFrame.tsx` (lines 22-30 JSX return; add backdrop sibling + close button child)
- Modify: `webapp/src/components/ShiftFrame.module.css` (add `.sheetBackdrop` / `.sheetClose` defaults + reveal in the 899px overlay range + phone full-width override)

**Interfaces (class names other steps and the TSX rely on — must match exactly):**
- `.sheetBackdrop` — the tap-dismiss backdrop element (CSS class `styles.sheetBackdrop`).
- `.sheetClose` — the in-sheet close button (CSS class `styles.sheetClose`).
- `.regionDetails` — existing details container; phone query widens it to `100vw`.

- [ ] **RED:** Load the app at 375px, then open a drilldown (tap a ranking row). Observe the details sheet covers the header so there is no visible "← Overview" button, no close button inside the sheet, and tapping outside the sheet does nothing — the only way to close is the keyboard Escape key (unavailable on a phone).
- [ ] Edit `webapp/src/components/ShiftFrame.tsx`. Replace the current return block (lines 22-30):
  ```tsx
  return (
    <div className={styles.shiftFrame}>
      <div className={styles.shiftCanvas} data-shifted={shifted}>
        <div className={styles.regionScatter}>{scatter}</div>
        <div className={styles.regionRanking}>{ranking}</div>
        <div className={styles.regionDetails}>{details}</div>
      </div>
    </div>
  );
  ```
  with:
  ```tsx
  return (
    <div className={styles.shiftFrame}>
      {shifted && (
        <div className={styles.sheetBackdrop} onClick={onClose} aria-hidden="true" />
      )}
      <div className={styles.shiftCanvas} data-shifted={shifted}>
        <div className={styles.regionScatter}>{scatter}</div>
        <div className={styles.regionRanking}>{ranking}</div>
        <div className={styles.regionDetails}>
          <button
            type="button"
            className={styles.sheetClose}
            onClick={onClose}
            aria-label="Close details"
          >
            ×
          </button>
          {details}
        </div>
      </div>
    </div>
  );
  ```
  (The backdrop sits inside `.shiftFrame` but before `.shiftCanvas`, so it renders behind the `z-modal` `.regionDetails` overlay; its CSS `z-index: calc(var(--z-modal) - 1)` keeps it below the sheet and above the rest.)
- [ ] Add this to `webapp/src/components/ShiftFrame.module.css`. Put the `.sheetBackdrop` / `.sheetClose` default-hidden rules and the `@media (max-width: 899px)` reveal block after the existing `@container` block (after line 83), and the phone `@media (max-width: 600px)` override after that:
  ```css
  .sheetBackdrop { display: none; }
  .sheetClose { display: none; }

  @media (max-width: 899px) {
    .sheetBackdrop {
      display: block;
      position: fixed;
      inset: 0;
      background: rgb(0 0 0 / 0.5);
      z-index: calc(var(--z-modal) - 1);
    }
    .sheetClose {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      position: sticky;
      top: var(--space-4);
      margin-left: auto;
      width: 44px;
      height: 44px;
      background: var(--surface-3);
      color: var(--text-primary);
      border: 1px solid var(--border-default);
      border-radius: var(--r-4);
      font-size: var(--fz-16);
      line-height: 1;
      cursor: pointer;
      z-index: 1;
    }
  }

  /* Phone breakpoint — keep 600px in sync across modules */
  @media (max-width: 600px) {
    .regionDetails { width: 100vw; border-left: none; }
  }
  ```
  (`.regionDetails` is `overflow-y: auto`, so the `position: sticky` close button stays reachable while scrolling. The plain-class `.regionDetails` phone override beats the container query's zero-specificity `:where(.regionDetails)`.)
- [ ] **GREEN (phone):** Reload at 375px and open a drilldown. The sheet is full-width (100vw, no left border). A 44×44 close button (×) is visible at the top-right of the sheet and stays put while scrolling the sheet. A dimmed backdrop covers the rest of the screen. Tapping the close button closes the sheet; tapping the backdrop closes the sheet; Escape still closes it. Confirm at 414px and 600px.
- [ ] **GREEN (tablet 600–899):** At ~800px open a drilldown. The 90vw overlay still covers the header, but now the in-sheet close button and the tap-dismiss backdrop are present and work (this fixes the pre-existing tablet gap).
- [ ] **Desktop regression:** At ≥900px open a drilldown. The details panel is the side-by-side lane (no fixed overlay); the backdrop and the in-sheet close button are `display: none`; closing works via the header "← Overview" button and Escape exactly as before.
- [ ] **Commit:**
  ```
  git add webapp/src/components/ShiftFrame.tsx webapp/src/components/ShiftFrame.module.css
  git commit -m "feat(webapp): add tap-dismiss backdrop and in-sheet close to drilldown overlay"
  ```

---

### Task 6 — Final responsive verification pass

A whole-app walkthrough at every width to confirm the five reflows compose correctly and the desktop layout is untouched. Capture any small polish (spacing nits) and commit it.

**Files:**
- Modify (only if polish is needed): any of the five touched CSS files above

- [ ] At **375px**, walk the full app top to bottom: header (actions wrapped, nothing clipped) → filter panel (single column, pills wrapped, 44px) → scatter (~40vh) → ranking (two-tier rows, no stats header) → open a drilldown (full-width sheet, 44px close, backdrop) → close via each of: close button, backdrop tap, Escape.
- [ ] Repeat the full walk at **414px**.
- [ ] Repeat the full walk at **600px** (boundary): confirm phone rules are active at exactly 600 and that resizing to 601 flips everything back to desktop layout.
- [ ] **Desktop regression at ≥900px:** confirm header, filter panel, scatter, ranking, and drilldown all render identically to the pre-change desktop layout (side-by-side scatter/ranking/details, 4-column rows, 5-column filters, no backdrop/close-button).
- [ ] **Note (no code):** the scatter↔ranking hover cross-highlight degrades gracefully on touch — no hover events fire on a phone, and tapping a ranking row navigates to the drilldown. This is acceptable per the spec (the scatter is demoted on touch); no tap-equivalent for cross-highlight is needed.
- [ ] If any small spacing/alignment polish was found, make the minimal edit, re-verify the affected width and the ≥900 regression, then commit:
  ```
  git add webapp/src/components/ShiftFrame.module.css webapp/src/components/RunTable.module.css webapp/src/components/FilterPanel.module.css webapp/src/routes/index.module.css
  git commit -m "style(webapp): polish phone responsive spacing"
  ```
- [ ] If no polish was needed, record the verification result in the task notes and finish (no empty commit).
