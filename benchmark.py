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
import json
import os
import re
import subprocess
import sys
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional

# ── Configuration ──────────────────────────────────────────────────────────

LLAMA_CPP_DIR = Path(__file__).parent / "llama.cpp" / "llama-b8400"
LLAMA_CLI = LLAMA_CPP_DIR / "llama-cli"
LLAMA_SERVER = LLAMA_CPP_DIR / "llama-server"
LLAMA_CACHE_DIR = Path.home() / "Library" / "Caches" / "llama.cpp"
RESULTS_DIR = Path(__file__).parent / "benchmark-results"

# Models to benchmark. Each entry has:
#   - name: display name
#   - size_class: "small" or "large" for filtering
#   - llamacpp_hf: HuggingFace repo for llama.cpp -hf flag
#   - llamacpp_quant: quantization to use (default Q4_K_M)
#   - mlx_model: MLX model ID from mlx-community
MODELS = [
    {
        "name": "Qwen 2.5 7B Instruct",
        "size_class": "small",
        "llamacpp_hf": "Qwen/Qwen2.5-7B-Instruct-GGUF",
        "llamacpp_quant": "Q4_K_M",
        "mlx_model": "mlx-community/Qwen2.5-7B-Instruct-4bit",
    },
    {
        "name": "Qwen 2.5 32B Instruct",
        "size_class": "small",
        "llamacpp_hf": "Qwen/Qwen2.5-32B-Instruct-GGUF",
        "llamacpp_quant": "Q4_K_M",
        "mlx_model": "mlx-community/Qwen2.5-32B-Instruct-4bit",
    },
    {
        "name": "Qwen 2.5 72B Instruct",
        "size_class": "large",
        "llamacpp_hf": "Qwen/Qwen2.5-72B-Instruct-GGUF",
        "llamacpp_quant": "Q4_K_M",
        "mlx_model": "mlx-community/Qwen2.5-72B-Instruct-4bit",
    },
    {
        "name": "Command-R+ 104B",
        "size_class": "xlarge",
        "llamacpp_hf": "bartowski/c4ai-command-r-plus-GGUF",
        "llamacpp_quant": "Q4_K_M",
        "mlx_model": "mlx-community/c4ai-command-r-plus-4bit",
    },
    {
        "name": "Qwen 3.5 122B-A10B (MoE)",
        "size_class": "xlarge",
        "llamacpp_hf": "bartowski/Qwen_Qwen3.5-122B-A10B-GGUF",
        "llamacpp_quant": "Q4_K_M",
        "mlx_model": "mlx-community/Qwen3.5-122B-A10B-4bit",
    },
    {
        "name": "Mistral Large 123B",
        "size_class": "xlarge",
        "llamacpp_hf": "bartowski/Mistral-Large-Instruct-2411-GGUF",
        "llamacpp_quant": "Q4_K_M",
        "mlx_model": "mlx-community/Mistral-Large-Instruct-2407-4bit",
    },
    {
        "name": "Qwen 3 235B-A22B (MoE)",
        "size_class": "xlarge",
        "llamacpp_hf": "Qwen/Qwen3-235B-A22B-GGUF",
        "llamacpp_quant": "Q4_K_M",
        "mlx_model": "mlx-community/Qwen3-235B-A22B-4bit",
    },
    {
        "name": "Llama 3.1 8B Instruct",
        "size_class": "small",
        "llamacpp_hf": "bartowski/Meta-Llama-3.1-8B-Instruct-GGUF",
        "llamacpp_quant": "Q4_K_M",
        "mlx_model": "mlx-community/Meta-Llama-3.1-8B-Instruct-4bit",
    },
    {
        "name": "DeepSeek R1 Distill Qwen 32B",
        "size_class": "small",
        "llamacpp_hf": "bartowski/DeepSeek-R1-Distill-Qwen-32B-GGUF",
        "llamacpp_quant": "Q4_K_M",
        "mlx_model": "mlx-community/DeepSeek-R1-Distill-Qwen-32B-4bit",
    },
    {
        "name": "DeepSeek R1 Distill Llama 70B",
        "size_class": "large",
        "llamacpp_hf": "bartowski/DeepSeek-R1-Distill-Llama-70B-GGUF",
        "llamacpp_quant": "Q4_K_M",
        "mlx_model": "mlx-community/DeepSeek-R1-Distill-Llama-70B-4bit",
    },
    {
        "name": "DeepSeek R1 671B (MoE, 1.58-bit)",
        "size_class": "xlarge",
        "llamacpp_hf": "unsloth/DeepSeek-R1-GGUF",
        "llamacpp_quant": "UD-IQ1_M",
        "mlx_model": "mlx-community/DeepSeek-R1-3bit",
    },
]

