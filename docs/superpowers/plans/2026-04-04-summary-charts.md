# Summary Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Score vs Speed scatter plot (D3) and a Model Leaderboard bar chart above the existing heatmaps in the HTML benchmark report.

**Architecture:** Both charts are rendered client-side from the existing `DATA` JSON blob (with `peak_memory_gb` added). D3 v7 is loaded via CDN. Charts are rendered inside a new `#summary-charts` div above the heatmaps, re-rendered when the model checkbox filter changes.

**Tech Stack:** D3.js v7 (CDN), vanilla JS, CSS — all inside the existing `string.Template` HTML template in `report.py`

---

### File Structure

All changes are in one file:
- **Modify:** `report.py`
  - `save_html_report` function (~line 530): add `peak_memory_gb` to data records
  - `_HTML_TEMPLATE` string (~line 210): add D3 CDN, CSS, HTML container, and chart JS

**Important note about the template:** `_HTML_TEMPLATE` is a `string.Template` which uses `$identifier` for substitution. All literal `$` characters in the JS code must be escaped as `$$`. Avoid JS template literals (`${...}`) entirely — use string concatenation instead, matching the existing code style.

---

### Task 1: Add `peak_memory_gb` to serialized data

**Files:**
- Modify: `report.py:530-546` (data serialization in `save_html_report`)

- [ ] **Step 1: Add peak_memory_gb to the data record dict**

In `save_html_report`, find the data record dict (line ~532-546) and add `peak_memory_gb` after the `prompt_text` entry:

```python
    data_records = []
    for r in scored_results:
        data_records.append({
            "model": r.model,
            "runtime": r.runtime,
            "prompt_name": r.prompt_name,
            "category": r.category,
            "tier": r.tier,
            "style": r.style,
            "score": r.score,
            "score_details": r.score_details,
            "prompt_tps": r.prompt_tps,
            "generation_tps": r.generation_tps,
            "wall_time_sec": r.wall_time_sec,
            "peak_memory_gb": r.peak_memory_gb,
            "output": r.output,
            "prompt_text": r.prompt_text,
        })
```

- [ ] **Step 2: Verify the data includes memory**

```bash
python3 -c "
from common import load_all_results, load_prompts
from runner import score_results
results = load_all_results()
prompts = load_prompts()
score_results(results, prompts)
mlx_with_mem = [r for r in results if r.runtime == 'mlx' and r.peak_memory_gb > 0]
print(f'{len(mlx_with_mem)} MLX results have peak_memory_gb > 0')
if mlx_with_mem:
    r = mlx_with_mem[0]
    print(f'  Example: {r.model} = {r.peak_memory_gb:.1f} GB')
"
```

- [ ] **Step 3: Commit**

```bash
git add report.py
git commit -m "Add peak_memory_gb to HTML report data"
```

---

### Task 2: Add D3 CDN, chart CSS, and chart container HTML

**Files:**
- Modify: `report.py:210-280` (HTML template head/body)

- [ ] **Step 1: Add D3 CDN script tag**

In `_HTML_TEMPLATE`, find the closing `</style>` tag and `</head>` tag (line ~263-264). Add the D3 script between them:

```html
</style>
<script src="https://d3js.org/d3.v7.min.js"></script>
</head>
```

- [ ] **Step 2: Add CSS for summary chart cards**

Add these rules inside the `<style>` block, before the closing `</style>` tag (after the `.prompt-result-output` rule around line 262):

```css
.summary-charts { display: flex; gap: 16px; margin-bottom: 24px; }
.chart-card { flex: 1; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; }
.chart-card h3 { font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 4px; }
.chart-card .chart-subtitle { font-size: 11px; color: #6b7280; margin-bottom: 12px; }
.chart-card svg { width: 100%; }
.leaderboard-row { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; font-size: 11px; }
.leaderboard-name { width: 110px; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #374151; font-weight: 500; flex-shrink: 0; }
.leaderboard-bars { flex: 1; display: flex; gap: 1px; }
.leaderboard-stats { width: 75px; text-align: right; flex-shrink: 0; }
.leaderboard-stats .score { font-weight: 600; font-size: 12px; }
.leaderboard-stats .meta { font-size: 9px; color: #6b7280; }
```

- [ ] **Step 3: Add chart container HTML**

In the `<body>`, find the `<div class="content">` section (line ~275). Add the summary charts div before the heatmaps div:

```html
<div class="content">
  <div class="summary-charts" id="summary-charts"></div>
  <div id="heatmaps"></div>
  <div class="detail-panel" id="detail-panel">
    <div class="detail-placeholder">Click a cell to see details</div>
  </div>
</div>
```

