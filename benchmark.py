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
import hashlib
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
        "name": "Qwen 2.5 Coder 32B Instruct",
        "size_class": "small",
        "llamacpp_hf": "Qwen/Qwen2.5-Coder-32B-Instruct-GGUF",
        "llamacpp_quant": "Q4_K_M",
        "mlx_model": "mlx-community/Qwen2.5-Coder-32B-Instruct-4bit",
    },
    {
        "name": "QwQ 32B",
        "size_class": "small",
        "llamacpp_hf": "Qwen/QwQ-32B-GGUF",
        "llamacpp_quant": "Q4_K_M",
        "mlx_model": "mlx-community/QwQ-32B-4bit",
    },
    {
        "name": "Qwen 3 32B",
        "size_class": "small",
        "llamacpp_hf": "Qwen/Qwen3-32B-GGUF",
        "llamacpp_quant": "Q4_K_M",
        "mlx_model": "mlx-community/Qwen3-32B-4bit",
    },
    {
        "name": "Qwen 3.5 9B",
        "size_class": "small",
        "llamacpp_hf": "unsloth/Qwen3.5-9B-GGUF",
        "llamacpp_quant": "Q4_K_M",
        "mlx_model": "mlx-community/Qwen3.5-9B-4bit",
    },
    {
        "name": "Qwen 3.5 27B",
        "size_class": "small",
        "llamacpp_hf": "unsloth/Qwen3.5-27B-GGUF",
        "llamacpp_quant": "Q4_K_M",
        "mlx_model": "mlx-community/Qwen3.5-27B-4bit",
    },
    {
        "name": "Qwen 3.5 35B-A3B (MoE)",
        "size_class": "small",
        "llamacpp_hf": "unsloth/Qwen3.5-35B-A3B-GGUF",
        "llamacpp_quant": "Q4_K_M",
        "mlx_model": "mlx-community/Qwen3.5-35B-A3B-4bit",
    },
    {
        "name": "Qwen 3 Coder 30B-A3B Instruct (MoE)",
        "size_class": "small",
        "llamacpp_hf": "unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF",
        "llamacpp_quant": "Q4_K_M",
        "mlx_model": "mlx-community/Qwen3-Coder-30B-A3B-Instruct-4bit",
    },
    {
        "name": "Qwen 3 Coder Next 80B-A3B (MoE)",
        "size_class": "large",
        "llamacpp_hf": "Qwen/Qwen3-Coder-Next-GGUF",
        "llamacpp_quant": "Q4_K_M",
        "mlx_model": "mlx-community/Qwen3-Coder-Next-4bit",
    },
    # {
    #     "name": "Command-R+ 104B",
    #     "size_class": "xlarge",
    #     "llamacpp_hf": "bartowski/c4ai-command-r-plus-GGUF",
    #     "llamacpp_quant": "Q4_K_M",
    #     "mlx_model": "mlx-community/c4ai-command-r-plus-4bit",
    # },
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
        "mlx_model": "zachlandes/Mistral-Large-Instruct-2411-Q4-MLX",
    },
    {
        "name": "Mistral Small 4 119B (MoE)",
        "size_class": "xlarge",
        "llamacpp_hf": "unsloth/Mistral-Small-4-119B-2603-GGUF",
        "llamacpp_quant": "Q4_K_M",
        "mlx_model": None,  # No MLX conversion available yet (released Mar 2026)
    },
    {
        "name": "Devstral 2 123B",
        "size_class": "xlarge",
        "llamacpp_hf": "unsloth/Devstral-2-123B-Instruct-2512-GGUF",
        "llamacpp_quant": "Q4_K_M",
        "mlx_model": "mlx-community/Devstral-2-123B-Instruct-2512-4bit",
    },
    {
        "name": "Mistral Small 3.2 24B",
        "size_class": "small",
        "llamacpp_hf": "bartowski/mistralai_Mistral-Small-3.2-24B-Instruct-2506-GGUF",
        "llamacpp_quant": "Q4_K_M",
        "mlx_model": "mlx-community/Mistral-Small-3.2-24B-Instruct-2506-4bit",
    },
    {
        "name": "Magistral Small 1.2 24B",
        "size_class": "small",
        "llamacpp_hf": "mistralai/Magistral-Small-2509-GGUF",
        "llamacpp_quant": "Q4_K_M",
        "mlx_model": "lmstudio-community/Magistral-Small-2509-MLX-4bit",
    },
    {
        "name": "Devstral Small 2 24B",
        "size_class": "small",
        "llamacpp_hf": "unsloth/Devstral-Small-2-24B-Instruct-2512-GGUF",
        "llamacpp_quant": "Q4_K_M",
        "mlx_model": "mlx-community/Devstral-Small-2-24B-Instruct-2512-4bit",
    },
    {
        "name": "Llama 3.1 8B Instruct",
        "size_class": "small",
        "llamacpp_hf": "bartowski/Meta-Llama-3.1-8B-Instruct-GGUF",
        "llamacpp_quant": "Q4_K_M",
        "mlx_model": "mlx-community/Meta-Llama-3.1-8B-Instruct-4bit",
    },
    {
        "name": "DeepSeek R1 Distill Qwen 7B",
        "size_class": "small",
        "llamacpp_hf": "bartowski/DeepSeek-R1-Distill-Qwen-7B-GGUF",
        "llamacpp_quant": "Q4_K_M",
        "mlx_model": "mlx-community/DeepSeek-R1-Distill-Qwen-7B-4bit",
    },
    {
        "name": "DeepSeek R1 Distill Qwen 14B",
        "size_class": "small",
        "llamacpp_hf": "bartowski/DeepSeek-R1-Distill-Qwen-14B-GGUF",
        "llamacpp_quant": "Q4_K_M",
        "mlx_model": "mlx-community/DeepSeek-R1-Distill-Qwen-14B-4bit",
    },
    {
        "name": "DeepSeek R1 Distill Qwen 32B",
        "size_class": "small",
        "llamacpp_hf": "bartowski/DeepSeek-R1-Distill-Qwen-32B-GGUF",
        "llamacpp_quant": "Q4_K_M",
        "mlx_model": "mlx-community/DeepSeek-R1-Distill-Qwen-32B-4bit",
    },
    {
        "name": "DeepSeek R1-0528 Qwen3 8B",
        "size_class": "small",
        "llamacpp_hf": "unsloth/DeepSeek-R1-0528-Qwen3-8B-GGUF",
        "llamacpp_quant": "Q4_K_M",
        "mlx_model": "mlx-community/DeepSeek-R1-0528-Qwen3-8B-4bit",
    },
    {
        "name": "DeepSeek Coder V2 Lite 16B (MoE)",
        "size_class": "small",
        "llamacpp_hf": "bartowski/DeepSeek-Coder-V2-Lite-Instruct-GGUF",
        "llamacpp_quant": "Q4_K_M",
        "mlx_model": "mlx-community/DeepSeek-Coder-V2-Lite-Instruct-4bit",
    },
    {
        "name": "DeepSeek Coder 33B Instruct",
        "size_class": "small",
        "llamacpp_hf": "bartowski/deepseek-coder-33b-instruct-GGUF",
        "llamacpp_quant": "Q4_K_M",
        "mlx_model": "mlx-community/deepseek-coder-33b-instruct-4bit",
    },
    {
        "name": "DeepSeek R1 Distill Llama 70B",
        "size_class": "large",
        "llamacpp_hf": "bartowski/DeepSeek-R1-Distill-Llama-70B-GGUF",
        "llamacpp_quant": "Q4_K_M",
        "mlx_model": "mlx-community/DeepSeek-R1-Distill-Llama-70B-4bit",
    },
    # {
    #     "name": "DeepSeek R1 671B (MoE, 1.58-bit)",
    #     "size_class": "xlarge",
    #     "llamacpp_hf": "unsloth/DeepSeek-R1-GGUF",
    #     "llamacpp_quant": "UD-IQ1_M",
    #     "mlx_model": "mlx-community/DeepSeek-R1-3bit",
    # },
]