PROMPTS = [
    {
        "name": "short_factual",
        "system": "You are a helpful assistant. Be concise.",
        "prompt": "What are the three laws of thermodynamics? One sentence each.",
    },
    {
        "name": "code_generation",
        "system": "You are an expert programmer. Write clean, working code.",
        "prompt": "Write a Python function that finds the longest palindromic substring in a string. Include type hints.",
    },
    {
        "name": "reasoning",
        "system": "You are a helpful assistant. Think step by step.",
        "prompt": "A farmer has 17 sheep. All but 9 die. How many sheep does the farmer have left? Explain your reasoning.",
    },
]


@dataclass
class BenchmarkResult:
    model: str
    runtime: str
    prompt_name: str
    prompt_tokens: int = 0
    generation_tokens: int = 0
    prompt_tps: float = 0.0  # prompt processing tokens/sec
    generation_tps: float = 0.0  # generation tokens/sec
    peak_memory_gb: float = 0.0
    wall_time_sec: float = 0.0
    output: str = ""
    error: Optional[str] = None


# ── Cache checking ─────────────────────────────────────────────────────────

def is_llamacpp_cached(model_cfg: dict) -> bool:
    """Check if a llama.cpp model is already downloaded in the cache."""
    # llama.cpp caches in ~/Library/Caches/llama.cpp/ with filenames like:
    # Qwen_Qwen2.5-72B-Instruct-GGUF_qwen2.5-72b-instruct-q4_k_m-00001-of-00003.gguf
    # The prefix is repo with / replaced by _
    repo = model_cfg["llamacpp_hf"]
    prefix = repo.replace("/", "_")
    quant = model_cfg["llamacpp_quant"].lower()
    if not LLAMA_CACHE_DIR.exists():
        return False
    for f in LLAMA_CACHE_DIR.iterdir():
        if f.name.startswith(prefix) and quant in f.name.lower() and f.suffix == ".gguf":
            return True
    return False


def is_mlx_cached(model_cfg: dict) -> bool:
    """Check if an MLX model is already downloaded in the HuggingFace cache."""
    hf_cache = Path.home() / ".cache" / "huggingface" / "hub"
    if not hf_cache.exists():
        return False
    # HF cache stores models as models--{org}--{name}
    model_id = model_cfg["mlx_model"]
    cache_dir_name = "models--" + model_id.replace("/", "--")
    model_cache = hf_cache / cache_dir_name
    return model_cache.exists() and any(model_cache.rglob("*.safetensors"))


# ── llama.cpp runner ───────────────────────────────────────────────────────

