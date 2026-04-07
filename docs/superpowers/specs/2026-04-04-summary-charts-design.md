# Summary Charts for HTML Benchmark Report

**Goal:** Add two summary charts above the existing heatmaps in the HTML report to communicate model performance across multiple dimensions at a glance.

## Charts

### 1. Score vs Speed Scatter (D3)

A D3-rendered scatter plot showing the tradeoff between accuracy and generation speed.

**Visual encoding:**
- **X axis:** Average generation t/s (higher = faster)
- **Y axis:** Average score across all prompts (higher = better)
- **Dot size:** Peak memory in GB (from MLX data, used for both runtimes since memory footprint doesn't vary substantially between runtimes for the same model)
- **Dot color:** Runtime — blue (#3b82f6) for llamacpp, green (#22c55e) for mlx
- **Hover tooltip:** Model name, runtime, exact score %, gen t/s, memory

Each model+runtime combo is one dot. The ideal position is top-right (fast and accurate). Dot size gives a sense of the hardware cost — larger models are bigger circles.

Dots should have ~0.5 opacity with a 1px stroke of the same color so overlapping dots remain distinguishable.

### 2. Model Leaderboard

A ranked bar chart showing all models sorted by overall score, with duration and memory encoded in the bar geometry.

**Visual encoding:**
- **Y position (sort order):** Average score across both runtimes, descending (best model on top)
- **Bar width:** Total wall duration across all prompts. Split proportionally into llamacpp (blue) and mlx (green) segments. Wider = slower.
- **Bar height:** Peak memory in GB (from MLX). Taller = more memory. This makes large models visually heavy and small models visually compact.
- **Right annotation:** Score percentage (colored using the same score→color scale as heatmaps) and total duration + memory as secondary text.

Models that only have data for one runtime show a single-color bar.

## Layout

Both charts sit in a horizontal flex row above the existing heatmaps, inside the `.content` area. Each chart is in a white card with the same border/radius as the detail panel. They share equal flex width.

## Data Requirements

The JSON data blob already includes `prompt_tps`, `generation_tps`, and `wall_time_sec`. It needs to also include `peak_memory_gb` so the charts can size dots and bar heights.

For the scatter, aggregation happens client-side: group by (model, runtime), compute average score, average generation_tps, and max peak_memory_gb.

For the leaderboard, aggregation groups by model across both runtimes: average score from both, sum wall_time per runtime, max peak_memory_gb from MLX data.

## Integration

- **D3:** Loaded via CDN (`<script src="https://d3js.org/d3.v7.min.js">`). The report is already a self-contained HTML file; this adds one external dependency.
- **Model filter:** Both charts respect the existing model checkbox filter. When a model is unchecked, its dots/bars are hidden.
- **Rendering:** Charts are rendered by a JS function called after `renderAllHeatmaps()` in the existing IIFE. They re-render when the model filter changes.

## Existing code changes

- `report.py` `save_html_report`: Add `peak_memory_gb` to the data records serialized into `DATA`.
- `report.py` `_HTML_TEMPLATE`: Add D3 CDN script tag, CSS for chart cards, and JS for both chart renderers.
- No changes to common.py, runner.py, or benchmark.py.