# ── System prompts by style ────────────────────────────────────────────────

SYSTEM_PROMPTS = {
    "direct": "You are a helpful assistant. Be concise. Answer with just the answer unless told otherwise.",
    "cot": "You are a helpful assistant. Think step by step to solve problems. Write your final answer on its own line at the end, prefixed with 'ANSWER:'.",
    "structured": "You are a helpful assistant. Always respond in the exact format requested. No extra text.",
    "few_shot": "You are a helpful assistant. Follow the pattern shown in the examples.",
    "noisy": "You are a helpful assistant. Focus on the core question and ignore irrelevant details. Be concise.",
    "adversarial": "You are a helpful assistant. Read carefully — some questions are tricky. Be concise. Answer with just the answer.",
    "code_direct": (
        "You are a Python code generator. Output ONLY the requested function. "
        "No explanations, no examples, no tests, no markdown, no commentary. "
        "Start directly with 'def '."
    ),
    "code_tdd": (
        "You are a Python developer practicing TDD. Given the test cases below, "
        "write the function that makes all tests pass. Output ONLY the function, "
        "no tests, no markdown, no commentary."
    ),
    "code_bugfix": (
        "You are a code reviewer. Fix the bug in the function below. "
        "Output ONLY the corrected function, no explanations, no markdown."
    ),
    "code_docstring": (
        "You are a Python code generator. Complete the function body based on "
        "the docstring. Output ONLY the complete function including the def line "
        "and docstring. No markdown, no commentary."
    ),
}

