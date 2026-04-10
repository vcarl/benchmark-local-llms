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
    Scenario,
    compute_scenario_hash,
    get_quant_label,
)
from game_session import run_game_session, GameSessionResult
from game_scorers import score_game, ScorerNotFound

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


_THINK_RE = re.compile(r"^.*?</think>\s*", re.DOTALL)
_HARMONY_FINAL_RE = re.compile(
    r"<\|channel\|>\s*final\s*<\|message\|>(.*?)(?:<\|end\|>|<\|return\|>|\Z)",
    re.DOTALL,
)
_HARMONY_TOKEN_RE = re.compile(r"<\|[^|]*\|>")


# ── Scoring ────────────────────────────────────────────────────────────────

def _strip_thinking_tags(text: str) -> str:
    """Strip reasoning/meta tokens so scorers see only the final answer.

    Handles:
      - <think>...</think> blocks (DeepSeek R1 style)
      - gpt-oss harmony channels: extracts content inside
        <|channel|>final<|message|>...<|end|>, then removes any stray
        <|...|> control tokens.
    """
    m = _HARMONY_FINAL_RE.search(text)
    if m:
        text = m.group(1)
    text = _HARMONY_TOKEN_RE.sub("", text)
    return _THINK_RE.sub("", text).strip()


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

    # Strip thinking tokens for scoring without mutating the stored output
    clean_output = _strip_thinking_tags(result.output)

    if scorer == "game":
        _score_game(result, prompt_cfg)
        return

    if scorer == "exact_match":
        _score_exact_match(result, prompt_cfg, clean_output)
    elif scorer == "constraint":
        _score_constraints(result, prompt_cfg, clean_output)
    elif scorer == "code_exec":
        _score_code_exec(result, prompt_cfg, clean_output)


def score_results(results: list[BenchmarkResult], prompts: list[dict]) -> None:
    """Score all results in-place using current prompt configs."""
    prompt_lookup = {p["_key"]: p for p in prompts}
    for r in results:
        pcfg = prompt_lookup.get(r.prompt_name)
        if pcfg:
            score_result(r, pcfg)


def _score_exact_match(result: BenchmarkResult, prompt_cfg: dict, output: str) -> None:
    expected = prompt_cfg["expected"]
    pattern = prompt_cfg["extract"]

    matches = re.findall(pattern, output)
    if not matches:
        result.score = 0.0
        result.score_details = f"no match for pattern in output"
        return

    # Use the last match — models often show work before the final answer
    extracted = matches[-1].replace(",", "")  # strip commas from numbers
    if extracted == expected:
        result.score = 1.0
        result.score_details = f"correct: {extracted}"
    else:
        result.score = 0.0
        result.score_details = f"expected {expected}, got {extracted}"


def _score_constraints(result: BenchmarkResult, prompt_cfg: dict, output: str) -> None:
    constraints = prompt_cfg["constraints"]
    passed = []
    failed = []

    for name, check_fn in constraints:
        try:
            if check_fn(output):
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


def _score_code_exec(result: BenchmarkResult, prompt_cfg: dict, output: str) -> None:
    code = extract_code(output)
    test_code = prompt_cfg["test_code"]
    passed, details = run_code_with_tests(code, test_code)
    result.score = 1.0 if passed else 0.0
    result.score_details = details


def _score_game(result: BenchmarkResult, prompt_cfg: dict) -> None:
    session: Optional[GameSessionResult] = getattr(result, "_game_session", None)
    if session is None:
        result.score = 0.0
        result.score_details = "no game session attached"
        return
    try:
        score, details = score_game(
            prompt_cfg["game_scorer"],
            session,
            prompt_cfg.get("scorer_params", {}),
        )
    except ScorerNotFound as e:
        result.score = 0.0
        result.score_details = str(e)
        return
    result.score = score
    result.score_details = details


# ── Cache checking ─────────────────────────────────────────────────────────

def is_llamacpp_cached(model_cfg: dict) -> bool:
    """Check if a llama.cpp model is already downloaded in the cache.

    Checks two locations:
    1. ~/Library/Caches/llama.cpp/ — where llama-server/-cli -hf downloads to
    2. ~/.cache/huggingface/hub/ — where hf_hub_download() stores files
    """
    repo = model_cfg["llamacpp_hf"]
    quant = model_cfg["llamacpp_quant"].lower()

    # Location 1: llama.cpp native cache
    # Files named like: bartowski_DeepSeek-R1-Distill-Qwen-7B-GGUF_<quant>.gguf
    if LLAMA_CACHE_DIR.exists():
        prefix = repo.replace("/", "_")
        for f in LLAMA_CACHE_DIR.iterdir():
            if f.name.startswith(prefix) and quant in f.name.lower() and f.suffix == ".gguf":
                return True

    # Location 2: HuggingFace hub cache (used by hf_hub_download)
    # Structure: ~/.cache/huggingface/hub/models--{org}--{repo}/snapshots/<hash>/<file>.gguf
    hf_cache = Path.home() / ".cache" / "huggingface" / "hub"
    if hf_cache.exists():
        cache_dir_name = "models--" + repo.replace("/", "--")
        model_cache = hf_cache / cache_dir_name
        if model_cache.exists():
            for f in model_cache.rglob("*.gguf"):
                if quant in f.name.lower():
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


