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
import signal
import subprocess
import sys
import tempfile
import time
import urllib.request
import urllib.error
from pathlib import Path
from typing import Optional

from common import (
    LLAMA_CPP_DIR, LLAMA_CLI, LLAMA_SERVER, LLAMA_CACHE_DIR,
    EXECUTION_DIR, RESULTS_DIR,
    MODELS, SYSTEM_PROMPTS, PROMPTS_DIR, PROMPTS,
    BenchmarkResult,
    evaluate_constraint, _try_parse_json,
    _json_has_keys, _json_all_string_values, _count_sentences,
    load_prompts,
    compute_prompt_hash, compute_eval_hash, compute_challenge_hash,
    model_slug, results_file_path, load_existing_results, load_all_results,
    append_result,
)

# ── Code extraction and execution ──────────────────────────────────────────

def extract_code(output: str) -> str:
    """Extract Python code from model output, handling markdown fences."""
    # Try to extract from ```python ... ``` or ``` ... ```
    fence_match = re.search(
        r"```(?:python|py)?\s*\n(.*?)```",
        output,
        re.DOTALL,
    )
    if fence_match:
        return fence_match.group(1).strip()

    # If output starts with "def ", it's likely raw code
    lines = output.strip().splitlines()
    code_lines = []
    in_code = False
    for line in lines:
        if line.startswith("def ") or line.startswith("import ") or line.startswith("from "):
            in_code = True
        if in_code:
            # Stop at obvious non-code (explanation text after the function)
            if line and not line[0].isspace() and not line.startswith("def ") and not line.startswith("import ") and not line.startswith("from ") and not line.startswith("#") and not line.startswith("@"):
                # Could be a new top-level statement or explanation
                # If it looks like prose, stop
                if re.match(r'^[A-Z][a-z].*[.:]$', line):
                    break
            code_lines.append(line)

    if code_lines:
        return "\n".join(code_lines).strip()

    # Last resort: return the whole thing
    return output.strip()