# Tier gate thresholds — minimum pass rate to advance to next tier
TIER_1_GATE = 0.70  # need 70% on tier 1 to attempt tier 2
TIER_2_GATE = 0.50  # need 50% cumulative on tier 1+2 to attempt tier 3

PROMPTS_DIR = Path(__file__).parent / "prompts"

# ── Constraint DSL evaluator ────────────────────────────────────────────────

def _try_parse_json(text: str):
    """Try to extract and parse JSON from text."""
    try:
        return json.loads(text.strip())
    except (json.JSONDecodeError, ValueError):
        pass
    match = re.search(r"\{[^{}]*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except (json.JSONDecodeError, ValueError):
            pass
    return None


def evaluate_constraint(output: str, constraint: dict) -> bool:
    """Evaluate a single constraint from YAML against the output."""
    check = constraint["check"]
    o = output

    if check == "contains":
        return constraint["value"].lower() in o.lower()
    elif check == "contains_exact":
        return constraint["value"] in o
    elif check == "not_contains_char":
        return constraint["char"].lower() not in o.lower()
    elif check == "min_length":
        return len(o.strip()) > constraint["length"]
    elif check == "regex":
        flags = re.DOTALL if constraint.get("dotall") else 0
        return bool(re.search(constraint["pattern"], o, flags))
    elif check == "regex_count_min":
        return len(re.findall(constraint["pattern"], o)) >= constraint["min"]
    elif check == "valid_json":
        return _try_parse_json(o) is not None
    elif check == "json_has_keys":
        obj = _try_parse_json(o)
        return isinstance(obj, dict) and all(k in obj for k in constraint["keys"])
    elif check == "json_all_string_values":
        obj = _try_parse_json(o)
        return isinstance(obj, dict) and all(isinstance(v, str) for v in obj.values())
    elif check == "json_nested_is_object":
        obj = _try_parse_json(o)
        return isinstance(obj, dict) and isinstance(obj.get(constraint["key"]), dict)
    elif check == "json_nested_has_key":
        obj = _try_parse_json(o)
        parent = (obj or {}).get(constraint["parent"])
        return isinstance(parent, dict) and constraint["key"] in parent
    elif check == "json_field_equals":
        obj = _try_parse_json(o)
        return isinstance(obj, dict) and obj.get(constraint["key"]) == constraint["value"]
    elif check == "json_field_is_list":
        obj = _try_parse_json(o)
        return isinstance(obj, dict) and isinstance(obj.get(constraint["key"]), list)
    elif check == "json_list_item_has":
        obj = _try_parse_json(o)
        if not isinstance(obj, dict):
            return False
        items = obj.get(constraint["list_key"], [])
        return any(
            isinstance(item, dict)
            and item.get(constraint["match_field"]) == constraint["match_value"]
            and item.get(constraint["check_field"]) == constraint["check_value"]
            for item in items
        )
    elif check == "numbered_lines":
        return (bool(re.search(rf"^{constraint['from']}[.):\s]", o, re.MULTILINE)) and
                bool(re.search(rf"^{constraint['to']}[.):\s]", o, re.MULTILINE)))
    elif check == "no_numbered_line":
        return not re.search(rf"^{constraint['line']}[.):\s]", o, re.MULTILINE)
    elif check == "numbered_line_exists":
        return bool(re.search(rf"^{constraint['line']}[.):\s]", o, re.MULTILINE))
    elif check == "line_count":
        lines = [l for l in o.strip().splitlines() if l.strip()]
        return len(lines) == constraint["count"]
    elif check == "word_count_exact":
        return o.lower().split().count(constraint["word"]) == constraint["count"]
    elif check == "all_lines_word_count":
        lines = [l for l in o.strip().splitlines() if l.strip()]
        return all(constraint["min"] <= len(l.split()) <= constraint["max"] for l in lines)
    else:
        raise ValueError(f"Unknown constraint check: {check}")


# ── YAML prompt loader ────────────────────────────────────────────────────

def load_prompts(prompts_dir: Path = PROMPTS_DIR) -> list[dict]:
    """Load all prompt YAML files from the prompts directory."""
    import yaml
    prompts = []
    for yaml_file in sorted(prompts_dir.glob("*.yaml")):
        with open(yaml_file) as f:
            entries = yaml.safe_load(f)
        if not entries:
            continue
        for p in entries:
            # Resolve system prompt name to actual text
            system_key = p.get("system", "direct")
            p["system"] = SYSTEM_PROMPTS.get(system_key, system_key)
            # Set category from filename if not specified
            if "category" not in p:
                p["category"] = yaml_file.stem
            # Convert YAML constraint dicts to (name, check_fn) tuples
            if p.get("scorer") == "constraint" and "constraints" in p:
                p["constraints"] = [
                    (c["name"], lambda o, c=c: evaluate_constraint(o, c))
                    for c in p["constraints"]
                ]
            prompts.append(p)
    return prompts


PROMPTS = load_prompts()


# ── Legacy aliases (keep old code working) ─────────────────────────────────
# These were previously used directly in lambda constraints
def _json_has_keys(text, keys):
    obj = _try_parse_json(text)
    return isinstance(obj, dict) and all(k in obj for k in keys)

def _json_all_string_values(text):
    obj = _try_parse_json(text)
    return isinstance(obj, dict) and all(isinstance(v, str) for v in obj.values())

def _count_sentences(text):
    sentences = re.split(r'[.!?]+', text.strip())
    return len([s for s in sentences if s.strip()])


# ══════════════════════════════════════════════════════════════════════════
# NOTE: Prompts are now loaded from YAML files in the prompts/ directory.
# To add or modify challenges, edit the YAML files directly:
#   prompts/math.yaml
#   prompts/factual.yaml
#   prompts/logic.yaml
#   prompts/constraint.yaml
#   prompts/code.yaml
# ══════════════════════════════════════════════════════════════════════════


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
    category: str = ""
    tier: int = 0
    style: str = ""
    prompt_text: str = ""  # the actual prompt sent to the model
    expected: str = ""  # expected answer (if any)
    score: Optional[float] = None  # 0.0-1.0, None if not scored
    score_details: str = ""  # human-readable scoring breakdown
    challenge_hash: str = ""  # hash of challenge-defining fields for cache validation


# ── Challenge hashing and result caching ───────────────────────────────────

def compute_challenge_hash(prompt_cfg: dict) -> str:
    """Compute a SHA256 hex digest (first 12 chars) of challenge-defining fields."""
    parts = [
        prompt_cfg["prompt"],
        prompt_cfg["system"],
        prompt_cfg.get("expected", ""),
        prompt_cfg.get("scorer", ""),
        prompt_cfg.get("test_code", ""),
        str([c[0] for c in prompt_cfg.get("constraints", [])]),
    ]
    blob = "|".join(parts).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()[:12]


def model_slug(name: str) -> str:
    """Convert model name to filesystem-safe slug."""
    slug = name.lower()
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    slug = slug.strip('-')
    return slug


def results_file_path(model_name: str, runtime: str, output_dir: Path = RESULTS_DIR) -> Path:
    """Get the JSONL file path for a model+runtime combination."""
    output_dir.mkdir(parents=True, exist_ok=True)
    # Normalize runtime (historical data uses "llama.cpp", code uses "llamacpp")
    runtime_slug = runtime.replace(".", "")
    return output_dir / f"{model_slug(model_name)}__{runtime_slug}.jsonl"


def load_existing_results(model_name: str, runtime: str) -> dict[str, BenchmarkResult]:
    """Load existing results from JSONL, keyed by prompt_name.
    Returns dict mapping prompt_name -> BenchmarkResult (latest entry wins)."""
    path = results_file_path(model_name, runtime)
    results = {}
    if path.exists():
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                d = json.loads(line)
                r = BenchmarkResult(**{k: v for k, v in d.items() if k in BenchmarkResult.__dataclass_fields__})
                results[r.prompt_name] = r
    return results


def append_result(result: BenchmarkResult) -> None:
    """Append a single result to its model+runtime JSONL file."""
    path = results_file_path(result.model, result.runtime)
    with open(path, "a") as f:
        f.write(json.dumps(asdict(result)) + "\n")


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
        runtime="llama.cpp",
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
    args = parser.parse_args()

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

    categories = sorted(set(p.get("category", "") for p in prompts))

    for model_cfg in models:
        for runtime in runtimes:
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

            try:
                # Load cached results for this model+runtime
                existing = load_existing_results(model_cfg["name"], runtime)

                # Track per-category pass rates for tier gating
                cat_scores: dict[str, list[float]] = defaultdict(list)
                skipped_cats: set[str] = set()

                for tier_num in tier_order:
                    tier_prompts = tiers[tier_num]

                    # Gate check: skip categories that failed previous tier
                    if tier_num == 2:
                        for cat in categories:
                            scores = cat_scores.get(cat, [])
                            if scores and (sum(scores) / len(scores)) < TIER_1_GATE:
                                skipped_cats.add(cat)
                                gate = TIER_1_GATE
                                print(f"\n    Skipping tier 2 {cat}: pass rate {sum(scores)/len(scores):.0%} < {gate:.0%}")
                                for p in [p for p in tier_prompts if p.get("category", "") == cat]:
                                    skip_result = BenchmarkResult(
                                        model=model_cfg["name"],
                                        runtime=runtime,
                                        prompt_name=p["_key"],
                                        category=cat,
                                        tier=tier_num,
                                        style=p.get("style", ""),
                                        prompt_text=p.get("prompt", ""),
                                        expected=p.get("expected", ""),
                                        score=None,
                                        score_details=f"skipped: tier {tier_num} gated (pass rate {sum(scores)/len(scores):.0%} < {gate:.0%})",
                                    )
                                    skip_result.challenge_hash = compute_challenge_hash(p)
                                    results.append(skip_result)
                                    # Only write if not already cached
                                    cached = existing.get(p["_key"])
                                    if not (cached and cached.score_details == skip_result.score_details):
                                        append_result(skip_result)
                    elif tier_num == 3:
                        for cat in categories:
                            if cat in skipped_cats:
                                continue
                            scores = cat_scores.get(cat, [])
                            if scores and (sum(scores) / len(scores)) < TIER_2_GATE:
                                skipped_cats.add(cat)
                                gate = TIER_2_GATE
                                print(f"\n    Skipping tier 3 {cat}: pass rate {sum(scores)/len(scores):.0%} < {gate:.0%}")
                                for p in [p for p in tier_prompts if p.get("category", "") == cat]:
                                    skip_result = BenchmarkResult(
                                        model=model_cfg["name"],
                                        runtime=runtime,
                                        prompt_name=p["_key"],
                                        category=cat,
                                        tier=tier_num,
                                        style=p.get("style", ""),
                                        prompt_text=p.get("prompt", ""),
                                        expected=p.get("expected", ""),
                                        score=None,
                                        score_details=f"skipped: tier {tier_num} gated (pass rate {sum(scores)/len(scores):.0%} < {gate:.0%})",
                                    )
                                    skip_result.challenge_hash = compute_challenge_hash(p)
                                    results.append(skip_result)
                                    # Only write if not already cached
                                    cached = existing.get(p["_key"])
                                    if not (cached and cached.score_details == skip_result.score_details):
                                        append_result(skip_result)

                    # Filter to non-skipped prompts for this tier
                    active_prompts = [p for p in tier_prompts if p.get("category", "") not in skipped_cats]
                    if not active_prompts:
                        continue

                    print(f"\n  ── Tier {tier_num} ({len(active_prompts)} prompts) ──", flush=True)

                    for pcfg in active_prompts:
                        # Check cache before running
                        challenge_hash = compute_challenge_hash(pcfg)
                        cached = existing.get(pcfg["_key"])
                        if cached and cached.challenge_hash == challenge_hash:
                            print(f"  [cached] {pcfg['_key']}")
                            results.append(cached)
                            if cached.score is not None:
                                cat_scores[pcfg.get("category", "")].append(cached.score)
                            continue

                        # Run single prompt against the already-loaded model
                        if runtime == "llamacpp":
                            r = run_llamacpp_prompt(model_cfg, pcfg, args.max_tokens)
                        elif runtime == "mlx":
                            r = run_mlx_prompt(mlx_proc, model_cfg, pcfg, args.max_tokens)

                        r.prompt_name = pcfg["_key"]
                        score_result(r, pcfg)
                        r.challenge_hash = challenge_hash
                        print_result_summary(r)
                        results.append(r)
                        append_result(r)

                        if r.score is not None:
                            cat_scores[pcfg.get("category", "")].append(r.score)

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


if __name__ == "__main__":
    main()
