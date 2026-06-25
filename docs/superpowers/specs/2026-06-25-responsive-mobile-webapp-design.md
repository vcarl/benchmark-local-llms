# Responsive / mobile design for the report webapp

## Goal

Make the benchmark report webapp (`webapp/`) usable on phones. The target use
case is **lightweight analysis**: filtering, reading the ranking table, and
drilling into a model should all feel good on a phone. The scatter plot is
demoted on touch — it stays viewable but is not the primary interaction, since
its hover-sync juxtaposition does not translate to touch.

## Scope

- **Primary:** phones, `max-width: 600px`.
- **Secondary:** the 600–899px tablet range gets opportunistic fixes only
  (fix what is obviously broken while editing each file), not a dedicated
  design pass.
- **Out of scope:** the existing ≥900px desktop layout must render identically
  after this work. No component-logic rewrites; this is primarily CSS reflow
  plus small markup tweaks where a row card structure requires them.

## Approach: hybrid breakpoint mechanism

`ShiftFrame` already drives the structural scatter / ranking / details pivot
with a container query at 899px. That stays as-is.

- **Structural layout** (the scatter/ranking/details arrangement) remains
  container-query driven via the existing `ShiftFrame` pivot.
- **Within-component reflow** (row stacking, filter wrapping, header) uses
  **viewport media queries** at a single phone breakpoint of `600px`.

Because `ShiftFrame` fills the viewport, container width ≈ viewport width, so
the two mechanisms do not fight. The phone breakpoint is documented as a
comment constant in CSS (a custom property cannot be used inside a media
condition).

```css
/* Phone breakpoint: keep in sync across modules. */
/* @media (max-width: 600px) */
```

## Design

### 1. View arrangement — vertical scroll stack

Below 600px the page is a vertical scroll stack:

- Scatter plot on top at a reduced fixed height (~300px, `~40vh`).
- Ranking table flows below it.
- The page scrolls through both.

This extends the existing `≤899px` container behavior (which already stacks
scatter → ranking and overlays details). The phone work tunes scatter height
and spacing; it does not introduce a new layout model.

### 2. Ranking row reflow

Below 600px each ranking row becomes a two-tier card:

- **Tier 1:** glyph + model name + score.
- **Tier 2:** the four stats (tokens / t·s / memory / wall) wrap as chips
  below tier 1.

The fixed `--col-stats: 184px` column collapses. The row grid goes from four
columns to a stacked `grid-template-areas` arrangement. No data is hidden;
rows become taller.

### 3. Drilldown as a sheet

The details panel already becomes a fixed `90vw` right overlay below 899px.
On phone it becomes effectively full-screen (`100vw`, or `100vw` minus a small
inset), with:

- A clear close affordance (≥44px tap target).
- Tap-to-dismiss backdrop.

This is a sheet pattern over the scroll stack.

### 4. Filter panel

The 5-column grid (`1fr 1fr 1fr 1fr 2fr`) collapses below 600px to a wrapping
flow:

- Filter groups stack vertically.
- Pills wrap within each group.
- Tap targets bumped to ≥44px height.

### 5. Header

Title + the three action links (Request a model / Request a challenge /
← Overview) wrap gracefully below 600px instead of overflowing. No hamburger
menu — it is only a few links, so responsible wrapping is sufficient.

### 6. Touch polish

- Minimum 44px tap targets on rows, pills, and the sheet close.
- Hover-only affordances (cross-highlight between scatter and ranking) either
  get a tap equivalent or degrade gracefully, since the scatter is demoted on
  touch.

## Files touched

- `ShiftFrame.module.css` — scatter height / spacing tuning for phone.
- `RunTable.module.css` + `RunRowItem` styles — two-tier row card.
- `DrilldownPanel.module.css` — full-screen sheet on phone.
- `FilterPanel.module.css` — wrapping filter flow.
- `index.module.css` — header wrapping.
- `tokens.css` / `global.css` — documented breakpoint comment.

## Testing

- 375px (small phone), 414px (large phone), and a 600px boundary check.
- Desktop regression: confirm the ≥900px layout renders identically.