def run_code_with_tests(code: str, test_code: str, timeout: int = 10) -> tuple[bool, str]:
    """Execute generated code + test assertions in a subprocess. Returns (passed, details)."""
    full_code = code + "\n\n" + test_code + "\nprint('ALL_TESTS_PASSED')\n"

    try:
        proc = subprocess.run(
            [sys.executable, "-c", full_code],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        if proc.returncode == 0 and "ALL_TESTS_PASSED" in proc.stdout:
            return True, "all tests passed"
        else:
            # Find which assertion failed
            stderr = proc.stderr.strip()
            if "AssertionError" in stderr or "AssertionError" in stderr:
                return False, f"assertion failed: {stderr.splitlines()[-1][:120]}"
            elif "SyntaxError" in stderr:
                return False, f"syntax error: {stderr.splitlines()[-1][:120]}"
            elif "NameError" in stderr:
                return False, f"name error: {stderr.splitlines()[-1][:120]}"
            else:
                last_err = stderr.splitlines()[-1][:120] if stderr else proc.stdout[:120]
                return False, f"failed: {last_err}"
    except subprocess.TimeoutExpired:
        return False, "execution timed out"
    except Exception as e:
        return False, f"execution error: {str(e)[:120]}"


# ── Scoring ────────────────────────────────────────────────────────────────

def score_result(result: BenchmarkResult, prompt_cfg: dict) -> None:
    """Score a benchmark result in-place based on the prompt's scorer type."""
    result.category = prompt_cfg.get("category", "")
    result.tier = prompt_cfg.get("tier", 0)
    result.style = prompt_cfg.get("style", "")
    result.prompt_text = prompt_cfg.get("prompt", "")
    result.expected = prompt_cfg.get("expected", "")

    if result.error or not result.output:
        result.score = 0.0
        result.score_details = "no output" if not result.error else f"error: {result.error[:80]}"
        return

    scorer = prompt_cfg.get("scorer")
    if not scorer:
        return  # no scoring defined

    if scorer == "exact_match":
        _score_exact_match(result, prompt_cfg)
    elif scorer == "constraint":
        _score_constraints(result, prompt_cfg)
    elif scorer == "code_exec":
        _score_code_exec(result, prompt_cfg)


def _score_exact_match(result: BenchmarkResult, prompt_cfg: dict) -> None:
    expected = prompt_cfg["expected"]
    pattern = prompt_cfg["extract"]
    output = result.output

    match = re.search(pattern, output)
    if not match:
        result.score = 0.0
        result.score_details = f"no match for pattern in output"
        return

    extracted = match.group(1).replace(",", "")  # strip commas from numbers
    if extracted == expected:
        result.score = 1.0
        result.score_details = f"correct: {extracted}"
    else:
        result.score = 0.0
        result.score_details = f"expected {expected}, got {extracted}"


def _score_constraints(result: BenchmarkResult, prompt_cfg: dict) -> None:
    constraints = prompt_cfg["constraints"]
    passed = []
    failed = []

    for name, check_fn in constraints:
        try:
            if check_fn(result.output):
                passed.append(name)
            else:
                failed.append(name)
        except Exception:
            failed.append(name)

    total = len(constraints)
    result.score = len(passed) / total if total > 0 else 0.0
    if failed:
        result.score_details = f"{len(passed)}/{total}: failed [{', '.join(failed)}]"
    else:
        result.score_details = f"{len(passed)}/{total}: all passed"


def _score_code_exec(result: BenchmarkResult, prompt_cfg: dict) -> None:
    code = extract_code(result.output)
    test_code = prompt_cfg["test_code"]
    passed, details = run_code_with_tests(code, test_code)
    result.score = 1.0 if passed else 0.0
    result.score_details = details


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
    if not model_cfg.get("mlx_model"):
        return False
    hf_cache = Path.home() / ".cache" / "huggingface" / "hub"
    if not hf_cache.exists():
        return False
    # HF cache stores models as models--{org}--{name}
    model_id = model_cfg["mlx_model"]
    cache_dir_name = "models--" + model_id.replace("/", "--")
    model_cache = hf_cache / cache_dir_name
    return model_cache.exists() and any(model_cache.rglob("*.safetensors"))


# ── llama.cpp runner (persistent server) ───────────────────────────────────

LLAMACPP_PORT = 18080


def _wait_for_server(port: int, timeout: float = 300) -> bool:
    """Poll llama-server health endpoint until ready."""
    url = f"http://127.0.0.1:{port}/health"
    deadline = time.perf_counter() + timeout
    while time.perf_counter() < deadline:
        try:
            resp = urllib.request.urlopen(url, timeout=2)
            if resp.status == 200:
                return True
        except (urllib.error.URLError, ConnectionError, OSError):
            pass
        time.sleep(1)
    return False


def _chat_completion(port: int, system: str, user: str, max_tokens: int,
                     timeout: float = 600) -> dict:
    """Send a chat completion request to llama-server."""
    url = f"http://127.0.0.1:{port}/v1/chat/completions"
    payload = json.dumps({
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "max_tokens": max_tokens,
        "temperature": 0.7,
    }).encode()

    req = urllib.request.Request(
        url, data=payload,
        headers={"Content-Type": "application/json"},
    )
    resp = urllib.request.urlopen(req, timeout=timeout)
    return json.loads(resp.read())


def start_llamacpp_server(model_cfg: dict) -> Optional[subprocess.Popen]:
    """Start llama-server and wait until ready. Returns the process or None on failure."""
    hf_spec = f"{model_cfg['llamacpp_hf']}:{model_cfg['llamacpp_quant']}"
    server_cmd = [
        str(LLAMA_SERVER),
        "-hf", hf_spec,
        "--host", "127.0.0.1",
        "--port", str(LLAMACPP_PORT),
        "--log-disable",
    ]

    print(f"    Starting llama-server for {model_cfg['name']}...", flush=True)
    proc = subprocess.Popen(server_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)

    if _wait_for_server(LLAMACPP_PORT):
        print(f"    Server ready.", flush=True)
        return proc
    else:
        stderr = proc.stderr.read().decode() if proc.stderr else ""
        print(f"    Server failed to start: {stderr[-200:]}", flush=True)
        proc.kill()
        proc.wait()
        return None


def stop_llamacpp_server(proc: subprocess.Popen) -> None:
    """Stop a running llama-server."""
    print(f"    Stopping server...", flush=True)
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()


def run_llamacpp_prompt(model_cfg: dict, prompt_cfg: dict,
                        max_tokens: int) -> BenchmarkResult:
    """Run a single prompt against an already-running llama-server."""
    result = BenchmarkResult(
        model=model_cfg["name"],
        runtime="llamacpp",
        prompt_name=prompt_cfg["name"],
    )

    start = time.perf_counter()
    try:
        data = _chat_completion(
            LLAMACPP_PORT,
            prompt_cfg["system"],
            prompt_cfg["prompt"],
            max_tokens,
        )
        result.wall_time_sec = time.perf_counter() - start

        choice = data["choices"][0]
        result.output = choice["message"]["content"].strip()

        usage = data.get("usage", {})
        result.prompt_tokens = usage.get("prompt_tokens", 0)
        result.generation_tokens = usage.get("completion_tokens", 0)

        timings = data.get("timings", {})
        if timings:
            result.prompt_tps = timings.get("prompt_per_second", 0.0)
            result.generation_tps = timings.get("predicted_per_second", 0.0)
        elif result.generation_tokens > 0 and result.wall_time_sec > 0:
            result.generation_tps = result.generation_tokens / result.wall_time_sec

    except Exception as e:
        result.wall_time_sec = time.perf_counter() - start
        result.error = str(e)[:200]

    return result


# ── MLX runner (persistent subprocess) ─────────────────────────────────────

# The MLX child process stays alive, reads JSON prompt objects from stdin
# one per line, and writes JSON result objects to stdout one per line.
# Send {"cmd": "quit"} to shut down.

_MLX_CHILD_SCRIPT = '''
import json, sys, time
from mlx_lm import load, stream_generate

model_id = sys.argv[1]
print("LOADING_MODEL", flush=True)
model, tokenizer = load(model_id)
print("MODEL_READY", flush=True)

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    req = json.loads(line)

    if req.get("cmd") == "quit":
        break

    messages = [
        {"role": "system", "content": req["system"]},
        {"role": "user", "content": req["user"]},
    ]
    prompt = tokenizer.apply_chat_template(messages, add_generation_prompt=True, tokenize=False)

    text = ""
    response = None
    start = time.perf_counter()
    try:
        for response in stream_generate(model, tokenizer, prompt, max_tokens=req["max_tokens"]):
            text += response.text
        wall = time.perf_counter() - start

        if response is None:
            out = {"name": req["name"], "error": "No response generated", "wall": wall}
        else:
            out = {
                "name": req["name"],
                "output": text,
                "prompt_tokens": response.prompt_tokens,
                "generation_tokens": response.generation_tokens,
                "prompt_tps": response.prompt_tps,
                "generation_tps": response.generation_tps,
                "peak_memory_gb": response.peak_memory,
                "wall": wall,
            }
    except Exception as e:
        wall = time.perf_counter() - start
        out = {"name": req["name"], "error": str(e)[:200], "wall": wall}

    print("RESULT:" + json.dumps(out), flush=True)
'''


def start_mlx_subprocess(model_cfg: dict) -> Optional[subprocess.Popen]:
    """Start the persistent MLX child process. Returns the process or None."""
    print(f"    Loading MLX model {model_cfg['name']}...", flush=True)

    proc = subprocess.Popen(
        [sys.executable, "-c", _MLX_CHILD_SCRIPT, model_cfg["mlx_model"]],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    # Wait for MODEL_READY
    deadline = time.perf_counter() + 600
    while time.perf_counter() < deadline:
        line = proc.stdout.readline().strip()
        if line == "MODEL_READY":
            print(f"    Model loaded.", flush=True)
            return proc
        if line == "LOADING_MODEL":
            continue
        if proc.poll() is not None:
            stderr = proc.stderr.read()
            print(f"    MLX subprocess died: {stderr[-200:]}", flush=True)
            return None

    print(f"    MLX subprocess timed out during model load.", flush=True)
    proc.kill()
    proc.wait()
    return None


def stop_mlx_subprocess(proc: subprocess.Popen) -> None:
    """Send quit command and wait for the MLX child to exit."""
    print(f"    Stopping MLX subprocess...", flush=True)
    try:
        proc.stdin.write('{"cmd": "quit"}\n')
        proc.stdin.flush()
        proc.wait(timeout=10)
    except Exception:
        proc.kill()
        proc.wait()


def run_mlx_prompt(proc: subprocess.Popen, model_cfg: dict,
                   prompt_cfg: dict, max_tokens: int) -> BenchmarkResult:
    """Send a single prompt to the running MLX subprocess and read the result."""
    result = BenchmarkResult(
        model=model_cfg["name"],
        runtime="mlx",
        prompt_name=prompt_cfg["name"],
    )

    req = json.dumps({
        "name": prompt_cfg["name"],
        "system": prompt_cfg["system"],
        "user": prompt_cfg["prompt"],
        "max_tokens": max_tokens,
    })

    try:
        proc.stdin.write(req + "\n")
        proc.stdin.flush()

        # Read until we get a RESULT: line
        while True:
            line = proc.stdout.readline().strip()
            if line.startswith("RESULT:"):
                d = json.loads(line[7:])
                break
            if not line and proc.poll() is not None:
                result.error = "MLX subprocess died unexpectedly"
                return result

        if "error" in d:
            result.error = d["error"]
            result.wall_time_sec = d.get("wall", 0.0)
        else:
            result.output = d["output"]
            result.prompt_tokens = d["prompt_tokens"]
            result.generation_tokens = d["generation_tokens"]
            result.prompt_tps = d["prompt_tps"]
            result.generation_tps = d["generation_tps"]
            result.peak_memory_gb = d["peak_memory_gb"]
            result.wall_time_sec = d["wall"]

    except Exception as e:
        result.error = str(e)[:200]

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
    if not model_cfg.get("mlx_model"):
        print(f"  MLX:       No MLX model available, skipping.")
        return False
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
            "prompt_tps": r.prompt_tps,
            "generation_tps": r.generation_tps,
            "wall_time_sec": r.wall_time_sec,
            "output": r.output,
            "prompt_text": r.prompt_text,
        })

    data_json = json.dumps(data_records, default=str)

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Benchmark Analysis — {date_display}</title>
<style>
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; color: #111827; }}
.header {{ background: #1f2937; color: #fff; padding: 16px 24px; font-size: 20px; font-weight: 600; }}
.controls {{ padding: 16px 24px; background: #fff; border-bottom: 1px solid #e5e7eb; display: flex; flex-wrap: wrap; gap: 16px; align-items: center; }}
.heatmaps-row {{ display: flex; gap: 32px; align-items: flex-start; flex-wrap: wrap; }}
.heatmap-panel {{ flex: 1; min-width: 0; }}
.heatmap-panel h3 {{ font-size: 16px; font-weight: 600; margin-bottom: 8px; color: #374151; }}
.model-selector {{ display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }}
.model-selector label {{ font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 4px; background: #f3f4f6; }}
.model-selector label:hover {{ background: #e5e7eb; }}
.model-selector a {{ font-size: 12px; color: #2563eb; cursor: pointer; text-decoration: underline; margin-right: 8px; }}
.content {{ padding: 24px; }}
.tier-section {{ margin-bottom: 32px; }}
.tier-title {{ font-size: 18px; font-weight: 600; margin-bottom: 8px; }}
.heatmap {{ border-collapse: collapse; font-family: 'SF Mono', 'Consolas', 'Monaco', monospace; font-size: 12px; }}
.heatmap th {{ padding: 4px 8px; text-align: center; font-weight: 500; background: #f9fafb; border: 1px solid #e5e7eb; font-size: 11px; white-space: nowrap; }}
.heatmap td {{ width: 60px; min-width: 60px; height: 30px; text-align: center; border: 1px solid #e5e7eb; cursor: pointer; font-size: 12px; font-weight: 600; }}
.heatmap td:hover {{ outline: 2px solid #2563eb; outline-offset: -2px; }}
.heatmap td.model-name {{ width: 250px; min-width: 250px; max-width: 250px; text-align: left; cursor: default; font-weight: 500; background: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }}
.heatmap td.model-name:hover {{ outline: none; }}
.heatmap td.no-data {{ background: #e5e7eb; color: #9ca3af; cursor: default; }}
.heatmap td.no-data:hover {{ outline: none; }}
.heatmap tr.greyed-out td {{ opacity: 0.35; }}
.heatmap tr.greyed-out td.model-name {{ opacity: 0.5; }}
.heatmap td.tier-label {{ width: 40px; min-width: 40px; text-align: center; cursor: default; background: #f9fafb; font-weight: 500; font-size: 11px; color: #6b7280; }}
.heatmap td.tier-label:hover {{ outline: none; }}
.heatmap tr.model-separator {{ height: 4px; }}
.heatmap tr.model-separator td {{ border: none; padding: 0; }}
.detail-panel {{ background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px; margin-top: 16px; }}
.detail-title {{ font-size: 16px; font-weight: 600; margin-bottom: 16px; }}
.detail-placeholder {{ color: #9ca3af; font-style: italic; }}
.bar-chart {{ margin-bottom: 24px; }}
.bar-row {{ display: flex; align-items: center; margin-bottom: 6px; }}
.bar-label {{ width: 120px; font-size: 13px; font-family: 'SF Mono', 'Consolas', monospace; text-align: right; padding-right: 12px; flex-shrink: 0; }}
.bar-track {{ flex: 1; height: 24px; background: #f3f4f6; border-radius: 4px; overflow: hidden; position: relative; }}
.bar-fill {{ height: 100%; border-radius: 4px; display: flex; align-items: center; padding-left: 8px; font-size: 12px; font-weight: 600; min-width: fit-content; }}
.prompt-results {{ margin-top: 16px; }}
.prompt-results h4 {{ font-size: 14px; font-weight: 600; margin-bottom: 8px; }}
.prompt-result-row {{ font-family: 'SF Mono', 'Consolas', monospace; font-size: 12px; padding: 4px 0; border-bottom: 1px solid #f3f4f6; display: flex; gap: 12px; }}
.prompt-result-name {{ width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }}
.prompt-result-score {{ width: 60px; font-weight: 600; }}
.prompt-result-details {{ color: #6b7280; flex: 1; }}
.prompt-result-prompt {{ margin-top: 4px; padding: 8px; background: #f0f4ff; border: 1px solid #d0d8e8; border-radius: 4px; max-height: 80px; overflow-y: auto; font-family: 'SF Mono', 'Consolas', monospace; font-size: 11px; white-space: pre-wrap; word-break: break-word; color: #374151; }}
.prompt-result-output {{ margin-top: 4px; padding: 8px; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 4px; max-height: 120px; overflow-y: auto; font-family: 'SF Mono', 'Consolas', monospace; font-size: 11px; white-space: pre-wrap; word-break: break-word; }}
</style>
</head>
<body>
<div class="header">Benchmark Analysis &mdash; {date_display}</div>

<div class="controls">
  <div class="model-selector" id="model-selector">
    <a onclick="selectAllModels(true)">Select All</a>
    <a onclick="selectAllModels(false)">Deselect All</a>
  </div>
</div>

<div class="content">
  <div id="heatmaps"></div>
  <div class="detail-panel" id="detail-panel">
    <div class="detail-placeholder">Click a cell to see details</div>
  </div>
</div>

<script>const DATA = {data_json};</script>
<script>
(function() {{
  let checkedModels = new Set();
  const runtimes = ['llamacpp', 'mlx'];

  // Extract unique values
  const allModels = [...new Set(DATA.map(d => d.model))].sort();
  const allCategories = [...new Set(DATA.map(d => d.category))].sort();
  const allTiers = [...new Set(DATA.map(d => d.tier))].sort((a, b) => a - b);

  // Models that have data for a given runtime
  function modelsForRuntime(rt) {{
    return new Set(DATA.filter(d => d.runtime === rt).map(d => d.model));
  }}

  // Init checked models
  allModels.forEach(m => checkedModels.add(m));

  // Build model checkboxes
  const selEl = document.getElementById('model-selector');
  allModels.forEach(m => {{
    const lbl = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.dataset.model = m;
    cb.addEventListener('change', () => {{
      if (cb.checked) checkedModels.add(m); else checkedModels.delete(m);
      renderAllHeatmaps();
    }});
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(' ' + m));
    selEl.appendChild(lbl);
  }});

  window.selectAllModels = function(sel) {{
    document.querySelectorAll('#model-selector input[type=checkbox]').forEach(cb => {{
      cb.checked = sel;
      if (sel) checkedModels.add(cb.dataset.model); else checkedModels.delete(cb.dataset.model);
    }});
    renderAllHeatmaps();
  }};

  function scoreColor(pct) {{
    if (pct >= 90) return '#22c55e';
    if (pct >= 70) return '#86efac';
    if (pct >= 50) return '#facc15';
    if (pct >= 30) return '#fb923c';
    return '#ef4444';
  }}

  function textColor(pct) {{
    if (pct >= 90) return '#fff';
    if (pct >= 70) return '#111827';
    if (pct >= 50) return '#111827';
    if (pct >= 30) return '#111827';
    return '#fff';
  }}

  function buildHeatmapTable(runtime, showModelNames) {{
    const rtModels = modelsForRuntime(runtime);
    const allCats = [...new Set(DATA.map(d => d.category))].sort();
    if (allCats.length === 0) return null;

    const table = document.createElement('table');
    table.className = 'heatmap';

    // Header row
    const thead = document.createElement('thead');
    const hrow = document.createElement('tr');
    if (showModelNames) {{
      const modelTh = document.createElement('th');
      modelTh.textContent = 'Model';
      modelTh.style.textAlign = 'left';
      modelTh.style.width = '250px';
      hrow.appendChild(modelTh);
    }}
    const tierTh = document.createElement('th');
    tierTh.textContent = 'Tier';
    tierTh.style.width = '40px';
    hrow.appendChild(tierTh);
    allCats.forEach(cat => {{
      const th = document.createElement('th');
      th.textContent = cat;
      hrow.appendChild(th);
    }});
    thead.appendChild(hrow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    allModels.forEach(model => {{
      if (!checkedModels.has(model)) return;
      const hasData = rtModels.has(model);

      allTiers.forEach((tier, tierIdx) => {{
        const row = document.createElement('tr');
        if (!hasData) row.className = 'greyed-out';

        // Model name only on first tier row, only if showing names
        if (showModelNames && tierIdx === 0) {{
          const nameTd = document.createElement('td');
          nameTd.className = 'model-name';
          nameTd.textContent = model;
          nameTd.rowSpan = allTiers.length;
          nameTd.style.verticalAlign = 'middle';
          row.appendChild(nameTd);
        }}

        // Tier label
        const tierTd = document.createElement('td');
        tierTd.className = 'tier-label';
        tierTd.textContent = tier;
        row.appendChild(tierTd);

        allCats.forEach(cat => {{
          const td = document.createElement('td');
          const matches = DATA.filter(d => d.model === model && d.runtime === runtime && d.tier === tier && d.category === cat);
          if (matches.length === 0) {{
            td.className = 'no-data';
            td.textContent = '\u2014';
          }} else {{
            const avg = matches.reduce((s, d) => s + d.score, 0) / matches.length;
            const pct = Math.round(avg * 100);
            td.textContent = pct + '%';
            td.style.background = scoreColor(pct);
            td.style.color = textColor(pct);
            td.addEventListener('click', () => showDetail(model, cat, tier, runtime));
          }}
          row.appendChild(td);
        }});

        tbody.appendChild(row);

        // Add separator after last tier row for each model
        if (tierIdx === allTiers.length - 1) {{
          const sep = document.createElement('tr');
          sep.className = 'model-separator';
          tbody.appendChild(sep);
        }}
      }});
    }});
    table.appendChild(tbody);
    return table;
  }}

  function renderAllHeatmaps() {{
    const container = document.getElementById('heatmaps');
    container.innerHTML = '';

    const row = document.createElement('div');
    row.className = 'heatmaps-row';

    runtimes.forEach((rt, idx) => {{
      const panel = document.createElement('div');
      panel.className = 'heatmap-panel';
      const heading = document.createElement('h3');
      heading.textContent = rt;
      panel.appendChild(heading);
      const table = buildHeatmapTable(rt, idx === 0);
      if (table) panel.appendChild(table);
      row.appendChild(panel);
    }});

    container.appendChild(row);
  }}

  function showDetail(model, category, tier, runtime) {{
    const panel = document.getElementById('detail-panel');
    const matches = DATA.filter(d => d.model === model && d.runtime === runtime && d.tier === tier && d.category === category);
    if (matches.length === 0) {{
      panel.innerHTML = '<div class="detail-placeholder">No data for this combination</div>';
      return;
    }}

    // Group by style
    const byStyle = {{}};
    matches.forEach(d => {{
      if (!byStyle[d.style]) byStyle[d.style] = [];
      byStyle[d.style].push(d);
    }});
    const styles = Object.keys(byStyle).sort();

    let html = '<div class="detail-title">' + model + ' &mdash; ' + category + ' &mdash; Tier ' + tier + ' &mdash; ' + runtime + '</div>';

    // Bar chart by style
    html += '<div class="bar-chart">';
    styles.forEach(style => {{
      const items = byStyle[style];
      const avg = items.reduce((s, d) => s + d.score, 0) / items.length;
      const pct = Math.round(avg * 100);
      const bg = scoreColor(pct);
      const fg = textColor(pct);
      html += '<div class="bar-row">';
      html += '<div class="bar-label">' + (style || 'default') + '</div>';
      html += '<div class="bar-track"><div class="bar-fill" style="width:' + Math.max(pct, 2) + '%;background:' + bg + ';color:' + fg + ';">' + pct + '%</div></div>';
      html += '</div>';
    }});
    html += '</div>';

    // Individual prompt results
    html += '<div class="prompt-results"><h4>Individual Results</h4>';
    matches.forEach(d => {{
      const pct = Math.round(d.score * 100);
      html += '<div class="prompt-result-row">';
      html += '<div class="prompt-result-name">' + escapeHtml(d.prompt_name) + '</div>';
      html += '<div class="prompt-result-score" style="color:' + scoreColor(pct) + '">' + pct + '%</div>';
      html += '<div class="prompt-result-details">' + escapeHtml(d.score_details) + '</div>';
      html += '</div>';
      if (d.prompt_text) {{
        html += '<div class="prompt-result-prompt">' + escapeHtml(d.prompt_text) + '</div>';
      }}
      if (d.output) {{
        html += '<div class="prompt-result-output">' + escapeHtml(d.output) + '</div>';
      }}
    }});
    html += '</div>';

    panel.innerHTML = html;
  }}

  function escapeHtml(s) {{
    const div = document.createElement('div');
    div.textContent = s || '';
    return div.innerHTML;
  }}

  // Initial render
  renderAllHeatmaps();
}})();
</script>
</body>
</html>"""

    html_path = output_dir / f"benchmark-{timestamp}.html"
    with open(html_path, "w") as f:
        f.write(html)

    print(f"  {html_path}")

    return html_path


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

    # Build a unique key for each prompt (name alone is not unique across tiers/styles)
    def prompt_key(p: dict) -> str:
        return f"{p['name']}__t{p.get('tier', 0)}_{p.get('style', 'default')}"

    # Tag each prompt with its key for result matching
    for p in prompts:
        p["_key"] = prompt_key(p)
    prompt_lookup = {p["_key"]: p for p in prompts}

    # Group prompts by tier and category
    from collections import defaultdict
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
                # Load cached results for this model+runtime
                existing = load_existing_results(model_cfg["name"], runtime)

                for tier_num in tier_order:
                    tier_prompts = tiers[tier_num]
                    if not tier_prompts:
                        continue

                    print(f"\n  ── Tier {tier_num} ({len(tier_prompts)} prompts) ──", flush=True)

                    for pcfg in tier_prompts:
                        # Check cache before running
                        p_hash = compute_prompt_hash(pcfg)
                        e_hash = compute_eval_hash(pcfg)
                        cached = existing.get(pcfg["_key"])

                        if cached and cached.prompt_hash == p_hash:
                            if cached.eval_hash == e_hash:
                                # Fully cached — prompt and eval unchanged
                                print(f"  [cached] {pcfg['_key']}")
                                results.append(cached)
                                continue
                            else:
                                # Prompt unchanged, eval criteria changed — re-score existing output
                                print(f"  [re-scoring] {pcfg['_key']}")
                                r = cached
                                r.score = None
                                r.score_details = ""
                                score_result(r, pcfg)
                                r.eval_hash = e_hash
                                r.challenge_hash = compute_challenge_hash(pcfg)
                                print_result_summary(r)
                                results.append(r)
                                append_result(r)
                                continue

                        # Prompt changed or no cache — run the model
                        if runtime == "llamacpp":
                            r = run_llamacpp_prompt(model_cfg, pcfg, args.max_tokens)
                        elif runtime == "mlx":
                            r = run_mlx_prompt(mlx_proc, model_cfg, pcfg, args.max_tokens)

                        r.prompt_name = pcfg["_key"]
                        score_result(r, pcfg)
                        r.prompt_hash = p_hash
                        r.eval_hash = e_hash
                        r.challenge_hash = compute_challenge_hash(pcfg)
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
        # HTML report uses all cached execution data, not just this run
        all_cached = load_all_results()
        save_html_report(all_cached, RESULTS_DIR, prompts)


if __name__ == "__main__":
    main()