def start_llamacpp_server(model_cfg: dict, ctx_size_override: Optional[int] = None) -> Optional[subprocess.Popen]:
    """Start llama-server and wait until ready. Returns the process or None on failure.

    Server output is tee'd to /tmp/testbench-llamacpp.log so we can inspect
    request-level errors (e.g. 400s from malformed bodies) after the fact.

    Respects model config keys:
      - ctx_size: context window size (default: server default)
    ctx_size_override takes precedence over model config if provided.
    """
    hf_spec = f"{model_cfg['llamacpp_hf']}:{model_cfg['llamacpp_quant']}"
    server_cmd = [
        str(LLAMA_SERVER),
        "-hf", hf_spec,
        "--host", "127.0.0.1",
        "--port", str(LLAMACPP_PORT),
        "--verbose",  # log request bodies/headers to diagnose 400s from commander
        "--cache-type-k", "q8_0",
        "--cache-type-v", "q8_0",
    ]
    ctx_size = ctx_size_override if ctx_size_override is not None else model_cfg.get("ctx_size")
    if ctx_size is not None:
        server_cmd.extend(["-c", str(ctx_size)])

    log_path = Path("/tmp/testbench-llamacpp.log")
    print(f"    Starting llama-server for {model_cfg['name']}... (logs: {log_path})", flush=True)
    log_fh = open(log_path, "w")
    proc = subprocess.Popen(server_cmd, stdout=log_fh, stderr=subprocess.STDOUT)
    proc._log_fh = log_fh  # keep handle alive; closed by stop_llamacpp_server

    if _wait_for_server(LLAMACPP_PORT):
        print(f"    Server ready.", flush=True)
        return proc
    else:
        try:
            with open(log_path) as f:
                tail = f.read()[-400:]
        except OSError:
            tail = ""
        print(f"    Server failed to start. Tail of {log_path}:\n{tail}", flush=True)
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
    log_fh = getattr(proc, "_log_fh", None)
    if log_fh is not None:
        try:
            log_fh.close()
        except Exception:
            pass


