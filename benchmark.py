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
        "name": "Qwen 3 235B-A22B (MoE, 3-bit)",
        "size_class": "xlarge",
        "llamacpp_hf": "Qwen/Qwen3-235B-A22B-GGUF",
        "llamacpp_quant": "Q3_K_M",
        "mlx_model": "mlx-community/Qwen3-235B-A22B-3bit",
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
    # {
    #     "name": "DeepSeek R1 671B (MoE, 1.58-bit)",
    #     "size_class": "xlarge",
    #     "llamacpp_hf": "unsloth/DeepSeek-R1-GGUF",
    #     "llamacpp_quant": "UD-IQ1_M",
    #     "mlx_model": "mlx-community/DeepSeek-R1-3bit",
    # },
]

SYSTEM_GENERAL = "You are a helpful assistant. Be concise. Answer with just the answer unless told otherwise."
SYSTEM_CODE = (
    "You are a Python code generator. Output ONLY the requested function. "
    "No explanations, no examples, no tests, no markdown, no commentary. "
    "Start directly with 'def '."
)

PROMPTS = [
    # ── Math (exact match on extracted number) ─────────────────────────────
    {
        "name": "math_multiply",
        "category": "math",
        "system": SYSTEM_GENERAL,
        "prompt": "What is 47 * 89? Reply with just the number.",
        "scorer": "exact_match",
        "expected": "4183",
        "extract": r"(\d[\d,]*)",
    },
    {
        "name": "math_chain",
        "category": "math",
        "system": SYSTEM_GENERAL,
        "prompt": "Start with 5. Double it. Add 7. Triple the result. What number do you have? Reply with just the number.",
        "scorer": "exact_match",
        "expected": "51",
        "extract": r"(\d+)",
    },
    {
        "name": "math_remainder",
        "category": "math",
        "system": SYSTEM_GENERAL,
        "prompt": "What is the remainder when 2024 is divided by 7? Reply with just the number.",
        "scorer": "exact_match",
        "expected": "1",
        "extract": r"(\d+)",
    },
    {
        "name": "math_word_problem",
        "category": "math",
        "system": SYSTEM_GENERAL,
        "prompt": (
            "A baker makes 4 batches of cookies. Each batch has 36 cookies. "
            "She gives away 1/3 of all the cookies. How many does she have left? "
            "Reply with just the number."
        ),
        "scorer": "exact_match",
        "expected": "96",
        "extract": r"(\d+)",
    },
    {
        "name": "math_primes_sum",
        "category": "math",
        "system": SYSTEM_GENERAL,
        "prompt": "What is the sum of all prime numbers less than 20? Reply with just the number.",
        "scorer": "exact_match",
        "expected": "77",
        "extract": r"(\d+)",
    },
    {
        "name": "math_speed_distance",
        "category": "math",
        "system": SYSTEM_GENERAL,
        "prompt": "A train travels at 60 mph for 2 hours and 30 minutes. How many miles does it cover? Reply with just the number.",
        "scorer": "exact_match",
        "expected": "150",
        "extract": r"(\d+)",
    },
    {
        "name": "math_perimeter",
        "category": "math",
        "system": SYSTEM_GENERAL,
        "prompt": "A rectangle has length 13 and width 7. What is its perimeter? Reply with just the number.",
        "scorer": "exact_match",
        "expected": "40",
        "extract": r"(\d+)",
    },
    {
        "name": "math_compound",
        "category": "math",
        "system": SYSTEM_GENERAL,
        "prompt": (
            "You invest $1000 at 10% annual interest compounded once per year. "
            "How much do you have after 3 years, rounded to the nearest dollar? "
            "Reply with just the number."
        ),
        "scorer": "exact_match",
        "expected": "1331",
        "extract": r"(\d[\d,]*)",
    },

    # ── Factual (exact match) ──────────────────────────────────────────────
    {
        "name": "fact_treaty",
        "category": "factual",
        "system": SYSTEM_GENERAL,
        "prompt": "In what year was the Treaty of Westphalia signed? Reply with just the year.",
        "scorer": "exact_match",
        "expected": "1648",
        "extract": r"(\d{4})",
    },
    {
        "name": "fact_gold",
        "category": "factual",
        "system": SYSTEM_GENERAL,
        "prompt": "What is the chemical symbol for gold? Reply with just the symbol.",
        "scorer": "exact_match",
        "expected": "Au",
        "extract": r"\b([A-Z][a-z]?)\b",
    },
    {
        "name": "fact_chromosomes",
        "category": "factual",
        "system": SYSTEM_GENERAL,
        "prompt": "How many chromosomes do humans have? Reply with just the number.",
        "scorer": "exact_match",
        "expected": "46",
        "extract": r"(\d+)",
    },
    {
        "name": "fact_boiling",
        "category": "factual",
        "system": SYSTEM_GENERAL,
        "prompt": "What is the boiling point of water in degrees Fahrenheit? Reply with just the number.",
        "scorer": "exact_match",
        "expected": "212",
        "extract": r"(\d+)",
    },

    # ── Logic puzzles (exact match) ────────────────────────────────────────
    {
        "name": "logic_sheep",
        "category": "logic",
        "system": SYSTEM_GENERAL,
        "prompt": "A farmer has 17 sheep. All but 9 die. How many sheep are left? Reply with just the number.",
        "scorer": "exact_match",
        "expected": "9",
        "extract": r"(\d+)",
    },
    {
        "name": "logic_widgets",
        "category": "logic",
        "system": SYSTEM_GENERAL,
        "prompt": (
            "If it takes 5 machines 5 minutes to make 5 widgets, "
            "how many minutes does it take 100 machines to make 100 widgets? "
            "Reply with just the number."
        ),
        "scorer": "exact_match",
        "expected": "5",
        "extract": r"(\d+)",
    },
    {
        "name": "logic_bat_ball",
        "category": "logic",
        "system": SYSTEM_GENERAL,
        "prompt": (
            "A bat and a ball cost $1.10 together. "
            "The bat costs $1.00 more than the ball. "
            "How much does the ball cost in cents? Reply with just the number."
        ),
        "scorer": "exact_match",
        "expected": "5",
        "extract": r"(\d+)",
    },

    # ── Constraint following (programmatic verification) ───────────────────
    {
        "name": "constraint_capitals",
        "category": "constraint",
        "system": "You are a helpful assistant. Follow formatting instructions exactly.",
        "prompt": "List exactly 5 US state capitals, one per line, numbered 1 through 5.",
        "scorer": "constraint",
        "constraints": [
            ("has 5 numbered lines", lambda o: bool(re.search(r"^1[.):]\s*\S+", o, re.MULTILINE)) and
                                                bool(re.search(r"^5[.):]\s*\S+", o, re.MULTILINE))),
            ("has no 6th item", lambda o: not re.search(r"^6[.):]\s", o, re.MULTILINE)),
        ],
    },
    {
        "name": "constraint_json",
        "category": "constraint",
        "system": "You are a helpful assistant. Follow formatting instructions exactly.",
        "prompt": 'Output a JSON object with exactly 3 keys: "name", "age", "city". All values must be strings. Output only the JSON, nothing else.',
        "scorer": "constraint",
        "constraints": [
            ("valid JSON", lambda o: _try_parse_json(o) is not None),
            ("has required keys", lambda o: _json_has_keys(o, ["name", "age", "city"])),
            ("all values are strings", lambda o: _json_all_string_values(o)),
        ],
    },
    {
        "name": "constraint_keywords",
        "category": "constraint",
        "system": "You are a helpful assistant. Follow instructions exactly.",
        "prompt": "Write one paragraph about space exploration. You MUST include the words 'rocket', 'orbit', and 'gravity'.",
        "scorer": "constraint",
        "constraints": [
            ("contains 'rocket'", lambda o: "rocket" in o.lower()),
            ("contains 'orbit'", lambda o: "orbit" in o.lower()),
            ("contains 'gravity'", lambda o: "gravity" in o.lower()),
        ],
    },
    {
        "name": "constraint_sentences",
        "category": "constraint",
        "system": "You are a helpful assistant. Follow instructions exactly.",
        "prompt": "Explain what an API is in exactly 2 sentences.",
        "scorer": "constraint",
        "constraints": [
            ("roughly 2 sentences", lambda o: 1 <= _count_sentences(o) <= 3),
        ],
    },
    {
        "name": "constraint_p_languages",
        "category": "constraint",
        "system": SYSTEM_GENERAL,
        "prompt": "Name exactly 3 programming languages that start with the letter P. One per line, no numbering.",
        "scorer": "constraint",
        "constraints": [
            ("has 3 lines with P-languages",
             lambda o: len([l for l in o.strip().splitlines()
                          if l.strip() and l.strip()[0].upper() == 'P']) >= 3),
        ],
    },
    {
        "name": "constraint_no_letter_e",
        "category": "constraint",
        "system": "You are a helpful assistant. Follow instructions exactly.",
        "prompt": "Write a sentence about a cat. The sentence must NOT contain the letter 'e' anywhere.",
        "scorer": "constraint",
        "constraints": [
            ("no letter e", lambda o: "e" not in o.lower() and "E" not in o),
            ("is a sentence", lambda o: len(o.strip()) > 10),
        ],
    },

    # ── Code (execute with tests) ──────────────────────────────────────────
    {
        "name": "code_is_palindrome",
        "category": "code",
        "system": SYSTEM_CODE,
        "prompt": "Write a Python function `is_palindrome(s: str) -> bool` that returns True if the string is a palindrome (case-insensitive, ignoring non-alphanumeric characters).",
        "scorer": "code_exec",
        "test_code": """
assert is_palindrome("racecar") == True
assert is_palindrome("hello") == False
assert is_palindrome("") == True
assert is_palindrome("A man a plan a canal Panama") == True
assert is_palindrome("Was it a car or a cat I saw") == True
assert is_palindrome("No lemon, no melon") == True
assert is_palindrome("abc") == False
""",
    },
    {
        "name": "code_fibonacci",
        "category": "code",
        "system": SYSTEM_CODE,
        "prompt": "Write a Python function `fibonacci(n: int) -> int` that returns the nth Fibonacci number, where fibonacci(0) = 0, fibonacci(1) = 1.",
        "scorer": "code_exec",
        "test_code": """
assert fibonacci(0) == 0
assert fibonacci(1) == 1
assert fibonacci(2) == 1
assert fibonacci(10) == 55
assert fibonacci(20) == 6765
""",
    },
    {
        "name": "code_two_sum",
        "category": "code",
        "system": SYSTEM_CODE,
        "prompt": "Write a Python function `two_sum(nums: list[int], target: int) -> list[int]` that returns the indices of two numbers that add up to target. Each input has exactly one solution.",
        "scorer": "code_exec",
        "test_code": """
result = two_sum([2, 7, 11, 15], 9)
assert sorted(result) == [0, 1]
result = two_sum([3, 2, 4], 6)
assert sorted(result) == [1, 2]
result = two_sum([3, 3], 6)
assert sorted(result) == [0, 1]
""",
    },
    {
        "name": "code_flatten",
        "category": "code",
        "system": SYSTEM_CODE,
        "prompt": "Write a Python function `flatten(lst: list) -> list` that recursively flattens a nested list of arbitrary depth.",
        "scorer": "code_exec",
        "test_code": """
assert flatten([1, [2, 3], [4, [5, 6]]]) == [1, 2, 3, 4, 5, 6]
assert flatten([]) == []
assert flatten([1, 2, 3]) == [1, 2, 3]
assert flatten([[[[1]]]]) == [1]
assert flatten([1, [2, [3, [4, [5]]]]]) == [1, 2, 3, 4, 5]
""",
    },
    {
        "name": "code_caesar_cipher",
        "category": "code",
        "system": SYSTEM_CODE,
        "prompt": "Write a Python function `caesar_cipher(text: str, shift: int) -> str` that applies a Caesar cipher. Only shift a-z and A-Z, leave other characters unchanged. Support negative shifts.",
        "scorer": "code_exec",
        "test_code": """
assert caesar_cipher("abc", 1) == "bcd"
assert caesar_cipher("xyz", 3) == "abc"
assert caesar_cipher("Hello, World!", 13) == "Uryyb, Jbeyq!"
assert caesar_cipher("Uryyb, Jbeyq!", -13) == "Hello, World!"
assert caesar_cipher("ABC", 26) == "ABC"
assert caesar_cipher("abc", 0) == "abc"
""",
    },
    {
        "name": "code_count_words",
        "category": "code",
        "system": SYSTEM_CODE,
        "prompt": "Write a Python function `word_frequency(text: str) -> dict[str, int]` that returns a dictionary mapping each lowercase word to its count. Split on whitespace, strip punctuation from word edges.",
        "scorer": "code_exec",
        "test_code": """
result = word_frequency("the cat sat on the mat")
assert result["the"] == 2
assert result["cat"] == 1
assert result["mat"] == 1
result = word_frequency("Hello, hello, HELLO!")
assert result["hello"] == 3
result = word_frequency("")
assert result == {}
""",
    },
]