- [ ] **Step 4: Verify template still renders**

```bash
python3 benchmark.py --report-only
```

Expected: generates HTML report without errors. Opening it should show the existing heatmaps with an empty space above them.

- [ ] **Step 5: Commit**

```bash
git add report.py
git commit -m "Add D3 CDN, chart CSS, and summary charts container"
```

---

### Task 3: Implement the Score vs Speed scatter plot

**Files:**
- Modify: `report.py` — JS section of `_HTML_TEMPLATE` (inside the IIFE, after the `escapeHtml` function around line 510)

- [ ] **Step 1: Add the `renderScatterPlot` function**

Add this function inside the existing IIFE (after `escapeHtml`, before `renderAllHeatmaps();`). Remember: escape any literal `$` as `$$` for `string.Template`, and use string concatenation instead of JS template literals.

```javascript
  function renderScatterPlot() {
    const card = document.createElement('div');
    card.className = 'chart-card';
    card.innerHTML = '<h3>Score vs Speed</h3><div class="chart-subtitle">Dot size = peak memory. Hover for details.</div>';

    // Aggregate: avg score, avg gen_tps, max peak_memory per (model, runtime)
    const agg = {};
    DATA.filter(d => checkedModels.has(d.model)).forEach(d => {
      const key = d.model + '|' + d.runtime;
      if (!agg[key]) agg[key] = { model: d.model, runtime: d.runtime, scores: [], gen_tps: [], mem: [] };
      agg[key].scores.push(d.score);
      if (d.generation_tps > 0) agg[key].gen_tps.push(d.generation_tps);
      if (d.peak_memory_gb > 0) agg[key].mem.push(d.peak_memory_gb);
    });

    const points = Object.values(agg).map(a => ({
      model: a.model,
      runtime: a.runtime,
      score: a.scores.reduce((s, v) => s + v, 0) / a.scores.length,
      gen_tps: a.gen_tps.length ? a.gen_tps.reduce((s, v) => s + v, 0) / a.gen_tps.length : 0,
      mem: a.mem.length ? Math.max(...a.mem) : 0,
    })).filter(p => p.gen_tps > 0);

    // Find max memory across all models (for consistent sizing across runtimes)
    const memByModel = {};
    points.forEach(p => { if (p.mem > 0) memByModel[p.model] = Math.max(memByModel[p.model] || 0, p.mem); });
    points.forEach(p => { if (memByModel[p.model]) p.mem = memByModel[p.model]; });

    const margin = { top: 20, right: 20, bottom: 35, left: 45 };
    const width = 420, height = 300;
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const svg = d3.create('svg').attr('viewBox', '0 0 ' + width + ' ' + height);
    const g = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    const xMax = Math.max(10, d3.max(points, d => d.gen_tps) * 1.1);
    const x = d3.scaleLinear().domain([0, xMax]).range([0, innerW]);
    const y = d3.scaleLinear().domain([0, 1]).range([innerH, 0]);
    const maxMem = d3.max(points, d => d.mem) || 20;
    const r = d3.scaleSqrt().domain([0, maxMem]).range([4, 18]);

    // Grid
    g.append('g').attr('transform', 'translate(0,' + innerH + ')').call(d3.axisBottom(x).ticks(5))
      .selectAll('text').style('font-size', '10px');
    g.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(d => Math.round(d * 100) + '%'))
      .selectAll('text').style('font-size', '10px');

    // Grid lines
    g.append('g').attr('class', 'grid').selectAll('line').data(y.ticks(5)).join('line')
      .attr('x1', 0).attr('x2', innerW).attr('y1', d => y(d)).attr('y2', d => y(d))
      .attr('stroke', '#e5e7eb').attr('stroke-width', 0.5);

    // Axis labels
    svg.append('text').attr('x', margin.left + innerW / 2).attr('y', height - 2)
      .attr('text-anchor', 'middle').style('font-size', '11px').style('fill', '#6b7280').text('Generation t/s');
    svg.append('text').attr('transform', 'rotate(-90)')
      .attr('x', -(margin.top + innerH / 2)).attr('y', 12)
      .attr('text-anchor', 'middle').style('font-size', '11px').style('fill', '#6b7280').text('Avg Score');

    const rtColor = { llamacpp: '#3b82f6', mlx: '#22c55e' };

    // Tooltip
    const tooltip = d3.select(document.createElement('div'))
      .style('position', 'absolute').style('background', '#1f2937').style('color', '#fff')
      .style('padding', '6px 10px').style('border-radius', '6px').style('font-size', '11px')
      .style('pointer-events', 'none').style('opacity', 0).style('white-space', 'nowrap')
      .style('z-index', 1000);

    // Dots
    g.selectAll('circle').data(points).join('circle')
      .attr('cx', d => x(d.gen_tps)).attr('cy', d => y(d.score))
      .attr('r', d => r(d.mem || 4))
      .attr('fill', d => rtColor[d.runtime] || '#9ca3af')
      .attr('opacity', 0.5)
      .attr('stroke', d => rtColor[d.runtime] || '#9ca3af')
      .attr('stroke-width', 1)
      .on('mouseenter', function(event, d) {
        d3.select(this).attr('opacity', 0.9);
        tooltip.style('opacity', 1)
          .html(d.model + ' (' + d.runtime + ')<br>'
            + Math.round(d.score * 100) + '% score, '
            + d.gen_tps.toFixed(1) + ' t/s'
            + (d.mem > 0 ? ', ' + d.mem.toFixed(1) + ' GB' : ''));
      })
      .on('mousemove', function(event) {
        tooltip.style('left', (event.pageX + 12) + 'px').style('top', (event.pageY - 12) + 'px');
      })
      .on('mouseleave', function() {
        d3.select(this).attr('opacity', 0.5);
        tooltip.style('opacity', 0);
      });

    // Legend
    const leg = svg.append('g').attr('transform', 'translate(' + (margin.left + innerW - 120) + ',' + (margin.top + 4) + ')');
    leg.append('circle').attr('cx', 0).attr('cy', 0).attr('r', 4).attr('fill', '#3b82f6').attr('opacity', 0.6);
    leg.append('text').attr('x', 8).attr('y', 4).style('font-size', '10px').style('fill', '#6b7280').text('llamacpp');
    leg.append('circle').attr('cx', 62).attr('cy', 0).attr('r', 4).attr('fill', '#22c55e').attr('opacity', 0.6);
    leg.append('text').attr('x', 70).attr('y', 4).style('font-size', '10px').style('fill', '#6b7280').text('mlx');

    card.appendChild(svg.node());
    document.body.appendChild(tooltip.node());
    return card;
  }
```