def run_llamacpp_prompt(model_cfg: dict, prompt_cfg: dict,
                        max_tokens: int) -> BenchmarkResult:
    """Run a single prompt against an already-running llama-server."""
    result = BenchmarkResult(
        model=model_cfg["name"],
        runtime="llamacpp",
        quant=get_quant_label(model_cfg, "llamacpp"),
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


def run_game_scenario(
    model_cfg: dict,
    scenario: Scenario,
    commander_model_string: str,
    scenario_md_path: str,
    llm_base_url: str,
    runtime: str = "llamacpp",
) -> BenchmarkResult:
    """Run a SpaceMolt scenario against the already-running llama-server.

    Returns a BenchmarkResult with both the standard fields and the new
    scenario-specific fields. The score is NOT computed here — call
    score_result() afterward, which will dispatch to the game scorer.
    """
    result = BenchmarkResult(
        model=model_cfg["name"],
        runtime=runtime,
        quant=get_quant_label(model_cfg, runtime),
        prompt_name=scenario.name,
    )
    result.scenario_name = scenario.name
    result.scenario_hash = compute_scenario_hash(scenario)

    session = run_game_session(
        scenario=scenario,
        model_name=model_cfg["name"],
        commander_model_string=commander_model_string,
        scenario_path=scenario_md_path,
        llm_base_url=llm_base_url,
    )

    result.wall_time_sec = session.elapsed_sec
    result.termination_reason = session.termination_reason
    result.tool_call_count = session.tool_call_count
    result.generation_tokens = session.total_tokens
    result.final_state_summary = session.final_player_stats
    if session.error:
        result.error = session.error

    result._game_session = session  # type: ignore[attr-defined]
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


# ── MLX HTTP server (for game scenarios — commander needs HTTP) ────────────

MLX_SERVER_PORT = 18081


def start_mlx_server(model_cfg: dict) -> Optional[subprocess.Popen]:
    """Start `python -m mlx_lm.server` and wait until ready. Returns process or None.

    This is separate from the stdin/stdout MLX subprocess used for prompts.
    Game scenarios need an HTTP endpoint for commander to talk to.
    """
    if not model_cfg.get("mlx_model"):
        print(f"    No MLX model available for {model_cfg['name']}.", flush=True)
        return None

    print(f"    Starting mlx_lm.server for {model_cfg['name']}...", flush=True)
    proc = subprocess.Popen(
        [
            sys.executable, "-m", "mlx_lm.server",
            "--model", model_cfg["mlx_model"],
            "--host", "127.0.0.1",
            "--port", str(MLX_SERVER_PORT),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )

    if _wait_for_server(MLX_SERVER_PORT, timeout=600):
        print(f"    MLX server ready.", flush=True)
        return proc
    else:
        stderr = proc.stderr.read().decode() if proc.stderr else ""
        print(f"    MLX server failed to start: {stderr[-300:]}", flush=True)
        proc.kill()
        proc.wait()
        return None


def stop_mlx_server(proc: subprocess.Popen) -> None:
    """Stop a running mlx_lm.server."""
    print(f"    Stopping MLX server...", flush=True)
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()


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
        quant=get_quant_label(model_cfg, "mlx"),
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


def _fetch_llamacpp_files(model_cfg: dict) -> bool:
    """Pure file fetch for a llama.cpp GGUF (no model load). Returns True on success."""
    from huggingface_hub import list_repo_files, hf_hub_download
    repo = model_cfg["llamacpp_hf"]
    quant = model_cfg["llamacpp_quant"].lower()
    try:
        all_files = list_repo_files(repo)
        gguf_files = [f for f in all_files
                      if f.endswith(".gguf") and quant in f.lower()]
        if not gguf_files:
            print(f"    No GGUF files matching quant '{quant}' in {repo}")
            print(f"    Available: {[f for f in all_files if f.endswith('.gguf')]}")
            return False
        print(f"    Downloading {len(gguf_files)} file(s):", flush=True)
        for i, fname in enumerate(gguf_files, 1):
            print(f"    [{i}/{len(gguf_files)}] {fname}", flush=True)
            hf_hub_download(repo_id=repo, filename=fname)
        return True
    except Exception as e:
        print(f"    [fetch fail] llamacpp {repo}: {e}")
        return False


def _fetch_mlx_files(model_cfg: dict) -> bool:
    """Pure file fetch for an MLX repo (no model load). Returns True on success."""
    from huggingface_hub import snapshot_download
    model_id = model_cfg.get("mlx_model")
    if not model_id:
        return False
    try:
        print(f"    Downloading {model_id}...", flush=True)
        snapshot_download(repo_id=model_id)
        return True
    except Exception as e:
        print(f"    [fetch fail] mlx {model_id}: {e}")
        return False


def download_models(models: list[dict], runtimes: list[str], max_workers: int = 4):
    """Download models serially with clear progress, then verify.

    Downloads run one at a time so progress bars don't collide. Each model
    shows a clear header, download progress, and result before moving on.
    """
    # Inventory: what needs downloading vs what's already cached
    to_fetch: list[tuple[dict, str]] = []
    cached: list[tuple[str, str]] = []
    skipped: list[tuple[str, str]] = []

    for model_cfg in models:
        for runtime in runtimes:
            if runtime == "llamacpp":
                if is_llamacpp_cached(model_cfg):
                    cached.append((model_cfg["name"], runtime))
                else:
                    to_fetch.append((model_cfg, runtime))
            elif runtime == "mlx":
                if not model_cfg.get("mlx_model"):
                    skipped.append((model_cfg["name"], runtime))
                elif is_mlx_cached(model_cfg):
                    cached.append((model_cfg["name"], runtime))
                else:
                    to_fetch.append((model_cfg, runtime))

    total = len(cached) + len(to_fetch) + len(skipped)

    print(f"Download plan: {len(to_fetch)} to fetch, {len(cached)} cached, {len(skipped)} skipped (no model)")
    print()

    if cached:
        print(f"Already cached ({len(cached)}):")
        for name, rt in cached:
            print(f"  [cached] {name} / {rt}")
        print()

    if not to_fetch:
        print("Nothing to download.")
        return

    # Download one at a time — clear output per model
    print(f"Downloading ({len(to_fetch)}):")
    print()
    fetch_failed: set[tuple[str, str]] = set()
    for i, (model_cfg, runtime) in enumerate(to_fetch, 1):
        name = model_cfg["name"]
        print(f"  [{i}/{len(to_fetch)}] {name} / {runtime}")
        fn = _fetch_llamacpp_files if runtime == "llamacpp" else _fetch_mlx_files
        ok = fn(model_cfg)
        if ok:
            print(f"  [{i}/{len(to_fetch)}] {name} / {runtime} — OK")
        else:
            print(f"  [{i}/{len(to_fetch)}] {name} / {runtime} — FAILED")
            fetch_failed.add((name, runtime))
        print()

    # Summary
    succeeded = len(to_fetch) - len(fetch_failed)
    print(f"Downloads: {succeeded}/{len(to_fetch)} succeeded", end="")
    if fetch_failed:
        print(f", {len(fetch_failed)} failed:")
        for name, rt in sorted(fetch_failed):
            print(f"  {name} / {rt}")
    else:
        print()