# ── Constraint helper functions (used in lambda constraints above) ─────────

def _try_parse_json(text: str):
    """Try to extract and parse JSON from text."""
    # Try the whole thing first
    try:
        return json.loads(text.strip())
    except (json.JSONDecodeError, ValueError):
        pass
    # Try to find a JSON object in the text
    match = re.search(r"\{[^{}]*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except (json.JSONDecodeError, ValueError):
            pass
    return None


def _json_has_keys(text: str, keys: list[str]) -> bool:
    obj = _try_parse_json(text)
    if not isinstance(obj, dict):
        return False
    return all(k in obj for k in keys)


def _json_all_string_values(text: str) -> bool:
    obj = _try_parse_json(text)
    if not isinstance(obj, dict):
        return False
    return all(isinstance(v, str) for v in obj.values())


def _count_sentences(text: str) -> int:
    """Rough sentence count by splitting on terminal punctuation."""
    sentences = re.split(r'[.!?]+', text.strip())
    return len([s for s in sentences if s.strip()])


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
    score: Optional[float] = None  # 0.0-1.0, None if not scored
    score_details: str = ""  # human-readable scoring breakdown


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
    # Pass prompt data as JSON via env var to avoid shell escaping issues
    prompt_data = json.dumps({
        "model_id": model_cfg["mlx_model"],
        "system": prompt_cfg["system"],
        "user": prompt_cfg["prompt"],
        "max_tokens": max_tokens,
    })

    script = '''
import json, os, sys, time
from mlx_lm import load, stream_generate

cfg = json.loads(os.environ["BENCH_PROMPT"])
model, tokenizer = load(cfg["model_id"])

messages = [
    {"role": "system", "content": cfg["system"]},
    {"role": "user", "content": cfg["user"]},
]
prompt = tokenizer.apply_chat_template(messages, add_generation_prompt=True, tokenize=False)

text = ""
response = None
for response in stream_generate(model, tokenizer, prompt, max_tokens=cfg["max_tokens"]):
    text += response.text

if response is None:
    print(json.dumps({"error": "No response generated"}))
    sys.exit(1)

print(json.dumps({
    "output": text,
    "prompt_tokens": response.prompt_tokens,
    "generation_tokens": response.generation_tokens,
    "prompt_tps": response.prompt_tps,
    "generation_tps": response.generation_tps,
    "peak_memory_gb": response.peak_memory,
}))
'''

    env = {**os.environ, "BENCH_PROMPT": prompt_data}

    start = time.perf_counter()
    try:
        proc = subprocess.run(
            [sys.executable, "-c", script],
            capture_output=True,
            text=True,
            timeout=600,
            env=env,
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


def print_comparison_table(results: list[BenchmarkResult]):
    """Print a summary table comparing all results."""
    print(f"\n{'─' * 100}")
    print(f"{'Model':<30} {'Runtime':<12} {'Prompt':<22} "
          f"{'PP t/s':>8} {'Gen t/s':>8} {'Wall':>7} {'Score':>6}")
    print(f"{'─' * 100}")
    for r in results:
        score_str = f"{r.score:.0%}" if r.score is not None else "n/a"
        err = " *" if r.error else ""
        print(f"{r.model:<30} {r.runtime:<12} {r.prompt_name:<22} "
              f"{r.prompt_tps:>8.1f} {r.generation_tps:>8.1f} "
              f"{r.wall_time_sec:>6.1f}s {score_str:>5}{err}")
    print(f"{'─' * 100}")


def print_score_summary(results: list[BenchmarkResult]):
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

    print(f"\n{'─' * (42 + 10 * len(all_cats) + 10)}")
    header = f"{'Model':<30} {'Runtime':<12}"
    for cat in all_cats:
        header += f" {cat:>8}"
    header += f" {'OVERALL':>8}"
    print(header)
    print(f"{'─' * (42 + 10 * len(all_cats) + 10)}")

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
        print(line)

    print(f"{'─' * (42 + 10 * len(all_cats) + 10)}")


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
        f.write("| Model | Runtime | Prompt | PP t/s | Gen t/s | Wall Time | Score |\n")
        f.write("|---|---|---|---|---|---|---|\n")
        for r in results:
            err = " (error)" if r.error else ""
            score_str = f"{r.score:.0%}" if r.score is not None else "n/a"
            f.write(f"| {r.model} | {r.runtime} | {r.prompt_name} | "
                    f"{r.prompt_tps:.1f} | {r.generation_tps:.1f} | "
                    f"{r.wall_time_sec:.1f}s | {score_str}{err} |\n")

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
        # One prompt per category for quick mode
        seen_cats = set()
        prompts = []
        for p in PROMPTS:
            cat = p.get("category", p["name"])
            if cat not in seen_cats:
                seen_cats.add(cat)
                prompts.append(p)
    elif args.prompt:
        # Match by name or category
        prompts = [p for p in PROMPTS
                   if args.prompt in p["name"] or args.prompt == p.get("category")]
        if not prompts:
            cats = sorted(set(p.get("category", "") for p in PROMPTS))
            print(f"No prompts matching: {args.prompt}")
            print(f"Categories: {', '.join(cats)}")
            print(f"Names: {', '.join(p['name'] for p in PROMPTS)}")
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

                score_result(r, prompt_cfg)
                print_result_summary(r)
                results.append(r)

    # Final summary
    print_header("PERFORMANCE")
    print_comparison_table(results)

    print_header("SCORES BY CATEGORY")
    print_score_summary(results)

    # Show detailed results for each prompt
    prompt_lookup = {p["name"]: p for p in prompts}
    print_header("DETAILED RESULTS")
    for prompt_cfg in prompts:
        prompt_results = [r for r in results if r.prompt_name == prompt_cfg["name"]]
        if not prompt_results:
            continue

        expected = prompt_cfg.get("expected", "")
        expected_str = f"  Expected: {expected}" if expected else ""

        print(f"\n  ── {prompt_cfg['name']} ({prompt_cfg.get('category', '')}) ──")
        print(f"  Prompt: {prompt_cfg['prompt'][:120]}{'...' if len(prompt_cfg['prompt']) > 120 else ''}")
        if expected_str:
            print(expected_str)

        for r in prompt_results:
            score_str = f"{r.score:.0%}" if r.score is not None else "n/a"
            icon = "pass" if r.score and r.score >= 1.0 else "FAIL" if r.score is not None else "    "
            output = r.output[:200] + ("..." if len(r.output) > 200 else "") if r.output else "(no output)"
            # Collapse to one line for short outputs
            output_oneline = output.replace("\n", "\\n")

            print(f"    [{icon}] {r.model:<30} {r.runtime:<10} {score_str:>5}  | {r.score_details}")
            print(f"           Output: {output_oneline[:120]}")

    # Save
    if not args.no_save:
        save_results(results, RESULTS_DIR)


if __name__ == "__main__":
    main()