- [ ] **Step 2: Verify the template parses**

```bash
python3 -c "from report import _HTML_TEMPLATE; print('Template OK')"
```

Expected: prints `Template OK` without errors. If you get a `ValueError` about `$`, find the offending `$` in the JS and escape it as `$$`.

- [ ] **Step 3: Commit**

```bash
git add report.py
git commit -m "Add Score vs Speed scatter plot (D3)"
```

---

### Task 4: Implement the Model Leaderboard chart

**Files:**
- Modify: `report.py` — JS section of `_HTML_TEMPLATE` (inside the IIFE, after `renderScatterPlot`)

- [ ] **Step 1: Add the `renderLeaderboard` function**

Add this function right after `renderScatterPlot`:

```javascript
  function renderLeaderboard() {
    const card = document.createElement('div');
    card.className = 'chart-card';
    card.innerHTML = '<h3>Model Leaderboard</h3><div class="chart-subtitle">Ranked by avg score. Width = duration. Height = peak memory.</div>';

    // Aggregate per model: avg score, wall time per runtime, max memory
    const agg = {};
    DATA.filter(d => checkedModels.has(d.model)).forEach(d => {
      if (!agg[d.model]) agg[d.model] = { model: d.model, scores: [], wall: {}, mem: [] };
      agg[d.model].scores.push(d.score);
      if (!agg[d.model].wall[d.runtime]) agg[d.model].wall[d.runtime] = 0;
      agg[d.model].wall[d.runtime] += d.wall_time_sec;
      if (d.peak_memory_gb > 0) agg[d.model].mem.push(d.peak_memory_gb);
    });

    const models = Object.values(agg).map(a => ({
      model: a.model,
      score: a.scores.reduce((s, v) => s + v, 0) / a.scores.length,
      wallLlama: a.wall.llamacpp || 0,
      wallMlx: a.wall.mlx || 0,
      wallTotal: (a.wall.llamacpp || 0) + (a.wall.mlx || 0),
      mem: a.mem.length ? Math.max(...a.mem) : 0,
    })).sort((a, b) => b.score - a.score);

    if (models.length === 0) return card;

    const maxWall = Math.max(...models.map(m => m.wallTotal));
    const maxMem = Math.max(...models.map(m => m.mem), 1);
    const minBarH = 10, maxBarH = 40;

    const container = document.createElement('div');
    models.forEach(m => {
      const row = document.createElement('div');
      row.className = 'leaderboard-row';

      const name = document.createElement('div');
      name.className = 'leaderboard-name';
      name.textContent = m.model;
      name.title = m.model;
      row.appendChild(name);

      const bars = document.createElement('div');
      bars.className = 'leaderboard-bars';

      const barH = m.mem > 0 ? Math.round(minBarH + (m.mem / maxMem) * (maxBarH - minBarH)) : minBarH;
      const widthPct = maxWall > 0 ? (m.wallTotal / maxWall * 90) : 0;
      const llamaPct = m.wallTotal > 0 ? (m.wallLlama / m.wallTotal) : 0.5;

      if (m.wallLlama > 0) {
        const llamaBar = document.createElement('div');
        llamaBar.style.cssText = 'height:' + barH + 'px;width:' + (widthPct * llamaPct).toFixed(1) + '%;background:#3b82f6;border-radius:3px 0 0 3px;';
        bars.appendChild(llamaBar);
      }
      if (m.wallMlx > 0) {
        const mlxBar = document.createElement('div');
        const hasLlama = m.wallLlama > 0;
        mlxBar.style.cssText = 'height:' + barH + 'px;width:' + (widthPct * (1 - llamaPct)).toFixed(1) + '%;background:#22c55e;border-radius:' + (hasLlama ? '0 3px 3px 0' : '3px') + ';';
        bars.appendChild(mlxBar);
      }
      row.appendChild(bars);

      const stats = document.createElement('div');
      stats.className = 'leaderboard-stats';
      const pct = Math.round(m.score * 100);
      const totalSec = Math.round(m.wallTotal);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      const timeStr = min > 0 ? min + 'm ' + sec + 's' : sec + 's';
      const memStr = m.mem > 0 ? m.mem.toFixed(0) + 'G' : '';
      stats.innerHTML = '<div class="score" style="color:' + scoreColor(pct) + '">' + pct + '%</div>'
        + '<div class="meta">' + timeStr + (memStr ? ' · ' + memStr : '') + '</div>';
      row.appendChild(stats);

      container.appendChild(row);
    });

    card.appendChild(container);
    return card;
  }
```

