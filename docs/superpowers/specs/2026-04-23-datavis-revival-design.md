# Data visualization revival — design

Date: 2026-04-23
Branch: `phase-a-foundation`

## Overview

The home route currently renders a filter-driven `ResultTable`. This spec reintroduces a scatter plot above the list and replaces the current row component with a richer listview that absorbs ideas from the retired v1 leaderboard. Both views share the same `FilterBar` state and the same filtered dataset.

Two user-facing surfaces change:

1. **New scatter chart**, rendered on the home route above the list when `groupBy=model`.
2. **Rewritten listview row**, replacing the current `ResultRow` with per-variant bars, an efficiency metric, and a hover-expanded capability profile.

All other infrastructure (FilterBar, presets, `pipeline.ts`, routing, side panel, detail pages, `data.js` generation) stays.

## Scatter chart

### Encoding

| Channel       | Mapped to                                                                   |
| ------------- | --------------------------------------------------------------------------- |
| X (log)       | Avg tokens per run, 500 → 5000 typical range                                |
| Y (linear)    | Pass rate, 0–100%                                                           |
| Size          | Max memory (GB), area-proportional: `r = 7 + √mem × 2.6`                    |
| Color         | Model family                                                                |
| Shape         | N-pointed star, inner/outer radius ratio 0.75 (soft scalloped look)         |
| N (star pts)  | `clamp(6 + floor(log₂(tokens / 500) × 2.4), 6, 18)`                         |
| Dotted line   | Chronologically-ordered trajectory connecting all variants of a base model  |

One star per `(base_model × runtime × quant × temp)` combination. The dotted line traverses them in timestamp order regardless of runtime/quant/temp.

### Memory fallback

If the current (model, runtime, quant) combination has no `max_memory` recorded, use the memory figure from another variant of the same base model. This is a ballpark — precise memory is not required for visual encoding.

### Hover

Hover a star to see: model name, quant, runtime, timestamp, pass rate, tokens, memory. Hover also populates the shared hover store (see Cross-highlight).

### Legend

Family swatches · area-sized memory references (1 / 5 / 15 GB) · star-point references derived from the formula: 6 pts ≈ 500 tokens, 8 ≈ 1k, 10 ≈ 2k, 13 ≈ 4k, 15 ≈ 8k, 18 ≈ 16k+.

## Listview row

Replaces the current `ResultRow`. One row per group (default `groupBy=model`). Columns:

| Column        | Content                                                                     |
| ------------- | --------------------------------------------------------------------------- |
| Rank          | 1-indexed position under current sort                                       |
| Model         | Base model name + family label                                              |
| Score         | Best pass rate across variants · below it, `N tok/pt` efficiency metric     |
| By variant    | Stack of thin bars, one per `(runtime · quant · temp)`, best-first          |
| Capabilities  | 10-tag color strip (existing palette); hover opens detail card              |
| Memory        | GB · best-quant label below                                                 |
| Tokens        | Avg tokens/run                                                              |

**Efficiency:** `floor(best_variant_tokens / best_score)` → smaller is better.

**Variant bars:** each sub-bar uses the family color; opacity falls off for lower-ranked variants (0.55 to 1.0). Labels are monospace: `lcpp q8 t0`. Bar widths = `score%` of track.

**Sort buttons** (replaces existing sort): best · efficiency · memory. Sorts the list only — scatter retains its own ordering.

**Capability hover card:** table of 10 tag rows showing tag name, mini progress bar, pass %, and run count. Tags with no runs show hatched strip inline and "no data" in the card.

## Components

### New

- `webapp/src/components/Scatter.tsx` — SVG scatter; reads filtered dataset from parent, aggregates to variant dots, draws trajectories and stars. Writes hover state to `hover-store`.
- `webapp/src/components/ScatterLegend.tsx` — standalone legend (family / memory / star points).
- `webapp/src/components/CapabilityHoverCard.tsx` — the expanded tag detail popover, positioned near the pointer.
- `webapp/src/lib/hover-store.ts` — minimal React store: `{ hoveredModel: string | null, setHovered, clearHovered }`. Plain `useSyncExternalStore` is sufficient; no dependency added.

### Replaced