def run_llamacpp(model_cfg: dict, prompt_cfg: dict, max_tokens: int) -> BenchmarkResult:
    """Run a single benchmark with llama.cpp CLI."""
    result = BenchmarkResult(
        model=model_cfg["name"],
        runtime="llama.cpp",
        prompt_name=prompt_cfg["name"],
    )

    hf_spec = f"{model_cfg['llamacpp_hf']}:{model_cfg['llamacpp_quant']}"
    cmd = [
        str(LLAMA_CLI),
        "-hf", hf_spec,
        "-sys", prompt_cfg["system"],
        "-p", prompt_cfg["prompt"],
        "-n", str(max_tokens),
        "-st",  # single turn
        "--no-warmup",
        "--log-disable",
        "--simple-io",
    ]

    start = time.perf_counter()
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=600,
        )
        result.wall_time_sec = time.perf_counter() - start
        stdout = proc.stdout

        # llama-cli in conversation + single-turn mode puts everything on stdout:
        #   - banner and chrome
        #   - "> {prompt}" echo
        #   - response text
        #   - "[ Prompt: X t/s | Generation: Y t/s ]"
        #   - "Exiting..."
        #
        # Extract response: everything between the prompt echo line and the timing line.
        # The prompt is echoed as "> {prompt_text}\n" followed by a blank line,
        # then the response, then a blank line before the timing bracket.

        # Parse timing from stdout: [ Prompt: 433.0 t/s | Generation: 150.8 t/s ]
        timing_match = re.search(
            r"\[\s*Prompt:\s*([\d.]+)\s*t/s\s*\|\s*Generation:\s*([\d.]+)\s*t/s\s*\]",
            stdout,
        )
        if timing_match:
            result.prompt_tps = float(timing_match.group(1))
            result.generation_tps = float(timing_match.group(2))

        # Extract the response text between the prompt echo and the timing line.
        # Look for "> {prompt}\n" then capture everything until "[ Prompt:"
        prompt_escaped = re.escape(prompt_cfg["prompt"])
        response_match = re.search(
            r">\s*" + prompt_escaped + r"\s*\n(.*?)(?:\n\s*\[\s*Prompt:|\nExiting\.\.\.)",
            stdout,
            re.DOTALL,
        )
        if response_match:
            # Clean up: strip the leading "| " that llama-cli prepends in conversation mode
            text = response_match.group(1).strip()
            # Remove leading "| " prefix if present (conversation mode indicator)
            text = re.sub(r"^\|\s*", "", text)
            result.output = text
        else:
            # Fallback: try to grab text between last empty line after ">" and timing
            lines = stdout.split("\n")
            capturing = False
            response_lines = []
            for line in lines:
                if line.startswith("> "):
                    capturing = True
                    response_lines = []
                    continue
                if capturing:
                    if re.match(r"\s*\[\s*Prompt:", line) or line.strip() == "Exiting...":
                        break
                    response_lines.append(line)
            if response_lines:
                text = "\n".join(response_lines).strip()
                text = re.sub(r"^\|\s*", "", text)
                result.output = text

        # Count generation tokens from output (approximate by whitespace-splitting)
        if result.output and result.generation_tokens == 0:
            # Rough estimate; actual token count may differ
            result.generation_tokens = max_tokens  # we requested this many

        if proc.returncode != 0 and not result.output:
            result.error = f"Exit code {proc.returncode}: {proc.stderr[-500:]}"

    except subprocess.TimeoutExpired:
        result.wall_time_sec = time.perf_counter() - start
        result.error = "Timeout (600s)"
    except Exception as e:
        result.wall_time_sec = time.perf_counter() - start
        result.error = str(e)

    return result


# ── MLX runner ─────────────────────────────────────────────────────────────

def run_mlx(model_cfg: dict, prompt_cfg: dict, max_tokens: int) -> BenchmarkResult:
    """Run a single benchmark with MLX."""
    result = BenchmarkResult(
        model=model_cfg["name"],
        runtime="mlx",
        prompt_name=prompt_cfg["name"],
    )

    # MLX needs to run in-process for accurate timing
    # Use subprocess to avoid model caching between runs affecting results
    script = f'''
import json, sys, time
from mlx_lm import load, stream_generate

model, tokenizer = load("{model_cfg['mlx_model']}")

messages = [
    {{"role": "system", "content": """{prompt_cfg['system']}"""}},
    {{"role": "user", "content": """{prompt_cfg['prompt']}"""}},
]
prompt = tokenizer.apply_chat_template(messages, add_generation_prompt=True, tokenize=False)

text = ""
response = None
for response in stream_generate(model, tokenizer, prompt, max_tokens={max_tokens}):
    text += response.text

if response is None:
    print(json.dumps({{"error": "No response generated"}}))
    sys.exit(1)

print(json.dumps({{
    "output": text,
    "prompt_tokens": response.prompt_tokens,
    "generation_tokens": response.generation_tokens,
    "prompt_tps": response.prompt_tps,
    "generation_tps": response.generation_tps,
    "peak_memory_gb": response.peak_memory,
}}))
'''

    start = time.perf_counter()
    try:
        proc = subprocess.run(
            [sys.executable, "-c", script],
            capture_output=True,
            text=True,
            timeout=600,
        )
        result.wall_time_sec = time.perf_counter() - start

        if proc.returncode != 0:
            result.error = f"Exit code {proc.returncode}: {proc.stderr[-500:]}"
            return result

        # Find the JSON line in stdout (ignore any other output)
        for line in proc.stdout.strip().split("\n"):
            line = line.strip()
            if line.startswith("{"):
                data = json.loads(line)
                break
        else:
            result.error = f"No JSON in output: {proc.stdout[-200:]}"
            return result

        if "error" in data:
            result.error = data["error"]
            return result

        result.output = data["output"]
        result.prompt_tokens = data["prompt_tokens"]
        result.generation_tokens = data["generation_tokens"]
        result.prompt_tps = data["prompt_tps"]
        result.generation_tps = data["generation_tps"]
        result.peak_memory_gb = data["peak_memory_gb"]

    except subprocess.TimeoutExpired:
        result.wall_time_sec = time.perf_counter() - start
        result.error = "Timeout (600s)"
    except Exception as e:
        result.wall_time_sec = time.perf_counter() - start
        result.error = str(e)

    return result