- [ ] **Step 2: Verify the template parses**

```bash
python3 -c "from report import _HTML_TEMPLATE; print('Template OK')"
```

- [ ] **Step 3: Commit**

```bash
git add report.py
git commit -m "Add Model Leaderboard chart"
```

---

### Task 5: Wire charts into rendering and model filter

**Files:**
- Modify: `report.py` — JS section of `_HTML_TEMPLATE`

- [ ] **Step 1: Add `renderSummaryCharts` function and call it**

Add this function after `renderLeaderboard`, before the existing `renderAllHeatmaps();` call:

```javascript
  function renderSummaryCharts() {
    const container = document.getElementById('summary-charts');
    container.innerHTML = '';
    container.appendChild(renderScatterPlot());
    container.appendChild(renderLeaderboard());
  }
```

- [ ] **Step 2: Update `renderAllHeatmaps` to also re-render summary charts**

Find the existing `renderAllHeatmaps` function. At the very end of it (after `container.appendChild(scroll);`), add:

```javascript
    renderSummaryCharts();
```

- [ ] **Step 3: Remove the standalone `renderAllHeatmaps()` initial call**

The standalone `renderAllHeatmaps();` call near the bottom of the IIFE (line ~513) already triggers everything. Since `renderAllHeatmaps` now calls `renderSummaryCharts`, the initial render handles both. No change needed here — just verify there's no duplicate `renderSummaryCharts()` call.

- [ ] **Step 4: Generate report and verify**

```bash
python3 benchmark.py --report-only
```

Open the generated HTML file. Verify:
- Two chart cards appear above the heatmaps
- Scatter plot shows dots colored by runtime with size encoding
- Leaderboard shows models sorted by score with split duration bars
- Unchecking a model in the filter hides it from both charts AND heatmaps

- [ ] **Step 5: Commit**

```bash
git add report.py
git commit -m "Wire summary charts into rendering and model filter"
```

---

## Verification

After all tasks, generate a report and check:

```bash
python3 benchmark.py --report-only
```

1. Open the HTML file in a browser
2. Two summary chart cards appear side-by-side above the heatmaps
3. Scatter plot: dots positioned by (gen_tps, score), sized by memory, colored by runtime, hover tooltips work
4. Leaderboard: models sorted by score, bar width = duration, bar height = memory, score + time + memory annotations
5. Uncheck a model — it disappears from both charts and heatmaps
6. Select All / Deselect All works for charts too