- `webapp/src/components/ResultRow.tsx` — new markup matching the prototype.
- `webapp/src/components/ResultTable.tsx` — header columns updated; sort buttons updated (best / efficiency / memory).
- `webapp/src/components/CapabilityBar.tsx` — kept; now triggers `CapabilityHoverCard` on hover. The inline strip markup is unchanged.

### Modified

- `webapp/src/routes/index.tsx` — conditionally renders `<Scatter>` above `<ResultTable>` when `groupBy=model`. When `groupBy ≠ model`, scatter is hidden.
- `webapp/src/lib/pipeline.ts` — adds `aggregateForScatter(records)` and `aggregateForList(groups)` helpers. Existing `aggregate` stays for any non-list consumers.

## Data flow

```
data.js ──► normalizeRecord ──► filters (applyFilters)
                                       │
                          ┌────────────┴─────────────┐
                          ▼                          ▼
                  aggregateForScatter        groupRows(groupBy)
                          │                          ▼
                          │                  aggregateForList
                          ▼                          ▼
                      <Scatter>               <ResultTable>
```

Both branches consume the same filtered set. `groupBy` only affects the list. Sort state is list-only.

### `aggregateForScatter`

Input: filtered `BenchmarkResult[]`. Output: `ScatterDot[]` where each dot is:

```ts
{
  baseModel: string;
  family: string;
  runtime: string;
  quant: string;
  temp: number;
  timestamp: string;   // for chronological line ordering
  score: number;       // pass rate 0..100
  tokens: number;      // avg per run
  mem: number;         // max memory, with fallback to sibling variant
}
```

Fallback rule: if records for this variant don't carry `max_memory`, pick the median `max_memory` across other variants of the same base model. If none exists, omit the dot from the chart (cannot size it).

### `aggregateForList`

Input: output of `groupRows(groupBy)`. Output per row:

```ts
{
  key: string;         // model, or prompt/tag/category depending on groupBy
  family?: string;     // populated when groupBy=model
  bestScore: number;
  bestVariant: { runtime, quant, temp, tokens };
  efficiency: number;  // tok/pt
  variants: Array<{ runtime, quant, temp, score, tokens }>;
  capability: Array<{ tag: string; pass: number | null; runs: number }>;
  mem: number;
  avgTokens: number;
}
```

## Cross-highlight

Only active when `groupBy=model`.

Scatter dot `mouseenter` → `hover-store.setHovered(baseModel)`. `mouseleave` → `clearHovered()`. Listview row mirrors the same pattern.

Consumers react:

- **Scatter:** dots where `baseModel === hoveredModel` render at `fill-opacity: 0.95` with thicker stroke; other dots drop to `0.35`.
- **ResultTable:** the matching row gets a subtle background tint; other rows dim slightly.

When `groupBy ≠ model`, list rows never call `setHovered` (they have no model key), and scatter-dot hovers still set the store but no list row matches. Scatter's internal highlight still works.

## Testing

Follows existing vitest patterns (`webapp/src/**/*.test.ts(x)`).

- `Scatter.test.tsx` — dot count matches aggregated variants; star-point function at 500/1k/2k/5k/16k boundaries; dotted line vertex order matches timestamp order; memory fallback populates missing sizes; scatter hides when `groupBy ≠ model`.
- `aggregateForScatter.test.ts` — deduplication, memory fallback (present, sibling fallback, fully missing).
- `aggregateForList.test.ts` — variant ordering (best first), efficiency calc, capability profile with `null` passes for missing tags.
- `CapabilityHoverCard.test.tsx` — renders ten rows; hatched fallback for `null` pass; correct tag labels.
- `hover-store.test.ts` — set / clear / subscribe behavior.

The existing home-route test is extended to assert `<Scatter>` is in the DOM when `groupBy=model` and absent otherwise.

## Out of scope

- Per-`groupBy` chart variants (the alternative we rejected)
- Heatmap revival
- Configurable scatter axes (tokens and pass rate are fixed)
- Configurable star-point scale
- Scatter as a separate route
- View toggle (chart-or-list segmented control)
- Pinning/multi-select of models
- Pass-threshold horizontal reference line
- Click-through from scatter dot to detail panel (nice-to-have; not required for v1)

## Open questions

None blocking. Dot click-through behavior is deferred; a dot is currently hover-only.
