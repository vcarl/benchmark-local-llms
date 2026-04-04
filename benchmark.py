#!/usr/bin/env python3
"""
Benchmark local LLM runtimes on Apple Silicon.

Compares llama.cpp and MLX across multiple models and prompts,
measuring tokens/sec and collecting outputs for quality comparison.

Usage:
    python benchmark.py                    # Run all benchmarks
    python benchmark.py --runtime mlx      # MLX only
    python benchmark.py --runtime llamacpp # llama.cpp only
    python benchmark.py --models small     # Only small models
    python benchmark.py --models large     # Only large models
    python benchmark.py --quick            # Short generation (32 tokens)
"""

import argparse
import subprocess
import sys
from collections import defaultdict

from common import (
    LLAMA_CLI,
    EXECUTION_DIR, RESULTS_DIR,
    MODELS, PROMPTS,
    BenchmarkResult,
    load_prompts,
    compute_prompt_hash,
    load_existing_results, load_all_results,
    append_result,
)
from runner import (
    score_result,
    score_results,
    is_llamacpp_cached, is_mlx_cached,
    start_llamacpp_server, stop_llamacpp_server, run_llamacpp_prompt,
    start_mlx_subprocess, stop_mlx_subprocess, run_mlx_prompt,
    download_models,
)
from report import (
    print_header,
    print_result_summary,
    print_summary_table,
    print_comparison_table,
    print_score_summary,
    print_output_comparison,
    print_detailed_results,
    save_markdown_report,
    save_html_report,
)


