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
import os
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

from common import (
    LLAMA_CLI,
    EXECUTION_DIR, RESULTS_DIR,
    MODELS, PROMPTS,
    BenchmarkResult,
    GAMESERVER_BINARY,
    load_prompts,
    load_scenarios,
    compute_prompt_hash,
    compute_scenario_hash,
    load_existing_results, load_all_results,
    append_result,
    COMMANDER_LOCAL_PROVIDER,
)
from runner import (
    score_result,
    score_results,
    is_llamacpp_cached, is_mlx_cached,
    start_llamacpp_server, stop_llamacpp_server, run_llamacpp_prompt,
    start_mlx_subprocess, stop_mlx_subprocess, run_mlx_prompt,
    start_mlx_server, stop_mlx_server,
    run_game_scenario,
    download_models,
    LLAMACPP_PORT, MLX_SERVER_PORT,
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
        "--models", choices=["small", "large", "xlarge", "all"], default="all",
        help="Model size class to test: small (<= 32B), large (72B), xlarge (100B+), all (default: all, ordered smallest→largest)",
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
    parser.add_argument(
        "--scenarios", type=str, default="all",
        help="Run game scenarios matching this name, or 'all' for every scenario, or 'none' to skip. Default: all.",
    )
    parser.add_argument(
        "--scenario-md-dir", type=str,
        default=str(Path.home() / "workspace" / "smbench" / "scenarios"),
        help="Directory containing the scenario markdown files commander reads (default: ~/workspace/smbench/scenarios)",
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
        models = list(MODELS)
    else:
        models = [m for m in MODELS if m["size_class"] == args.models]

    # Order smallest → largest so runs progress from cheap to expensive
    _size_order = {"small": 0, "large": 1, "xlarge": 2}
    models.sort(key=lambda m: _size_order.get(m["size_class"], 99))

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

    # Load scenarios if requested ("none" disables)
    scenarios: list = []
    if args.scenarios and args.scenarios != "none":
        all_scenarios = load_scenarios()
        if args.scenarios == "all":
            scenarios = all_scenarios
        else:
            scenarios = [s for s in all_scenarios if args.scenarios in s.name]
        if not scenarios:
            print(f"No scenarios matching: {args.scenarios}")
            print(f"Available: {', '.join(s.name for s in all_scenarios)}")
            sys.exit(1)

        # Validate gameserver binary is configured and exists before doing any work
        if GAMESERVER_BINARY is None:
            print(
                "ERROR: TESTBENCH_GAMESERVER_BINARY is not set.\n"
                "  Set it to the path of the spacemolt-server binary, e.g.\n"
                "    export TESTBENCH_GAMESERVER_BINARY=/path/to/spacemolt-server\n"
                "  Or pass --scenarios none to skip game scenarios."
            )
            sys.exit(1)
        if not GAMESERVER_BINARY.exists():
            print(
                f"ERROR: gameserver binary not found at {GAMESERVER_BINARY}\n"
                f"  (from TESTBENCH_GAMESERVER_BINARY). Check the path or pass --scenarios none."
            )
            sys.exit(1)

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

            # Check if all prompts AND scenarios are already cached before starting the model
            existing = load_existing_results(model_cfg["name"], runtime)
            prompts_all_cached = all(
                existing.get(pcfg["_key"]) and existing[pcfg["_key"]].prompt_hash == compute_prompt_hash(pcfg)
                for tier_num in tier_order
                for pcfg in tiers[tier_num]
            )
            scenarios_all_cached = all(
                existing.get(s.name) and existing[s.name].scenario_hash == compute_scenario_hash(s)
                for s in scenarios
            )

            if prompts_all_cached and scenarios_all_cached:
                print(f"\n  {model_cfg['name']} / {runtime}: all {len(prompts)} prompts and {len(scenarios)} scenarios cached, skipping model load")
                for tier_num in tier_order:
                    for pcfg in tiers[tier_num]:
                        cached = existing[pcfg["_key"]]
                        score_result(cached, pcfg)
                        results.append(cached)
                for s in scenarios:
                    cached = existing[s.name]
                    pcfg = {
                        "scorer": "game",
                        "game_scorer": s.scorer,
                        "scorer_params": s.scorer_params,
                        "category": "game",
                        "tier": s.tier,
                        "style": "game",
                    }
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

                # ── Game scenarios ──
                if scenarios:
                    # For MLX, swap the stdin/stdout subprocess for an HTTP server
                    mlx_http_proc = None
                    if runtime == "mlx":
                        if mlx_proc is not None:
                            stop_mlx_subprocess(mlx_proc)
                            mlx_proc = None
                        mlx_http_proc = start_mlx_server(model_cfg)
                        if mlx_http_proc is None:
                            print(f"    MLX server failed to start, skipping scenarios.", flush=True)
                            scenarios_iter = []
                        else:
                            scenarios_iter = scenarios
                    else:
                        scenarios_iter = scenarios

                    # TESTBENCH_SCENARIO_BASE_URL lets you interpose a proxy
                    # (e.g. tcp_tee.py) between commander and the LLM backend
                    # for debugging — set it to the proxy's URL.
                    _env_url = os.environ.get("TESTBENCH_SCENARIO_BASE_URL")
                    if _env_url:
                        scenario_base_url = _env_url
                    elif runtime == "llamacpp":
                        scenario_base_url = f"http://127.0.0.1:{LLAMACPP_PORT}/v1"
                    else:
                        scenario_base_url = f"http://127.0.0.1:{MLX_SERVER_PORT}/v1"

                    if scenarios_iter:
                        print(f"\n  ── Game Scenarios ({len(scenarios_iter)}) ──", flush=True)
                    try:
                        for scenario in scenarios_iter:
                            scenario_md_path = str(Path(args.scenario_md_dir) / f"{scenario.fixture}.md")

                            # Cache check using scenario_hash
                            cached = existing.get(scenario.name)
                            s_hash = compute_scenario_hash(scenario)
                            if cached and cached.scenario_hash == s_hash:
                                print(f"  [cached] scenario:{scenario.name}")
                                results.append(cached)
                                continue

                            if runtime == "mlx":
                                commander_model_string = f"{COMMANDER_LOCAL_PROVIDER}/{model_cfg['mlx_model']}"
                            else:
                                # Use the HF repo id, not the display name. Display
                                # names contain spaces and parentheses which llama.cpp
                                # rejects with a bare 400 in the chat-completions
                                # `model` field. llama-server serves whatever was
                                # loaded regardless of the value, so any stable id works.
                                commander_model_string = f"{COMMANDER_LOCAL_PROVIDER}/{model_cfg['llamacpp_hf']}"
                            r = run_game_scenario(
                                model_cfg=model_cfg,
                                scenario=scenario,
                                commander_model_string=commander_model_string,
                                scenario_md_path=scenario_md_path,
                                llm_base_url=scenario_base_url,
                                runtime=runtime,
                            )
                            # Synthesize the scorer dispatch dict expected by score_result
                            pcfg = {
                                "scorer": "game",
                                "game_scorer": scenario.scorer,
                                "scorer_params": scenario.scorer_params,
                                "category": "game",
                                "tier": scenario.tier,
                                "style": "game",
                            }
                            r.prompt_name = scenario.name
                            score_result(r, pcfg)
                            print_result_summary(r)
                            results.append(r)
                            append_result(r)
                    finally:
                        if mlx_http_proc is not None:
                            stop_mlx_server(mlx_http_proc)

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