# ── Model downloading ──────────────────────────────────────────────────────

def download_llamacpp_model(model_cfg: dict) -> bool:
    """Pre-download a GGUF model via llama-cli --no-warmup with zero generation."""
    hf_spec = f"{model_cfg['llamacpp_hf']}:{model_cfg['llamacpp_quant']}"
    print(f"  llama.cpp: {hf_spec} ... ", end="", flush=True)

    try:
        proc = subprocess.run(
            [
                str(LLAMA_CLI),
                "-hf", hf_spec,
                "-p", "hi",
                "-n", "1",
                "-st",
                "--no-warmup",
                "--log-disable",
                "--simple-io",
            ],
            capture_output=True,
            text=True,
            timeout=3600,  # 1 hour for very large models
        )
        if proc.returncode == 0:
            print("OK")
            return True
        else:
            # Check if it's just a "0 tokens" exit — model still downloaded
            if "model loaded" in proc.stderr.lower() or proc.returncode == 0:
                print("OK")
                return True
            print(f"FAILED (exit {proc.returncode})")
            # Show last line of stderr for debugging
            last_lines = [l for l in proc.stderr.strip().split("\n") if l.strip()]
            if last_lines:
                print(f"         {last_lines[-1][:100]}")
            return False
    except subprocess.TimeoutExpired:
        print("TIMEOUT")
        return False
    except Exception as e:
        print(f"ERROR: {e}")
        return False


def download_mlx_model(model_cfg: dict) -> bool:
    """Pre-download an MLX model by loading it briefly."""
    model_id = model_cfg["mlx_model"]
    print(f"  MLX:       {model_id} ... ", end="", flush=True)

    script = f'''
from mlx_lm import load
model, tokenizer = load("{model_id}")
print("OK")
'''
    try:
        proc = subprocess.run(
            [sys.executable, "-c", script],
            capture_output=True,
            text=True,
            timeout=3600,
        )
        if proc.returncode == 0 and "OK" in proc.stdout:
            print("OK")
            return True
        else:
            print("FAILED")
            last_lines = [l for l in proc.stderr.strip().split("\n") if l.strip()]
            if last_lines:
                print(f"         {last_lines[-1][:100]}")
            return False
    except subprocess.TimeoutExpired:
        print("TIMEOUT")
        return False
    except Exception as e:
        print(f"ERROR: {e}")
        return False


def download_models(models: list[dict], runtimes: list[str]):
    """Download all models for the selected runtimes."""
    total = len(models) * len(runtimes)
    succeeded = 0
    failed = 0

    print(f"Downloading {len(models)} models for {len(runtimes)} runtime(s)...\n")

    for model_cfg in models:
        print(f"{model_cfg['name']}:")
        for runtime in runtimes:
            if runtime == "llamacpp":
                ok = download_llamacpp_model(model_cfg)
            elif runtime == "mlx":
                ok = download_mlx_model(model_cfg)
            else:
                continue
            if ok:
                succeeded += 1
            else:
                failed += 1
        print()

    print(f"Done: {succeeded}/{total} succeeded", end="")
    if failed:
        print(f", {failed} failed")
    else:
        print()


# ── Output formatting ──────────────────────────────────────────────────────

def print_header(text: str):
    print(f"\n{'=' * 70}")
    print(f"  {text}")
    print(f"{'=' * 70}")


def print_result_summary(r: BenchmarkResult):
    status = "ERROR" if r.error else "OK"
    print(f"  [{status}] {r.runtime:<12} | "
          f"pp: {r.prompt_tps:>8.1f} t/s | "
          f"gen: {r.generation_tps:>7.1f} t/s | "
          f"{r.generation_tokens:>4} tokens | "
          f"{r.wall_time_sec:>6.1f}s wall")
    if r.peak_memory_gb > 0:
        print(f"{'':>17} | peak memory: {r.peak_memory_gb:.1f} GB")
    if r.error:
        print(f"{'':>17} | error: {r.error[:80]}")


def print_comparison_table(results: list[BenchmarkResult]):
    """Print a markdown table comparing all results."""
    print(f"\n{'─' * 90}")
    print(f"{'Model':<30} {'Runtime':<12} {'Prompt':<16} "
          f"{'PP t/s':>8} {'Gen t/s':>8} {'Tokens':>7} {'Wall':>7}")
    print(f"{'─' * 90}")
    for r in results:
        err = " *" if r.error else ""
        print(f"{r.model:<30} {r.runtime:<12} {r.prompt_name:<16} "
              f"{r.prompt_tps:>8.1f} {r.generation_tps:>8.1f} "
              f"{r.generation_tokens:>7} {r.wall_time_sec:>6.1f}s{err}")
    print(f"{'─' * 90}")


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