# ── Main ───────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Benchmark local LLM runtimes")
    parser.add_argument(
        "--runtime", choices=["llamacpp", "mlx", "all"], default="all",
        help="Which runtime to benchmark (default: all)",
    )
    parser.add_argument(
        "--models", choices=["small", "large", "xlarge", "all"], default="small",
        help="Model size class to test: small (<= 32B), large (72B), xlarge (100B+), all (default: small)",
    )
    parser.add_argument(
        "--model-name", type=str, default=None,
        help="Run only models whose name contains this string (case-insensitive, e.g. 'mistral', 'qwen 7b')",
    )
    parser.add_argument(
        "--max-tokens", type=int, default=8096,
        help="Max tokens to generate per prompt (default: 256)",
    )
    parser.add_argument(
        "--quick", action="store_true",
        help="Quick mode: 64 tokens max, one prompt per category",
    )
    parser.add_argument(
        "--prompt", type=str, default=None,
        help="Run only prompts matching this name or category (e.g. 'math', 'code', 'logic')",
    )
    parser.add_argument(
        "--no-save", action="store_true",
        help="Don't save results to files",
    )
    parser.add_argument(
        "--download", action="store_true",
        help="Download all models for selected runtimes/tiers, then exit (no benchmarking)",
    )
    parser.add_argument(
        "--report-only", action="store_true",
        help="Regenerate HTML report from cached results, then exit (no benchmarking)",
    )
    args = parser.parse_args()

    if args.report_only:
        prompts = load_prompts()
        all_cached = load_all_results()
        score_results(all_cached, prompts)
        save_html_report(all_cached, RESULTS_DIR, prompts)
        return

    if args.quick and not args.download:
        args.max_tokens = 64

    # Filter models — each tier runs only its own models, "all" runs everything
    if args.models == "all":
        models = MODELS
    else:
        models = [m for m in MODELS if m["size_class"] == args.models]

    # Further filter by name substring if specified
    if args.model_name:
        needle = args.model_name.lower()
        models = [m for m in MODELS if needle in m["name"].lower()]
        if not models:
            print(f"No models matching: {args.model_name}")
            print(f"Available: {', '.join(m['name'] for m in MODELS)}")
            sys.exit(1)

    # Filter prompts
    if args.quick:
        # Tier 1 only, one prompt per category
        seen_cats = set()
        prompts = []
        for p in PROMPTS:
            if p.get("tier", 1) != 1:
                continue
            cat = p.get("category", p["name"])
            if cat not in seen_cats:
                seen_cats.add(cat)
                prompts.append(p)
    elif args.prompt:
        # Match by name, category, style, or tier
        prompts = [p for p in PROMPTS
                   if args.prompt in p["name"]
                   or args.prompt == p.get("category")
                   or args.prompt == p.get("style")
                   or args.prompt == f"tier{p.get('tier', '')}"]
        if not prompts:
            cats = sorted(set(p.get("category", "") for p in PROMPTS))
            styles = sorted(set(p.get("style", "") for p in PROMPTS))
            print(f"No prompts matching: {args.prompt}")
            print(f"Categories: {', '.join(cats)}")
            print(f"Styles: {', '.join(styles)}")
            print(f"Tiers: tier1, tier2, tier3")
            sys.exit(1)
    else:
        prompts = PROMPTS

    # Determine runtimes
    runtimes = []
    if args.runtime in ("llamacpp", "all"):
        if LLAMA_CLI.exists():
            runtimes.append("llamacpp")
        else:
            print(f"Warning: llama-cli not found at {LLAMA_CLI}, skipping llama.cpp")
    if args.runtime in ("mlx", "all"):
        try:
            subprocess.run(
                [sys.executable, "-c", "import mlx_lm"],
                capture_output=True, check=True,
            )
            runtimes.append("mlx")
        except subprocess.CalledProcessError:
            print("Warning: mlx-lm not importable, skipping MLX")

    if not runtimes:
        print("No runtimes available. Install llama.cpp or mlx-lm.")
        sys.exit(1)

    # Download mode: fetch all models and exit
    if args.download:
        download_models(models, runtimes)
        sys.exit(0)

    # Print plan
    n_runs = len(models) * len(prompts) * len(runtimes)
    print(f"Benchmark plan: {len(models)} models x {len(prompts)} prompts x {len(runtimes)} runtimes = {n_runs} runs")
    print(f"Max tokens: {args.max_tokens}")
    print(f"Models: {', '.join(m['name'] for m in models)}")
    print(f"Runtimes: {', '.join(runtimes)}")
    print(f"Prompts: {', '.join(p['name'] for p in prompts)}")
    print()

    results: list[BenchmarkResult] = []

    prompt_lookup = {p["_key"]: p for p in prompts}

    # Group prompts by tier and category
    tiers: dict[int, list[dict]] = defaultdict(list)
    for p in prompts:
        tiers[p.get("tier", 1)].append(p)
    tier_order = sorted(tiers.keys())

    interrupted = False
    for model_cfg in models:
        if interrupted:
            break
        for runtime in runtimes:
            if interrupted:
                break
            # Check if model is cached
            if runtime == "llamacpp" and not is_llamacpp_cached(model_cfg):
                print(f"\n  Skipping {model_cfg['name']} / llama.cpp: not downloaded. Run with --download first.")
                continue
            if runtime == "mlx" and not is_mlx_cached(model_cfg):
                print(f"\n  Skipping {model_cfg['name']} / mlx: not downloaded. Run with --download first.")
                continue

            # Check if all prompts are already cached before starting the model
            existing = load_existing_results(model_cfg["name"], runtime)
            all_cached = all(
                existing.get(pcfg["_key"]) and existing[pcfg["_key"]].prompt_hash == compute_prompt_hash(pcfg)
                for tier_num in tier_order
                for pcfg in tiers[tier_num]
            )

            if all_cached:
                print(f"\n  {model_cfg['name']} / {runtime}: all {len(prompts)} prompts cached, skipping model load")
                for tier_num in tier_order:
                    for pcfg in tiers[tier_num]:
                        cached = existing[pcfg["_key"]]
                        score_result(cached, pcfg)
                        results.append(cached)
                continue

            print_header(f"{model_cfg['name']} — {runtime}")

            # Start the model once
            server_proc = None
            mlx_proc = None
            if runtime == "llamacpp":
                server_proc = start_llamacpp_server(model_cfg)
                if not server_proc:
                    print(f"    Failed to start server, skipping.", flush=True)
                    continue
            elif runtime == "mlx":
                mlx_proc = start_mlx_subprocess(model_cfg)
                if not mlx_proc:
                    print(f"    Failed to start MLX, skipping.", flush=True)
                    continue

            try:  # noqa: SIM105 — finally ensures server shutdown
                for tier_num in tier_order:
                    tier_prompts = tiers[tier_num]
                    if not tier_prompts:
                        continue

                    print(f"\n  ── Tier {tier_num} ({len(tier_prompts)} prompts) ──", flush=True)

                    for pcfg in tier_prompts:
                        p_hash = compute_prompt_hash(pcfg)
                        cached = existing.get(pcfg["_key"])

                        if cached and cached.prompt_hash == p_hash:
                            print(f"  [cached] {pcfg['_key']}")
                            score_result(cached, pcfg)
                            print_result_summary(cached)
                            results.append(cached)
                            continue

                        # Run the model
                        if runtime == "llamacpp":
                            r = run_llamacpp_prompt(model_cfg, pcfg, args.max_tokens)
                        elif runtime == "mlx":
                            r = run_mlx_prompt(mlx_proc, model_cfg, pcfg, args.max_tokens)

                        r.prompt_name = pcfg["_key"]
                        r.prompt_hash = p_hash
                        score_result(r, pcfg)
                        print_result_summary(r)
                        results.append(r)
                        append_result(r)

            except KeyboardInterrupt:
                print(f"\n\n  Interrupted! Saving completed results...", flush=True)
                interrupted = True
            finally:
                # Shut down the model
                if server_proc:
                    stop_llamacpp_server(server_proc)
                if mlx_proc:
                    stop_mlx_subprocess(mlx_proc)

    # Final summary
    print_header("SUMMARY")
    print_summary_table(results)

    print_header("PERFORMANCE")
    print_comparison_table(results)

    print_header("SCORES BY CATEGORY")
    print_score_summary(results)

    # Show detailed results for each prompt
    print_header("DETAILED RESULTS")
    print_detailed_results(results, prompts)

    # Save
    if not args.no_save:
        save_markdown_report(results, RESULTS_DIR, prompts)
        # HTML report uses all cached execution data, scored fresh
        all_cached = load_all_results()
        score_results(all_cached, prompts)
        save_html_report(all_cached, RESULTS_DIR, prompts)


if __name__ == "__main__":
    main()
