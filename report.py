"""
Reporting and output functions for the benchmark suite.

Handles console output formatting, markdown report generation,
and interactive HTML report generation with heatmaps.
"""

import json
import shutil
import subprocess
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



# ── JSON data export ─────────────────────────────────────────────────────

def save_json_data(results: list[BenchmarkResult], output_dir: Path) -> Path:
    """Save scored results as a JSON file for the webapp to consume."""
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = time.strftime("%Y%m%d-%H%M%S")

    scored_results = [r for r in results if r.score is not None]

    data_records = []
    for r in scored_results:
        data_records.append({
            "model": r.model,
            "runtime": r.runtime,
            "quant": r.quant,
            "prompt_name": r.prompt_name,
            "category": r.category,
            "tier": r.tier,
            "style": r.style,
            "score": r.score,
            "score_details": r.score_details,
            "prompt_tps": round(r.prompt_tps, 2),
            "generation_tps": round(r.generation_tps, 2),
            "prompt_tokens": r.prompt_tokens,
            "generation_tokens": r.generation_tokens,
            "wall_time_sec": round(r.wall_time_sec, 2),
            "peak_memory_gb": round(r.peak_memory_gb, 2),
            "output": r.output,
            "prompt_text": r.prompt_text,
        })

    json_path = output_dir / f"benchmark-{timestamp}.json"
    with open(json_path, "w") as f:
        json.dump(data_records, f, default=str)

    print(f"  JSON data: {json_path}")
    return json_path


# ── Vite-built HTML report ───────────────────────────────────────────────

def _serialize_results(results: list[BenchmarkResult]) -> list[dict]:
    """Serialize scored results to the JSON format the webapp expects."""
    scored = [r for r in results if r.score is not None]
    records = []
    for r in scored:
        records.append({
            "model": r.model,
            "runtime": r.runtime,
            "quant": r.quant,
            "prompt_name": r.prompt_name,
            "category": r.category,
            "tier": r.tier,
            "style": r.style,
            "score": r.score,
            "score_details": r.score_details,
            "prompt_tokens": r.prompt_tokens,
            "generation_tokens": r.generation_tokens,
            "prompt_tps": round(r.prompt_tps, 2),
            "generation_tps": round(r.generation_tps, 2),
            "wall_time_sec": round(r.wall_time_sec, 2),
            "peak_memory_gb": round(r.peak_memory_gb, 2),
            "output": r.output,
            "prompt_text": r.prompt_text,
        })
    return records


def save_html_report(results: list[BenchmarkResult], output_dir: Path, prompts: list[dict]):
    """Build a self-contained HTML report using the Vite-built React app."""
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = time.strftime("%Y%m%d-%H%M%S")

    # Locate the webapp directory (sibling of this script's directory)
    webapp_dir = Path(__file__).resolve().parent / "webapp"

    # Write data.js with benchmark data as a global variable
    data_records = _serialize_results(results)
    data_js_content = f"window.__BENCHMARK_DATA = {json.dumps(data_records, default=str)};\n"
    data_js_path = webapp_dir / "src" / "data" / "data.js"
    data_js_path.write_text(data_js_content)

    # Run the Vite report build
    print("  Building HTML report via Vite...")
    subprocess.run(["npm", "run", "build:report"], cwd=webapp_dir, check=True)

    # Copy dist-report/ to output directory
    report_dir = output_dir / f"benchmark-{timestamp}-report"
    dist_report = webapp_dir / "dist-report"
    if report_dir.exists():
        shutil.rmtree(report_dir)
    shutil.copytree(dist_report, report_dir)

    # Copy data.js into the report directory
    shutil.copy2(data_js_path, report_dir / "data.js")

    print(f"  HTML report: {report_dir}/")
    print(f"  Open: {report_dir}/index.html")

    return report_dir
