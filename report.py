"""
Reporting and output functions for the benchmark suite.

Handles console output formatting, markdown report generation,
and interactive HTML report generation with heatmaps.
"""

import json
import string
import sys
import time
from pathlib import Path

from common import BenchmarkResult


# ── Output formatting ──────────────────────────────────────────────────────

def print_header(text: str):
    print(f"\n{'=' * 70}")
    print(f"  {text}")
    print(f"{'=' * 70}")


def print_result_summary(r: BenchmarkResult):
    status = "ERROR" if r.error else "OK"
    score_str = f"{r.score:.0%}" if r.score is not None else "n/a"
    print(f"  [{status}] {r.runtime:<12} | "
          f"pp: {r.prompt_tps:>8.1f} t/s | "
          f"gen: {r.generation_tps:>7.1f} t/s | "
          f"{r.wall_time_sec:>6.1f}s wall | "
          f"score: {score_str}")
    if r.score_details:
        print(f"{'':>17} | {r.score_details}")
    if r.peak_memory_gb > 0:
        print(f"{'':>17} | peak memory: {r.peak_memory_gb:.1f} GB")
    if r.error:
        print(f"{'':>17} | error: {r.error[:80]}")


def print_summary_table(results: list[BenchmarkResult], file=sys.stdout):
    """Print one row per model+runtime with aggregate stats."""
    summary: dict[tuple[str, str], dict] = {}
    for r in results:
        key = (r.model, r.runtime)
        if key not in summary:
            summary[key] = {"scores": [], "tokens": 0, "wall": 0.0, "gen_tps": []}
        s = summary[key]
        if r.score is not None:
            s["scores"].append(r.score)
        s["tokens"] += r.generation_tokens
        s["wall"] += r.wall_time_sec
        if r.generation_tps > 0:
            s["gen_tps"].append(r.generation_tps)

    print(f"\n{'─' * 85}", file=file)
    print(f"{'Model':<30} {'Runtime':<12} {'Avg Score':>10} {'Tokens':>8} {'Wall Time':>10} {'Gen t/s':>8}", file=file)
    print(f"{'─' * 85}", file=file)
    for (model, runtime), s in sorted(summary.items()):
        avg_score = sum(s["scores"]) / len(s["scores"]) if s["scores"] else 0
        avg_gen = sum(s["gen_tps"]) / len(s["gen_tps"]) if s["gen_tps"] else 0
        print(f"{model:<30} {runtime:<12} {avg_score:>9.0%} {s['tokens']:>8} {s['wall']:>9.1f}s {avg_gen:>7.1f}", file=file)
    print(f"{'─' * 85}", file=file)


def print_comparison_table(results: list[BenchmarkResult], file=sys.stdout):
    """Print a summary table comparing all results."""
    print(f"\n{'─' * 100}", file=file)
    print(f"{'Model':<30} {'Runtime':<12} {'Prompt':<22} "
          f"{'PP t/s':>8} {'Gen t/s':>8} {'Wall':>7} {'Score':>6}", file=file)
    print(f"{'─' * 100}", file=file)
    for r in results:
        score_str = f"{r.score:.0%}" if r.score is not None else "n/a"
        err = " *" if r.error else ""
        print(f"{r.model:<30} {r.runtime:<12} {r.prompt_name:<22} "
              f"{r.prompt_tps:>8.1f} {r.generation_tps:>8.1f} "
              f"{r.wall_time_sec:>6.1f}s {score_str:>5}{err}", file=file)
    print(f"{'─' * 100}", file=file)


def print_score_summary(results: list[BenchmarkResult], file=sys.stdout):
    """Print aggregate scores per model/runtime grouped by category."""
    # Group by (model, runtime)
    from collections import defaultdict
    groups: dict[tuple[str, str], dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))

    for r in results:
        if r.score is not None:
            key = (r.model, r.runtime)
            groups[key][r.category].append(r.score)
            groups[key]["_overall"].append(r.score)

    if not groups:
        return

    # Collect all categories
    all_cats = sorted({cat for scores in groups.values() for cat in scores if cat != "_overall"})

    print(f"\n{'─' * (42 + 10 * len(all_cats) + 10)}", file=file)
    header = f"{'Model':<30} {'Runtime':<12}"
    for cat in all_cats:
        header += f" {cat:>8}"
    header += f" {'OVERALL':>8}"
    print(header, file=file)
    print(f"{'─' * (42 + 10 * len(all_cats) + 10)}", file=file)

    for (model, runtime), scores in sorted(groups.items()):
        line = f"{model:<30} {runtime:<12}"
        for cat in all_cats:
            if cat in scores:
                avg = sum(scores[cat]) / len(scores[cat])
                line += f" {avg:>7.0%}"
            else:
                line += f" {'n/a':>7}"
        overall = sum(scores["_overall"]) / len(scores["_overall"])
        line += f" {overall:>7.0%}"
        print(line, file=file)

    print(f"{'─' * (42 + 10 * len(all_cats) + 10)}", file=file)


