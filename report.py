"""
Reporting and output functions for the benchmark suite.

Handles console output formatting and interactive HTML report
generation with heatmaps.
"""

import json
import shutil
import subprocess
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



# ── JSON data export ─────────────────────────────────────────────────────

def save_json_data(results: list[BenchmarkResult], output_dir: Path) -> Path:
    """Save scored results as a JSON file for the webapp to consume."""
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = time.strftime("%Y%m%d-%H%M%S")

    data_records = _serialize_results(results)

    json_path = output_dir / f"benchmark-{timestamp}.json"
    json_blob = json.dumps(data_records, default=str)
    with open(json_path, "w") as f:
        f.write(json_blob)

    # Write data.js for the webapp (used by both dev server and report build)
    webapp_data_js = Path(__file__).parent / "webapp" / "src" / "data" / "data.js"
    if webapp_data_js.parent.exists():
        data_js_content = f"window.__BENCHMARK_DATA = {json_blob};\n"
        webapp_data_js.write_text(data_js_content)
        print(f"  JSON data: {json_path} (+ {webapp_data_js})")
    else:
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

    # Clean stale build artifacts before rebuilding
    dist_report = webapp_dir / "dist-report"
    if dist_report.exists():
        shutil.rmtree(dist_report)

    # Run the Vite report build
    print("  Building HTML report via Vite...")
    subprocess.run(["npm", "run", "build:report"], cwd=webapp_dir, check=True)

    # Copy dist-report/ to output directory
    report_dir = output_dir / f"benchmark-{timestamp}-report"
    if report_dir.exists():
        shutil.rmtree(report_dir)
    shutil.copytree(dist_report, report_dir)

    # Copy data.js into the report directory
    shutil.copy2(data_js_path, report_dir / "data.js")

    print(f"  HTML report: {report_dir}/")
    print(f"  Open: {report_dir}/index.html")

    return report_dir