def save_results(results: list[BenchmarkResult], output_dir: Path):
    """Save results to JSON and markdown."""
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = time.strftime("%Y%m%d-%H%M%S")

    # JSON (full data)
    json_path = output_dir / f"benchmark-{timestamp}.json"
    with open(json_path, "w") as f:
        json.dump([asdict(r) for r in results], f, indent=2)

    # Markdown summary
    md_path = output_dir / f"benchmark-{timestamp}.md"
    with open(md_path, "w") as f:
        f.write(f"# Benchmark Results — {time.strftime('%Y-%m-%d %H:%M')}\n\n")

        f.write("## Performance Summary\n\n")
        f.write("| Model | Runtime | Prompt | PP t/s | Gen t/s | Tokens | Wall Time |\n")
        f.write("|---|---|---|---|---|---|---|\n")
        for r in results:
            err = " (error)" if r.error else ""
            f.write(f"| {r.model} | {r.runtime} | {r.prompt_name} | "
                    f"{r.prompt_tps:.1f} | {r.generation_tps:.1f} | "
                    f"{r.generation_tokens} | {r.wall_time_sec:.1f}s{err} |\n")

        f.write("\n## Outputs\n\n")
        for r in results:
            if r.error:
                f.write(f"### {r.model} / {r.runtime} / {r.prompt_name} — ERROR\n\n")
                f.write(f"```\n{r.error}\n```\n\n")
            else:
                f.write(f"### {r.model} / {r.runtime} / {r.prompt_name}\n\n")
                f.write(f"```\n{r.output}\n```\n\n")

    print(f"\nResults saved to:")
    print(f"  {json_path}")
    print(f"  {md_path}")


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
        "--max-tokens", type=int, default=256,
        help="Max tokens to generate per prompt (default: 256)",
    )
    parser.add_argument(
        "--quick", action="store_true",
        help="Quick mode: 32 tokens, first prompt only",
    )
    parser.add_argument(
        "--prompt", type=str, default=None,
        help="Run only the named prompt (short_factual, code_generation, reasoning)",
    )
    parser.add_argument(
        "--no-save", action="store_true",
        help="Don't save results to files",
    )
    parser.add_argument(
        "--download", action="store_true",
        help="Download all models for selected runtimes/tiers, then exit (no benchmarking)",
    )
    args = parser.parse_args()

    if args.quick and not args.download:
        args.max_tokens = 32

    # Filter models — each tier runs only its own models, "all" runs everything
    if args.models == "all":
        models = MODELS
    else:
        models = [m for m in MODELS if m["size_class"] == args.models]

    # Filter prompts
    if args.quick:
        prompts = PROMPTS[:1]
    elif args.prompt:
        prompts = [p for p in PROMPTS if p["name"] == args.prompt]
        if not prompts:
            print(f"Unknown prompt: {args.prompt}")
            print(f"Available: {', '.join(p['name'] for p in PROMPTS)}")
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

    for model_cfg in models:
        for prompt_cfg in prompts:
            print_header(f"{model_cfg['name']} — {prompt_cfg['name']}")

            for runtime in runtimes:
                # Check if model is cached — don't try to download during benchmark runs
                if runtime == "llamacpp" and not is_llamacpp_cached(model_cfg):
                    print(f"\n  Skipping {runtime}: model not downloaded. Run with --download first.")
                    continue
                if runtime == "mlx" and not is_mlx_cached(model_cfg):
                    print(f"\n  Skipping {runtime}: model not downloaded. Run with --download first.")
                    continue

                print(f"\n  Running {runtime}...", flush=True)

                if runtime == "llamacpp":
                    r = run_llamacpp(model_cfg, prompt_cfg, args.max_tokens)
                elif runtime == "mlx":
                    r = run_mlx(model_cfg, prompt_cfg, args.max_tokens)

                print_result_summary(r)
                results.append(r)

    # Final summary
    print_header("SUMMARY")
    print_comparison_table(results)

    # Show output comparisons
    for prompt_cfg in prompts:
        print_output_comparison(results, prompt_cfg["name"])

    # Save
    if not args.no_save:
        save_results(results, RESULTS_DIR)


if __name__ == "__main__":
    main()