def print_output_comparison(results: list[BenchmarkResult], prompt_name: str):
    """Print outputs side-by-side for a given prompt."""
    prompt_results = [r for r in results if r.prompt_name == prompt_name and not r.error]
    if len(prompt_results) < 2:
        return

    print(f"\n--- Output comparison for '{prompt_name}' ---")
    for r in prompt_results:
        print(f"\n[{r.model} / {r.runtime}]")
        # Truncate long outputs
        output = r.output
        if len(output) > 600:
            output = output[:600] + "\n... (truncated)"
        print(output)


def print_detailed_results(results: list[BenchmarkResult], prompts: list[dict], file=sys.stdout):
    """Print detailed results for each prompt."""
    # Use prompt ordering but pull display data from results
    for prompt_cfg in prompts:
        key = prompt_cfg["_key"]
        prompt_results = [r for r in results if r.prompt_name == key]
        if not prompt_results:
            continue

        # Pull metadata from first result (same for all results with this key)
        first = prompt_results[0]
        truncated_prompt = first.prompt_text[:120] + ("..." if len(first.prompt_text) > 120 else "")

        print(f"\n  ── {prompt_cfg['name']} (tier {first.tier}, {first.style}, {first.category}) ──", file=file)
        if first.prompt_text:
            print(f"  Prompt: {truncated_prompt}", file=file)
        if first.expected:
            print(f"  Expected: {first.expected}", file=file)

        for r in prompt_results:
            score_str = f"{r.score:.0%}" if r.score is not None else "n/a"
            icon = "pass" if r.score and r.score >= 1.0 else "FAIL" if r.score is not None else "    "
            output = r.output[:200] + ("..." if len(r.output) > 200 else "") if r.output else "(no output)"
            output_oneline = output.replace("\n", "\\n")

            print(f"    [{icon}] {r.model:<30} {r.runtime:<10} {score_str:>5}  | {r.score_details}", file=file)
            print(f"           Output: {output_oneline[:120]}", file=file)


def save_markdown_report(results: list[BenchmarkResult], output_dir: Path, prompts: list[dict]):
    """Save results to a markdown report."""
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = time.strftime("%Y%m%d-%H%M%S")

    # Markdown summary
    md_path = output_dir / f"benchmark-{timestamp}.md"
    with open(md_path, "w") as f:
        f.write(f"# Benchmark Results — {time.strftime('%Y-%m-%d %H:%M')}\n\n")

        f.write("# SUMMARY\n\n")
        print_summary_table(results, file=f)

        f.write("\n# PERFORMANCE\n\n")
        print_comparison_table(results, file=f)

        f.write("\n## Scores by Category\n\n")
        print_score_summary(results, file=f)

        f.write("\n## Detailed Results\n\n")
        print_detailed_results(results, prompts, file=f)

        # ── Full Outputs ──
        f.write("\n## Full Outputs\n\n")
        for r in results:
            f.write(f"### {r.model} / {r.runtime} / {r.prompt_name}\n\n")

            if r.expected:
                f.write(f"Expected: {r.expected}\n")

            score_str = f"{r.score:.0%}" if r.score is not None else "n/a"
            icon = "pass" if r.score and r.score >= 1.0 else "FAIL" if r.score is not None else "    "
            f.write(f"[{icon}] {r.model} {r.runtime} {score_str} | {r.score_details}\n\n")

            output = r.output if r.output else r.error or "(no output)"
            f.write(f"```\n{output}\n```\n\n")

    print(f"\nResults saved to:")
    print(f"  {md_path}")


# ── HTML report template ──────────────────────────────────────────────────

