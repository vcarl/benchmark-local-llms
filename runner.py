"""
Execution, scoring, caching, and model management for the benchmark suite.

This module contains functions for:
- Code extraction and execution (extract_code, run_code_with_tests)
- Scoring (score_result, _score_exact_match, _score_constraints, _score_code_exec)
- Cache checking (is_llamacpp_cached, is_mlx_cached)
- Server/runtime management (llama.cpp server, MLX subprocess)
- Model downloading (download_llamacpp_model, download_mlx_model, download_models)
"""

import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional

from common import (
    LLAMA_CLI, LLAMA_SERVER, LLAMA_CACHE_DIR,
    BenchmarkResult,
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
