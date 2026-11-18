# Model list and filter column

## Problem

The webapp ranks configurations it assembles itself from a flat attempt list: it guesses runs, picks a challenge universe, and groups by the raw artifact string. The report now selects evidence into rows (`__BENCHMARK_ROWS`, see [SCORING.md § Report rows](../../SCORING.md#report-rows)). The model list, the scatter and the drilldown read only those rows. The webapp sums cells and displays; it never chooses evidence.

## Data contract

`data.js` assigns one global: `globalThis.__BENCHMARK_ROWS = RowsDataset[]`, the main dataset first. `__BENCHMARK_DATA` and the per-attempt `WebappRecord` are gone; nothing reads them.

`bench report` emits the dataset named by `--archive-dir` / `--challenges-dir`. The webapp handles several datasets (a Set control, a Pilot preset for a dataset labelled `pilot1`); both appear only when the data has more than one dataset.

**Fields the archives cannot fill.** The report carries some row fields at fixed values until the archives record them: item scopes (empty), failure kinds (empty), near-miss credit (0), samples per item (1), hardware (`unknown`, no profile), submitter (`local`), release and errata (none). Every item is its own uncertainty family. The webapp hides what has no data: the Items control (core / stretch) when no challenge has scoped items, the scope split, near-miss credit and failure breakdown in the drilldown when empty, and the release and errata in the header.

Each row gains:

- `modelKey`: the artifact normalized to a model identity: last path segment, lower-cased, an `org_` prefix dropped, and packaging tokens (`gguf`, `mlx`, `Nbit`, `mxfp4`, `qN…`, `oqNe`) dropped. GGUF, MLX, omlx and llama.cpp builds of one model share it.
- `modelName`: the same normalization with case kept, for display.

A `configs.yaml` entry may set `modelKey:` where the heuristic is wrong. The override applies to every row with that entry's artifact. It is report metadata, never hashed. `src/report/model-key.test.ts` lists the groups produced from the real `configs.yaml`.

Each scored cell gains `cost: { tokens, wallSec, peakMemoryGb, genTps }` (item-mean tokens and wall time summed, peak memory max, generation speed mean) and `scopeFamilies: { core: {family: [n, y]}, stretch: … }`, so the scatter and a scoped standard error need nothing else.

## Rows, groups, ranking

A **row** is one configuration on one machine in one dataset. A **model** is the rows sharing a `modelKey`. Grouped by model (the default), the list shows one entry per model, led by its best row, with a quiet `+N` that expands its other rows. Grouping `none` lists rows flat.

Every number is recomputed from the row's cells under the current scope:

- `passed`, `items`: summed over the selected cells (a non-scored cell contributes its items and 0 passed).
- **Adjusted score** = `passed / items`, missing items counted as fails. It equals the report's `passRate` under the default scope.
- **Running score** = `passed / items of scored cells`: how well the row did on what it ran.
- **Completeness** = scored cells / selected cells with items in scope.
- **CI**: the CR1 family-clustered SE over the selected cells' families (`scopeFamilies` under core or stretch); none below 5 families.

- **Efficiency** = adjusted score · (1000 / tokens per item)^0.25, tokens per item over the scored cells (docs/SCORING.md § Efficiency). Shown ×100 in the `eff` column.

The list ranks by the adjusted score. A complete row displays it. An incomplete row displays its running score muted, with its completeness: `86% · 5/11`. The tooltip says `ranked at 47%: 86% over the 5 of 11 challenges run; missing challenges count as fails`. A higher displayed % can therefore sit below a lower one, and the muted figure tells the reader why. Rank numbers count list entries.

**Tiers, not ties.** Under the score sort the list is cut into tiers: a tier runs from its head until an entry whose paired 95% CI against the head excludes 0, and that entry heads the next tier. A thin rule marks each boundary (`Tier 2 · below #1 at 95%`); there is no per-rank `≈`. Marking every entry whose CI against its neighbour includes 0 marked 19 of the top 20 on the main set, because adjacent entries are a point apart with 10–20-point paired intervals; it said nothing. An equivalence criterion (paired CI inside ±2, ±3 points) marks none. Tiers mark where the data does separate entries: on the default view, boundaries before #9 and #17, so two rules and no `≈` in the top 20. Tiers chain from heads, not neighbours, so an entry can sit in a lower tier than one it is not resolved from; the drilldown shows the paired difference against the entry above and against the head it was tested against.

**In scope.** A row is in scope when at least one of its selected cells is scored with items in scope. The list, the scatter, the facet counts and the funnel use in-scope rows only: a row with nothing scored under the scope has no score, cost or point to show. Zero-scored rows that ran are shown. Legacy attempts belong to the reporting machine. Provenance is a dot after the name when `provenance.mixed`; hovering shows runtime builds, shas, and the execution span.

## Scope vs filter

A **scope** changes what the score means, so every row's number, CI, completeness and rank change:

- **Set**: the dataset (`main`, `pilot1`). Rows never mix sets.
- **Items**: all, core, or stretch.
- **Challenges**: all, or a subset of the set's challenges.

A **filter** hides rows and never changes a score: runtime, quant, family, hardware, submitter, "complete only", and "fits in N GB" (peak memory under the scope ≤ N).

The control column puts scopes in a framed block at the top, titled "Scoring", separate from "Filter rows".

## Control column

Top to bottom:

1. **Title**: the row funnel, preceded by a non-default item scope or challenge subset (`core · 3 challenges · …`). The funnel reads `109 rows · 108 in scope · 108 match · 42 models`: rows of the set → rows in scope → in-scope rows passing the filters (the list's rows) → distinct models (`modelKey`) among them, whatever the grouping. The title is the column's head button and the same text in both states; collapsing rotates it 90° into the bar (an animated transform about its corner), expanding lays it flat. A short wording that reads both ways was chosen over separate collapsed and expanded summaries.
2. **Scoring**: Set (segmented), Items (all / core / stretch), Challenges (checkbox list with each challenge's item count; none checked = all).
3. **Filter rows**: one checkbox list per facet (runtime, quant, family, hardware, submitter), each value with a live count. The count is the number of rows that would show if this value were selected together with every other active filter. Below: "Complete only" and "Fits in" (any, 16, 32, 64, 128 GB).
4. **View**: Group (model / none) and Sort (score, efficiency, speed, memory, recent; each with its natural direction).
5. Footer: `Showing N of M rows in scope` (the funnel's match and in-scope counts) and Reset, which restores the default settings and keeps the selection and zoom.

Collapsed, the column is a 44 px bar holding the rotated title. Clicking the bar expands it; clicking the title collapses it.

## Presets

Presets are a chip row above the list, outside the column, so they are one click away with the column collapsed. The row scrolls sideways inside its own strip (never the page, at 390 px included). A preset is a full setting of the controls; choosing one replaces the settings and keeps the column state, the selection, the drilldown and the zoom. The chip shown as active is the preset whose settings equal the current state; any edit leaves none active.

| Name | Settings (all others default) |
|---|---|
| Leaderboard | the defaults: set main, all items, all challenges, no filters, group model, sort score |
| Top complete | complete only |
| Fits 32 GB | fits in 32 GB |
| Fast | complete only, group none, sort speed |
| Efficient | sort efficiency |
| Pilot set | set pilot1 (shown only when the data has it) |

Fast stays a generation-speed view: speed is what a reader on this machine feels, and it is honest about being hardware-bound. Efficient is the hardware-independent cost view.

## URL state

All state lives in the hash route's search, so a view is shareable. A default is omitted from the URL.

| Param | Value |
|---|---|
| `set` | dataset label |
| `items` | `core` \| `stretch` |
| `ch` | challenge ids, comma-separated |
| `runtime`, `quant`, `family`, `hw`, `sub` | values, comma-separated |
| `complete` | `1` |
| `mem` | GB cap |
| `group` | `none` |
| `sort` | `efficiency` \| `speed` \| `memory` \| `recent` |
| `filters` | `open` |
| `row`, `attempt` | drilldown: the open row and attempt |
| `sel` | the selected (highlighted) row |
| `vp` | scatter zoom: `x0,x1,y0,y1` (tokens to 4 significant figures, pass rate to 4 decimals) |

There is no preset parameter: the active preset is derived from the state. Parsing and serializing are pure functions with a round-trip test.

**Selection.** Choosing a row (list or scatter) sets `row` and `sel`. Closing the drilldown clears `row` and keeps `sel`, so the row stays highlighted in the list (tinted, with an accent bar) and ringed and labelled in the scatter, across filter and preset changes while it is still shown. In the side-by-side layout a selection scrolls its list row into view. A tap on the scatter background clears `sel`.

## Layout

```
Collapsed (1440)
+---------------------------+--+--------------------------------------------+
| scatter                   |1 | [Leaderboard] [Top complete] [Fits 32 GB] …|
|                           |0 | #  model             score  eff  tok  t/s  |
|      *   *                |9 | 1  gpt-oss-20b        87%    90  160k  124 |
|   *     *  *              |r |    +3 variants                             |
|                           |o | 2  Qwen3.8-27B  •    88%·   89  164k   19  |
|                           |w | -- TIER 2 · BELOW #1 AT 95% ---------------|
|                           |s | ...                                        |
+---------------------------+--+--------------------------------------------+

Expanded (1440)
+---------------------------+-----------------+--------------------------+...
| scatter (same width)      | 109 rows · 108… | [Leaderboard] [Top..] [..|  (chips scroll)
|                           |                 | #  model           score |eff  (clipped,
|                           |                 | 1  gpt-oss-20b      87%  | scrolls)
|                           | Scoring         | 2  Qwen3.8-27B •    88%  |
|                           |  Set main|pilot | ...                      |
|                           |  Items all|core |                          |
|                           |  Challenges [ ] |                          |
|                           | Filter rows     |                          |
|                           |  runtime  mlx 38|                          |
|                           | View group/sort |                          |
|                           | Showing 41 of 108 Reset                    |
+---------------------------+-----------------+--------------------------+...
```

The preset chips sit above the list in both states. The scatter keeps half the width minus half the bar. The bar widens to 340 px in place, so the list loses width on its right. The list's result-stat columns move off screen and the list scrolls horizontally; glyph, rank, name and score stay visible.

Opening the drilldown slides the scatter out of view, as before: bar, list and drilldown fill the frame.

Below 900 px the lanes stack: scatter, a one-line filter bar (the title, horizontal), the preset chips, then the list. Opening the filters raises the column as a full-screen sheet with a Done button. The drilldown is a full-width overlay.

## Scatter

One point per visible row: x = generation tokens, y = adjusted score, and the glyph encodes memory, wall time and speed from the scoped cells' `cost`. Hover is shared with the list by `rowId`.

**Zoom and pan.** The full extent fits the visible points. A zoomed view (`vp`) is clamped into it, with a minimum span of 1 point on y and a 2% ratio on x; a view as large as the extent is no view. Zooming scales both axes about the pointer, x in log space. Axes re-tick for the view (log ticks refine to every digit, then to linear 1/2/5 steps inside a decade); points and glyphs keep their size, points outside are clipped, and only points in view are labelled. The view follows a gesture frame by frame and goes to the URL 250 ms after it settles, replacing the history entry. A Reset zoom button shows while zoomed.

Gestures, recognized by a pure reducer (`lib/gesture.ts`) over pointer events:

| Input | Action |
|---|---|
| click | select the point under it (after the 300 ms multi-click window, so a double-click never selects); on the background, clear the selection |
| double-click | zoom in ×2 at the pointer |
| triple-click | zoom out ×2 |
| drag | pan |
| press on the second click and drag | continuous zoom about the press: up zooms in, down out |
| touch tap | select at once |
| one-finger drag | pan |
| pinch | zoom about the fingers' midpoint, panning with it |
| three-finger vertical swipe | zoom: up in, down out |

The plot sets `touch-action: none`, so it owns touch gestures inside its bounds; the page scrolls everywhere else.

## Drilldown

It reads the row, its cells, `hardware[row.hardwareId]` and the dataset only:

- Identity: model name, artifact, config id and hash, runtime, quant, temperature, variant knobs, hardware profile, submitters.
- Score under the scope: adjusted % ± CI, running % with completeness, rank and tier with the paired difference against the entry above and the tier head, efficiency with tokens per item, passed / items, core and stretch, near-miss credit, failure kinds.
- Provenance: executed from–to, runtime versions, git shas, samples per item, re-stamped cells, and the mixed reason.
- One line per selected challenge: status (`scored`, `stale hash`, `interrupted`, `not run`), passed / items, %, executed dates, samples, runtime. Clicking a scored line lists its source attempts; choosing one opens its items (prompt, output, thinking, scorer) from `details/<attemptId>.json`.

## What goes

The `__BENCHMARK_DATA` reader and everything built on it: `data.ts` normalization, the run-splitting `pipeline.ts`, `coverage.ts`, `filter-state.ts`, `FilterPanel`, `RunGroupTable`, `RunRowItem`, `ConfigSummaryPanel`, `DebugPanel`, Top-N, the dead `sort*` params, and on the report side `WebappRecord`, `toWebappRecord` and the records in `aggregate.ts`. What survives is moved, not duplicated: the scatter's encoding helpers, the glyph, the artifact-name helpers, the CR1 estimators and the attempt-detail loader.

## Deferred

The webapp ships a dark theme only. Temperature is no longer a facet; it is in each row's variant line. A history view per `invocationId` is not part of this list.