_HTML_TEMPLATE = string.Template("""\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Benchmark Analysis — $date_display</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; color: #111827; }
.header { background: #1f2937; color: #fff; padding: 16px 24px; font-size: 20px; font-weight: 600; }
.controls { padding: 16px 24px; background: #fff; border-bottom: 1px solid #e5e7eb; display: flex; flex-wrap: wrap; gap: 16px; align-items: center; }
.heatmaps-scroll { overflow-x: auto; }
.heatmaps-row { display: inline-flex; gap: 32px; align-items: flex-start; }
.heatmap-panel { flex: 0 0 auto; }
.heatmap-panel h3 { font-size: 16px; font-weight: 600; margin-bottom: 8px; color: #374151; }
.model-selector { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.model-selector label { font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 4px; background: #f3f4f6; }
.model-selector label:hover { background: #e5e7eb; }
.model-selector a { font-size: 12px; color: #2563eb; cursor: pointer; text-decoration: underline; margin-right: 8px; }
.content { padding: 24px; }
.tier-section { margin-bottom: 32px; }
.tier-title { font-size: 18px; font-weight: 600; margin-bottom: 8px; }
.heatmap { border-collapse: collapse; font-family: 'SF Mono', 'Consolas', 'Monaco', monospace; font-size: 12px; }
.heatmap th { padding: 4px 8px; text-align: center; font-weight: 500; background: #f9fafb; border: 1px solid #e5e7eb; font-size: 11px; white-space: nowrap; }
.heatmap td { width: 60px; min-width: 60px; height: 30px; text-align: center; border: 1px solid #e5e7eb; cursor: pointer; font-size: 12px; font-weight: 600; }
.heatmap td:hover { outline: 2px solid #2563eb; outline-offset: -2px; }
.heatmap td.model-name { width: 250px; min-width: 250px; max-width: 250px; text-align: left; cursor: default; font-weight: 500; background: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.heatmap td.model-name:hover { outline: none; }
.heatmap td.no-data { background: #e5e7eb; color: #9ca3af; cursor: default; }
.heatmap td.no-data:hover { outline: none; }
.heatmap tr.greyed-out td { opacity: 0.35; }
.heatmap tr.greyed-out td.model-name { opacity: 0.5; }
.heatmap td.tier-label { width: 40px; min-width: 40px; text-align: center; cursor: default; background: #f9fafb; font-weight: 500; font-size: 11px; color: #6b7280; }
.heatmap td.tier-label:hover { outline: none; }
.heatmap tr.model-separator { height: 4px; }
.heatmap tr.model-separator td { border: none; padding: 0; }
.detail-panel { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px; margin-top: 16px; }
.detail-title { font-size: 16px; font-weight: 600; margin-bottom: 16px; }
.detail-placeholder { color: #9ca3af; font-style: italic; }
.bar-chart { margin-bottom: 24px; }
.bar-row { display: flex; align-items: center; margin-bottom: 6px; }
.bar-label { width: 120px; font-size: 13px; font-family: 'SF Mono', 'Consolas', monospace; text-align: right; padding-right: 12px; flex-shrink: 0; }
.bar-track { flex: 1; height: 24px; background: #f3f4f6; border-radius: 4px; overflow: hidden; position: relative; }
.bar-fill { height: 100%; border-radius: 4px; display: flex; align-items: center; padding-left: 8px; font-size: 12px; font-weight: 600; min-width: fit-content; }
.prompt-results { margin-top: 16px; }
.prompt-results h4 { font-size: 14px; font-weight: 600; margin-bottom: 8px; }
.prompt-result-row { font-family: 'SF Mono', 'Consolas', monospace; font-size: 12px; padding: 4px 0; border-bottom: 1px solid #f3f4f6; display: flex; gap: 12px; }
.prompt-result-name { width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prompt-result-score { width: 60px; font-weight: 600; }
.prompt-result-details { color: #6b7280; flex: 1; }
.prompt-result-prompt { margin-top: 4px; padding: 8px; background: #f0f4ff; border: 1px solid #d0d8e8; border-radius: 4px; max-height: 80px; overflow-y: auto; font-family: 'SF Mono', 'Consolas', monospace; font-size: 11px; white-space: pre-wrap; word-break: break-word; color: #374151; }
.prompt-result-output { margin-top: 4px; padding: 8px; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 4px; max-height: 120px; overflow-y: auto; font-family: 'SF Mono', 'Consolas', monospace; font-size: 11px; white-space: pre-wrap; word-break: break-word; }
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
</style>
<script src="https://d3js.org/d3.v7.min.js"></script>
</head>
<body>
<div class="header">Benchmark Analysis &mdash; $date_display</div>

<div class="controls">
  <div class="model-selector" id="model-selector">
    <a onclick="selectAllModels(true)">Select All</a>
    <a onclick="selectAllModels(false)">Deselect All</a>
  </div>
</div>

<div class="content">
  <div class="summary-charts" id="summary-charts"></div>
  <div id="heatmaps"></div>
  <div class="detail-panel" id="detail-panel">
    <div class="detail-placeholder">Click a cell to see details</div>
  </div>
</div>

<script>const DATA = $data_json;</script>
<script>
(function() {
  let checkedModels = new Set();
  const runtimes = ['llamacpp', 'mlx'];

  // Extract unique values
  const allModels = [...new Set(DATA.map(d => d.model))].sort();
  const allCategories = [...new Set(DATA.map(d => d.category))].sort();
  const allTiers = [...new Set(DATA.map(d => d.tier))].sort((a, b) => a - b);

  // Models that have data for a given runtime
  function modelsForRuntime(rt) {
    return new Set(DATA.filter(d => d.runtime === rt).map(d => d.model));
  }

  // Init checked models
  allModels.forEach(m => checkedModels.add(m));

  // Build model checkboxes
  const selEl = document.getElementById('model-selector');
  allModels.forEach(m => {
    const lbl = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.dataset.model = m;
    cb.addEventListener('change', () => {
      if (cb.checked) checkedModels.add(m); else checkedModels.delete(m);
      renderAllHeatmaps();
    });
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(' ' + m));
    selEl.appendChild(lbl);
  });

  window.selectAllModels = function(sel) {
    document.querySelectorAll('#model-selector input[type=checkbox]').forEach(cb => {
      cb.checked = sel;
      if (sel) checkedModels.add(cb.dataset.model); else checkedModels.delete(cb.dataset.model);
    });
    renderAllHeatmaps();
  };

  function scoreColor(pct) {
    if (pct >= 90) return '#22c55e';
    if (pct >= 70) return '#86efac';
    if (pct >= 50) return '#facc15';
    if (pct >= 30) return '#fb923c';
    return '#ef4444';
  }

  function textColor(pct) {
    if (pct >= 90) return '#fff';
    if (pct >= 70) return '#111827';
    if (pct >= 50) return '#111827';
    if (pct >= 30) return '#111827';
    return '#fff';
  }

  function buildHeatmapTable(runtime, showModelNames) {
    const rtModels = modelsForRuntime(runtime);
    const allCats = [...new Set(DATA.map(d => d.category))].sort();
    if (allCats.length === 0) return null;

    const table = document.createElement('table');
    table.className = 'heatmap';

    // Header row
    const thead = document.createElement('thead');
    const hrow = document.createElement('tr');
    if (showModelNames) {
      const modelTh = document.createElement('th');
      modelTh.textContent = 'Model';
      modelTh.style.textAlign = 'left';
      modelTh.style.width = '250px';
      hrow.appendChild(modelTh);
    }
    const tierTh = document.createElement('th');
    tierTh.textContent = 'Tier';
    tierTh.style.width = '40px';
    hrow.appendChild(tierTh);
    allCats.forEach(cat => {
      const th = document.createElement('th');
      th.textContent = cat;
      hrow.appendChild(th);
    });
    thead.appendChild(hrow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    allModels.forEach(model => {
      if (!checkedModels.has(model)) return;
      const hasData = rtModels.has(model);

      allTiers.forEach((tier, tierIdx) => {
        const row = document.createElement('tr');
        if (!hasData) row.className = 'greyed-out';

        // Model name only on first tier row, only if showing names
        if (showModelNames && tierIdx === 0) {
          const nameTd = document.createElement('td');
          nameTd.className = 'model-name';
          nameTd.textContent = model;
          nameTd.rowSpan = allTiers.length;
          nameTd.style.verticalAlign = 'middle';
          row.appendChild(nameTd);
        }

        // Tier label
        const tierTd = document.createElement('td');
        tierTd.className = 'tier-label';
        tierTd.textContent = tier;
        row.appendChild(tierTd);

        allCats.forEach(cat => {
          const td = document.createElement('td');
          const matches = DATA.filter(d => d.model === model && d.runtime === runtime && d.tier === tier && d.category === cat);
          if (matches.length === 0) {
            td.className = 'no-data';
            td.textContent = '\u2014';
          } else {
            const avg = matches.reduce((s, d) => s + d.score, 0) / matches.length;
            const pct = Math.round(avg * 100);
            td.textContent = pct + '%';
            td.style.background = scoreColor(pct);
            td.style.color = textColor(pct);
            td.addEventListener('click', () => showDetail(model, cat, tier, runtime));
          }
          row.appendChild(td);
        });

        tbody.appendChild(row);

        // Add separator after last tier row for each model
        if (tierIdx === allTiers.length - 1) {
          const sep = document.createElement('tr');
          sep.className = 'model-separator';
          tbody.appendChild(sep);
        }
      });
    });
    table.appendChild(tbody);
    return table;
  }

  function renderAllHeatmaps() {
    const container = document.getElementById('heatmaps');
    container.innerHTML = '';

    const row = document.createElement('div');
    row.className = 'heatmaps-row';

    runtimes.forEach((rt, idx) => {
      const panel = document.createElement('div');
      panel.className = 'heatmap-panel';
      const heading = document.createElement('h3');
      heading.textContent = rt;
      panel.appendChild(heading);
      const table = buildHeatmapTable(rt, idx === 0);
      if (table) panel.appendChild(table);
      row.appendChild(panel);
    });

    const scroll = document.createElement('div');
    scroll.className = 'heatmaps-scroll';
    scroll.appendChild(row);
    container.appendChild(scroll);
    renderSummaryCharts();
  }

  function showDetail(model, category, tier, runtime) {
    const panel = document.getElementById('detail-panel');
    const matches = DATA.filter(d => d.model === model && d.runtime === runtime && d.tier === tier && d.category === category);
    if (matches.length === 0) {
      panel.innerHTML = '<div class="detail-placeholder">No data for this combination</div>';
      return;
    }

    // Group by style
    const byStyle = {};
    matches.forEach(d => {
      if (!byStyle[d.style]) byStyle[d.style] = [];
      byStyle[d.style].push(d);
    });
    const styles = Object.keys(byStyle).sort();

    let html = '<div class="detail-title">' + model + ' &mdash; ' + category + ' &mdash; Tier ' + tier + ' &mdash; ' + runtime + '</div>';

    // Performance summary (aggregate across matches)
    const totalWall = matches.reduce((s, d) => s + (d.wall_time_sec || 0), 0);
    const genTpsVals = matches.map(d => d.generation_tps || 0).filter(v => v > 0);
    const meanGenTps = genTpsVals.length ? genTpsVals.reduce((s, v) => s + v, 0) / genTpsVals.length : 0;
    const totalGenTokens = matches.reduce((s, d) => s + (d.generation_tokens || 0), 0);
    const avgScore = matches.reduce((s, d) => s + (d.score || 0), 0) / matches.length;
    // Derived: score per 1k generated tokens (efficiency — higher is better)
    const scorePerKTok = totalGenTokens > 0 ? (avgScore * 1000 / totalGenTokens) : 0;
    html += '<div style="font-size:11px;color:#6b7280;margin-bottom:14px;line-height:1.5;">'
      + '<strong style="color:#374151;">Performance:</strong> '
      + 'total wall ' + totalWall.toFixed(1) + 's '
      + '\u00b7 mean gen ' + meanGenTps.toFixed(1) + ' t/s '
      + '\u00b7 ' + totalGenTokens.toLocaleString() + ' gen tokens'
      + '<br><strong style="color:#374151;">Score / 1k gen tokens:</strong> ' + scorePerKTok.toFixed(3)
      + ' <span style="opacity:0.7;">(efficiency: avg score per 1000 generated tokens)</span>'
      + '</div>';

    // Bar chart by style
    html += '<div class="bar-chart">';
    styles.forEach(style => {
      const items = byStyle[style];
      const avg = items.reduce((s, d) => s + d.score, 0) / items.length;
      const pct = Math.round(avg * 100);
      const bg = scoreColor(pct);
      const fg = textColor(pct);
      html += '<div class="bar-row">';
      html += '<div class="bar-label">' + (style || 'default') + '</div>';
      html += '<div class="bar-track"><div class="bar-fill" style="width:' + Math.max(pct, 2) + '%;background:' + bg + ';color:' + fg + ';">' + pct + '%</div></div>';
      html += '</div>';
    });
    html += '</div>';

    // Individual prompt results
    html += '<div class="prompt-results"><h4>Individual Results</h4>';
    matches.forEach(d => {
      const pct = Math.round(d.score * 100);
      html += '<div class="prompt-result-row">';
      html += '<div class="prompt-result-name">' + escapeHtml(d.prompt_name) + '</div>';
      html += '<div class="prompt-result-score" style="color:' + scoreColor(pct) + '">' + pct + '%</div>';
      html += '<div class="prompt-result-details">' + escapeHtml(d.score_details) + '</div>';
      html += '</div>';
      if (d.prompt_text) {
        html += '<div class="prompt-result-prompt">' + escapeHtml(d.prompt_text) + '</div>';
      }
      if (d.output) {
        html += '<div class="prompt-result-output">' + escapeHtml(d.output) + '</div>';
      }
    });
    html += '</div>';

    panel.innerHTML = html;
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s || '';
    return div.innerHTML;
  }

  let scatterGroupBy = 'runtime';

  function modelFamily(name) {
    if (!name) return 'unknown';
    return name.split(/[-_ /]/)[0].toLowerCase();
  }

  function renderScatterPlot() {
    const card = document.createElement('div');
    card.className = 'chart-card';
    card.innerHTML = '<h3>Score vs Tokens</h3><div class="chart-subtitle">Dot size = peak memory. Hover for details.</div>';

    // Group-by selector
    const ctrl = document.createElement('div');
    ctrl.style.cssText = 'margin-bottom:8px;font-size:11px;color:#374151;';
    ctrl.innerHTML = '<label>Color by: <select id="scatter-groupby" style="font-size:11px;padding:2px 4px;"><option value="runtime">Runtime</option><option value="tier">Tier</option><option value="category">Category</option><option value="family">Model family</option></select></label>';
    card.appendChild(ctrl);
    const sel = ctrl.querySelector('select');
    sel.value = scatterGroupBy;
    sel.addEventListener('change', () => { scatterGroupBy = sel.value; renderSummaryCharts(); });

    // Aggregate: avg score, total tokens, max peak_memory per (model, runtime)
    const agg = {};
    DATA.filter(d => checkedModels.has(d.model)).forEach(d => {
      const key = d.model + '|' + d.runtime;
      if (!agg[key]) agg[key] = { model: d.model, runtime: d.runtime, scores: [], tokens: 0, mem: [], tiers: {}, cats: {} };
      agg[key].scores.push(d.score);
      agg[key].tokens += (d.prompt_tokens || 0) + (d.generation_tokens || 0);
      if (d.peak_memory_gb > 0) agg[key].mem.push(d.peak_memory_gb);
      agg[key].tiers[d.tier] = (agg[key].tiers[d.tier] || 0) + 1;
      agg[key].cats[d.category] = (agg[key].cats[d.category] || 0) + 1;
    });

    function topKey(obj) {
      let best = null, bestN = -1;
      for (const k in obj) { if (obj[k] > bestN) { best = k; bestN = obj[k]; } }
      return best;
    }

    const points = Object.values(agg).map(a => ({
      model: a.model,
      runtime: a.runtime,
      score: a.scores.reduce((s, v) => s + v, 0) / a.scores.length,
      tokens: a.tokens,
      mem: a.mem.length ? Math.max(...a.mem) : 0,
      tier: topKey(a.tiers),
      category: topKey(a.cats),
      family: modelFamily(a.model),
    })).filter(p => p.tokens > 0);

    // Use MLX memory for both runtimes of same model
    const memByModel = {};
    points.forEach(p => { if (p.mem > 0) memByModel[p.model] = Math.max(memByModel[p.model] || 0, p.mem); });
    points.forEach(p => { if (memByModel[p.model]) p.mem = memByModel[p.model]; });

    const margin = { top: 20, right: 20, bottom: 35, left: 45 };
    const width = 420, height = 300;
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const svg = d3.create('svg').attr('viewBox', '0 0 ' + width + ' ' + height);
    const g = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    const xMin = Math.max(1, d3.min(points, d => d.tokens) * 0.8);
    const xMax = Math.max(100, d3.max(points, d => d.tokens) * 1.2);
    const x = d3.scaleLog().domain([xMin, xMax]).range([0, innerW]);
    const y = d3.scaleLinear().domain([0, 1]).range([innerH, 0]);
    const maxMem = d3.max(points, d => d.mem) || 20;
    const rScale = d3.scaleSqrt().domain([0, maxMem]).range([4, 18]);

    // Axes
    g.append('g').attr('transform', 'translate(0,' + innerH + ')').call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(',.0f')))
      .selectAll('text').style('font-size', '10px');
    g.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(d => Math.round(d * 100) + '%'))
      .selectAll('text').style('font-size', '10px');

    // Grid lines
    g.append('g').selectAll('line').data(y.ticks(5)).join('line')
      .attr('x1', 0).attr('x2', innerW).attr('y1', d => y(d)).attr('y2', d => y(d))
      .attr('stroke', '#e5e7eb').attr('stroke-width', 0.5);

    // Axis labels
    svg.append('text').attr('x', margin.left + innerW / 2).attr('y', height - 2)
      .attr('text-anchor', 'middle').style('font-size', '11px').style('fill', '#6b7280').text('Total Tokens');
    svg.append('text').attr('transform', 'rotate(-90)')
      .attr('x', -(margin.top + innerH / 2)).attr('y', 12)
      .attr('text-anchor', 'middle').style('font-size', '11px').style('fill', '#6b7280').text('Avg Score');

    const rtColor = { llamacpp: '#3b82f6', mlx: '#22c55e' };

    // Build color scale based on groupBy
    function groupKeyOf(p) {
      if (scatterGroupBy === 'runtime') return p.runtime;
      if (scatterGroupBy === 'tier') return 'Tier ' + p.tier;
      if (scatterGroupBy === 'category') return p.category;
      return p.family;
    }
    const groupKeys = [...new Set(points.map(groupKeyOf))].sort();
    let colorOf;
    if (scatterGroupBy === 'runtime') {
      colorOf = p => rtColor[p.runtime] || '#9ca3af';
    } else {
      const palette = d3.scaleOrdinal(d3.schemeTableau10).domain(groupKeys);
      colorOf = p => palette(groupKeyOf(p));
    }

    // Tooltip
    const tooltip = d3.select(document.createElement('div'))
      .style('position', 'absolute').style('background', '#1f2937').style('color', '#fff')
      .style('padding', '6px 10px').style('border-radius', '6px').style('font-size', '11px')
      .style('pointer-events', 'none').style('opacity', 0).style('white-space', 'nowrap')
      .style('z-index', 1000);

    // Dots
    g.selectAll('circle').data(points).join('circle')
      .attr('cx', d => x(d.tokens)).attr('cy', d => y(d.score))
      .attr('r', d => rScale(d.mem || 4))
      .attr('fill', d => colorOf(d))
      .attr('opacity', 0.5)
      .attr('stroke', d => colorOf(d))
      .attr('stroke-width', 1)
      .on('mouseenter', function(event, d) {
        d3.select(this).attr('opacity', 0.9);
        tooltip.style('opacity', 1)
          .html(d.model + ' (' + d.runtime + ')<br>'
            + Math.round(d.score * 100) + '% score, '
            + d.tokens.toLocaleString() + ' tokens'
            + (d.mem > 0 ? ', ' + d.mem.toFixed(1) + ' GB' : ''));
      })
      .on('mousemove', function(event) {
        tooltip.style('left', (event.pageX + 12) + 'px').style('top', (event.pageY - 12) + 'px');
      })
      .on('mouseleave', function() {
        d3.select(this).attr('opacity', 0.5);
        tooltip.style('opacity', 0);
      });

    // Legend (dynamic by group)
    const leg = svg.append('g').attr('transform', 'translate(' + (margin.left + 4) + ',' + (margin.top + 4) + ')');
    groupKeys.forEach((k, i) => {
      const row = leg.append('g').attr('transform', 'translate(0,' + (i * 12) + ')');
      const sample = points.find(p => groupKeyOf(p) === k);
      row.append('circle').attr('cx', 0).attr('cy', 0).attr('r', 4)
        .attr('fill', sample ? colorOf(sample) : '#9ca3af').attr('opacity', 0.6);
      row.append('text').attr('x', 8).attr('y', 4).style('font-size', '10px').style('fill', '#6b7280').text(k);
    });

    card.appendChild(svg.node());
    document.body.appendChild(tooltip.node());
    return card;
  }

  function renderLeaderboard() {
    const card = document.createElement('div');
    card.className = 'chart-card';
    card.innerHTML = '<h3>Model Leaderboard</h3><div class="chart-subtitle">Ranked by avg score. Bar color = best runtime. Marker = peak memory.</div>';

    // Aggregate per model: avg score, wall time, mem, per-runtime score
    const agg = {};
    DATA.filter(d => checkedModels.has(d.model)).forEach(d => {
      if (!agg[d.model]) agg[d.model] = { model: d.model, scores: [], wall: 0, mem: [], byRt: {} };
      agg[d.model].scores.push(d.score);
      agg[d.model].wall += d.wall_time_sec;
      if (d.peak_memory_gb > 0) agg[d.model].mem.push(d.peak_memory_gb);
      if (!agg[d.model].byRt[d.runtime]) agg[d.model].byRt[d.runtime] = [];
      agg[d.model].byRt[d.runtime].push(d.score);
    });

    const models = Object.values(agg).map(a => {
      const avgRt = {};
      for (const rt in a.byRt) {
        const arr = a.byRt[rt];
        avgRt[rt] = arr.reduce((s, v) => s + v, 0) / arr.length;
      }
      let bestRt = null, bestScore = -1;
      for (const rt in avgRt) { if (avgRt[rt] > bestScore) { bestScore = avgRt[rt]; bestRt = rt; } }
      return {
        model: a.model,
        score: a.scores.reduce((s, v) => s + v, 0) / a.scores.length,
        wall: a.wall,
        mem: a.mem.length ? Math.max(...a.mem) : 0,
        bestRt: bestRt,
      };
    }).sort((a, b) => b.score - a.score);

    if (models.length === 0) return card;

    const rtColor = { llamacpp: '#3b82f6', mlx: '#22c55e' };
    const margin = { top: 10, right: 60, bottom: 25, left: 130 };
    const rowH = 18;
    const width = 420;
    const height = margin.top + margin.bottom + models.length * rowH;
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const svg = d3.create('svg').attr('viewBox', '0 0 ' + width + ' ' + height);
    const g = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    const x = d3.scaleLinear().domain([0, 1]).range([0, innerW]);
    const y = d3.scaleBand().domain(models.map(m => m.model)).range([0, innerH]).padding(0.2);
    const maxMem = Math.max(...models.map(m => m.mem), 1);
    const memR = d3.scaleSqrt().domain([0, maxMem]).range([2, 6]);

    // X axis (score 0-100%)
    g.append('g').attr('transform', 'translate(0,' + innerH + ')')
      .call(d3.axisBottom(x).ticks(5).tickFormat(d => Math.round(d * 100) + '%'))
      .selectAll('text').style('font-size', '9px');

    // Grid
    g.append('g').selectAll('line').data(x.ticks(5)).join('line')
      .attr('x1', d => x(d)).attr('x2', d => x(d)).attr('y1', 0).attr('y2', innerH)
      .attr('stroke', '#e5e7eb').attr('stroke-width', 0.5);

    // Y axis labels (model names)
    g.append('g').selectAll('text').data(models).join('text')
      .attr('x', -6).attr('y', m => y(m.model) + y.bandwidth() / 2 + 3)
      .attr('text-anchor', 'end').style('font-size', '10px').style('fill', '#374151')
      .text(m => m.model.length > 18 ? m.model.slice(0, 17) + '\u2026' : m.model)
      .append('title').text(m => m.model);

    // Tooltip
    const tooltip = d3.select(document.createElement('div'))
      .style('position', 'absolute').style('background', '#1f2937').style('color', '#fff')
      .style('padding', '6px 10px').style('border-radius', '6px').style('font-size', '11px')
      .style('pointer-events', 'none').style('opacity', 0).style('white-space', 'nowrap')
      .style('z-index', 1000);

    // Bars
    g.selectAll('rect.bar').data(models).join('rect')
      .attr('class', 'bar')
      .attr('x', 0).attr('y', m => y(m.model))
      .attr('width', m => x(m.score)).attr('height', y.bandwidth())
      .attr('fill', m => rtColor[m.bestRt] || '#9ca3af')
      .attr('opacity', 0.75)
      .on('mouseenter', function(event, m) {
        d3.select(this).attr('opacity', 1);
        tooltip.style('opacity', 1).html(
          m.model + '<br>'
          + 'score: ' + Math.round(m.score * 100) + '%<br>'
          + 'best runtime: ' + (m.bestRt || 'n/a') + '<br>'
          + 'wall: ' + Math.round(m.wall) + 's'
          + (m.mem > 0 ? '<br>peak mem: ' + m.mem.toFixed(1) + ' GB' : '')
        );
      })
      .on('mousemove', function(event) {
        tooltip.style('left', (event.pageX + 12) + 'px').style('top', (event.pageY - 12) + 'px');
      })
      .on('mouseleave', function() {
        d3.select(this).attr('opacity', 0.75);
        tooltip.style('opacity', 0);
      });

    // Score labels
    g.selectAll('text.score').data(models).join('text')
      .attr('class', 'score')
      .attr('x', m => x(m.score) + 4)
      .attr('y', m => y(m.model) + y.bandwidth() / 2 + 3)
      .style('font-size', '10px').style('font-weight', '600').style('fill', '#374151')
      .text(m => Math.round(m.score * 100) + '%');

    // Memory markers (small circles at right edge)
    g.selectAll('circle.mem').data(models.filter(m => m.mem > 0)).join('circle')
      .attr('class', 'mem')
      .attr('cx', innerW + 30)
      .attr('cy', m => y(m.model) + y.bandwidth() / 2)
      .attr('r', m => memR(m.mem))
      .attr('fill', '#6b7280').attr('opacity', 0.6)
      .append('title').text(m => m.mem.toFixed(1) + ' GB peak memory');

    // Legend
    const leg = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + (height - 8) + ')');
    leg.append('circle').attr('cx', 0).attr('cy', 0).attr('r', 4).attr('fill', '#3b82f6').attr('opacity', 0.75);
    leg.append('text').attr('x', 8).attr('y', 3).style('font-size', '9px').style('fill', '#6b7280').text('llamacpp');
    leg.append('circle').attr('cx', 62).attr('cy', 0).attr('r', 4).attr('fill', '#22c55e').attr('opacity', 0.75);
    leg.append('text').attr('x', 70).attr('y', 3).style('font-size', '9px').style('fill', '#6b7280').text('mlx');
    leg.append('circle').attr('cx', 110).attr('cy', 0).attr('r', 5).attr('fill', '#6b7280').attr('opacity', 0.6);
    leg.append('text').attr('x', 118).attr('y', 3).style('font-size', '9px').style('fill', '#6b7280').text('peak mem');

    card.appendChild(svg.node());
    document.body.appendChild(tooltip.node());
    return card;
  }

  function renderSummaryCharts() {
    const container = document.getElementById('summary-charts');
    container.innerHTML = '';
    container.appendChild(renderScatterPlot());
    container.appendChild(renderLeaderboard());
  }

  // Initial render
  renderAllHeatmaps();
})();
</script>
</body>
</html>""")


def save_html_report(results: list[BenchmarkResult], output_dir: Path, prompts: list[dict]):
    """Save results to a self-contained HTML analysis page with interactive heatmaps."""
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    date_display = time.strftime("%Y-%m-%d %H:%M")

    # Filter out results where score is None (skip sentinels)
    scored_results = [r for r in results if r.score is not None]

    # Serialize to JSON with only the fields we need
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
            "prompt_tokens": r.prompt_tokens,
            "generation_tokens": r.generation_tokens,
            "prompt_tps": r.prompt_tps,
            "generation_tps": r.generation_tps,
            "wall_time_sec": r.wall_time_sec,
            "peak_memory_gb": r.peak_memory_gb,
            "output": r.output,
            "prompt_text": r.prompt_text,
        })

    data_json = json.dumps(data_records, default=str)

    html = _HTML_TEMPLATE.substitute(date_display=date_display, data_json=data_json)

    html_path = output_dir / f"benchmark-{timestamp}.html"
    with open(html_path, "w") as f:
        f.write(html)

    print(f"  {html_path}")

    return html_path
