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

# ── System prompts by style ────────────────────────────────────────────────

SYSTEM_DIRECT = "You are a helpful assistant. Be concise. Answer with just the answer unless told otherwise."
SYSTEM_COT = "You are a helpful assistant. Think step by step to solve problems. Write your final answer on its own line at the end, prefixed with 'ANSWER:'."
SYSTEM_STRUCTURED = "You are a helpful assistant. Always respond in the exact format requested. No extra text."
SYSTEM_FEW_SHOT = "You are a helpful assistant. Follow the pattern shown in the examples."
SYSTEM_NOISY = "You are a helpful assistant. Focus on the core question and ignore irrelevant details. Be concise."
SYSTEM_ADVERSARIAL = "You are a helpful assistant. Read carefully — some questions are tricky. Be concise. Answer with just the answer."

SYSTEM_CODE_DIRECT = (
    "You are a Python code generator. Output ONLY the requested function. "
    "No explanations, no examples, no tests, no markdown, no commentary. "
    "Start directly with 'def '."
)
SYSTEM_CODE_TDD = (
    "You are a Python developer practicing TDD. Given the test cases below, "
    "write the function that makes all tests pass. Output ONLY the function, "
    "no tests, no markdown, no commentary."
)
SYSTEM_CODE_BUGFIX = (
    "You are a code reviewer. Fix the bug in the function below. "
    "Output ONLY the corrected function, no explanations, no markdown."
)
SYSTEM_CODE_DOCSTRING = (
    "You are a Python code generator. Complete the function body based on "
    "the docstring. Output ONLY the complete function including the def line "
    "and docstring. No markdown, no commentary."
)

# Tier gate thresholds — minimum pass rate to advance to next tier
TIER_1_GATE = 0.70  # need 70% on tier 1 to attempt tier 2
TIER_2_GATE = 0.50  # need 50% cumulative on tier 1+2 to attempt tier 3

# ── Shared test code for code challenges ───────────────────────────────────

_TEST_PALINDROME = """
assert is_palindrome("racecar") == True
assert is_palindrome("hello") == False
assert is_palindrome("") == True
assert is_palindrome("A man a plan a canal Panama") == True
assert is_palindrome("Was it a car or a cat I saw") == True
assert is_palindrome("No lemon, no melon") == True
assert is_palindrome("abc") == False
"""

_TEST_FIBONACCI = """
assert fibonacci(0) == 0
assert fibonacci(1) == 1
assert fibonacci(2) == 1
assert fibonacci(10) == 55
assert fibonacci(20) == 6765
"""

_TEST_TWO_SUM = """
result = two_sum([2, 7, 11, 15], 9)
assert sorted(result) == [0, 1]
result = two_sum([3, 2, 4], 6)
assert sorted(result) == [1, 2]
result = two_sum([3, 3], 6)
assert sorted(result) == [0, 1]
"""

_TEST_CAESAR = """
assert caesar_cipher("abc", 1) == "bcd"
assert caesar_cipher("xyz", 3) == "abc"
assert caesar_cipher("Hello, World!", 13) == "Uryyb, Jbeyq!"
assert caesar_cipher("Uryyb, Jbeyq!", -13) == "Hello, World!"
assert caesar_cipher("ABC", 26) == "ABC"
assert caesar_cipher("abc", 0) == "abc"
"""

PROMPTS = [
    # ══════════════════════════════════════════════════════════════════════════
    #  MATH
    # ══════════════════════════════════════════════════════════════════════════

    # ── Tier 1: direct ─────────────────────────────────────────────────────
    {
        "name": "math_multiply", "category": "math", "tier": 1, "style": "direct",
        "system": SYSTEM_DIRECT,
        "prompt": "What is 47 * 89? Reply with just the number.",
        "scorer": "exact_match", "expected": "4183", "extract": r"(\d[\d,]*)",
    },
    {
        "name": "math_chain", "category": "math", "tier": 1, "style": "direct",
        "system": SYSTEM_DIRECT,
        "prompt": "Start with 5. Double it. Add 7. Triple the result. What number do you have? Reply with just the number.",
        "scorer": "exact_match", "expected": "51", "extract": r"(\d+)",
    },
    {
        "name": "math_word_problem", "category": "math", "tier": 1, "style": "direct",
        "system": SYSTEM_DIRECT,
        "prompt": (
            "A baker makes 4 batches of cookies. Each batch has 36 cookies. "
            "She gives away 1/3 of all the cookies. How many does she have left? "
            "Reply with just the number."
        ),
        "scorer": "exact_match", "expected": "96", "extract": r"(\d+)",
    },
    {
        "name": "math_primes_sum", "category": "math", "tier": 1, "style": "direct",
        "system": SYSTEM_DIRECT,
        "prompt": "What is the sum of all prime numbers less than 20? Reply with just the number.",
        "scorer": "exact_match", "expected": "77", "extract": r"(\d+)",
    },

    # ── Tier 2: same challenges, varied prompting styles ───────────────────
    {
        "name": "math_multiply", "category": "math", "tier": 2, "style": "cot",
        "system": SYSTEM_COT,
        "prompt": "What is 47 * 89? Think step by step, then write ANSWER: followed by just the number.",
        "scorer": "exact_match", "expected": "4183", "extract": r"ANSWER:\s*(\d[\d,]*)",
    },
    {
        "name": "math_multiply", "category": "math", "tier": 2, "style": "few_shot",
        "system": SYSTEM_FEW_SHOT,
        "prompt": (
            "Q: What is 23 * 17?\nA: 391\n\n"
            "Q: What is 56 * 34?\nA: 1904\n\n"
            "Q: What is 47 * 89?\nA:"
        ),
        "scorer": "exact_match", "expected": "4183", "extract": r"(\d[\d,]*)",
    },
    {
        "name": "math_chain", "category": "math", "tier": 2, "style": "noisy",
        "system": SYSTEM_NOISY,
        "prompt": (
            "My friend told me this puzzle yesterday at the coffee shop (great latte by the way). "
            "Start with 5. Double it. Add 7. Triple the result. "
            "I think the answer might be 45 but I'm not sure. What number do you get? "
            "Reply with just the number."
        ),
        "scorer": "exact_match", "expected": "51", "extract": r"(\d+)",
    },
    {
        "name": "math_word_problem", "category": "math", "tier": 2, "style": "structured",
        "system": SYSTEM_STRUCTURED,
        "prompt": (
            "A baker makes 4 batches of cookies. Each batch has 36 cookies. "
            "She gives away 1/3 of all the cookies. How many does she have left?\n\n"
            'Respond with exactly this JSON: {"answer": <number>}'
        ),
        "scorer": "exact_match", "expected": "96",
        "extract": r'"answer"\s*:\s*(\d+)',
    },
    {
        "name": "math_primes_sum", "category": "math", "tier": 2, "style": "adversarial",
        "system": SYSTEM_ADVERSARIAL,
        "prompt": (
            "What is the sum of all prime numbers less than 20? "
            "Remember, 1 is not a prime number and 2 is the only even prime. "
            "Also note that 20 itself should not be included. "
            "Reply with just the number."
        ),
        "scorer": "exact_match", "expected": "77", "extract": r"(\d+)",
    },
    {
        "name": "math_word_problem", "category": "math", "tier": 2, "style": "decomposed",
        "system": SYSTEM_DIRECT,
        "prompt": (
            "Solve this step by step:\n"
            "1. A baker makes 4 batches of cookies, 36 per batch. How many total?\n"
            "2. She gives away 1/3. How many given away?\n"
            "3. How many left?\n\n"
            "Reply with ONLY the final number from step 3."
        ),
        "scorer": "exact_match", "expected": "96", "extract": r"(\d+)",
    },

    # ── Tier 3: harder math ────────────────────────────────────────────────
    {
        "name": "math_compound_interest", "category": "math", "tier": 3, "style": "direct",
        "system": SYSTEM_DIRECT,
        "prompt": (
            "You invest $1000 at 10% annual interest compounded once per year. "
            "How much do you have after 3 years, rounded to the nearest dollar? "
            "Reply with just the number."
        ),
        "scorer": "exact_match", "expected": "1331", "extract": r"(\d[\d,]*)",
    },
    {
        "name": "math_combinatorics", "category": "math", "tier": 3, "style": "cot",
        "system": SYSTEM_COT,
        "prompt": (
            "How many ways can you choose 3 items from a set of 7? "
            "Think step by step, then write ANSWER: followed by just the number."
        ),
        "scorer": "exact_match", "expected": "35", "extract": r"ANSWER:\s*(\d+)",
    },
    {
        "name": "math_modular", "category": "math", "tier": 3, "style": "structured",
        "system": SYSTEM_STRUCTURED,
        "prompt": (
            "What is (17^3) mod 13? "
            'Respond with exactly: {"result": <number>}'
        ),
        "scorer": "exact_match", "expected": "4",
        "extract": r'"result"\s*:\s*(\d+)',
    },

    # ══════════════════════════════════════════════════════════════════════════
    #  FACTUAL
    # ══════════════════════════════════════════════════════════════════════════

    # ── Tier 1: direct ─────────────────────────────────────────────────────
    {
        "name": "fact_treaty", "category": "factual", "tier": 1, "style": "direct",
        "system": SYSTEM_DIRECT,
        "prompt": "In what year was the Treaty of Westphalia signed? Reply with just the year.",
        "scorer": "exact_match", "expected": "1648", "extract": r"(\d{4})",
    },
    {
        "name": "fact_gold", "category": "factual", "tier": 1, "style": "direct",
        "system": SYSTEM_DIRECT,
        "prompt": "What is the chemical symbol for gold? Reply with just the symbol.",
        "scorer": "exact_match", "expected": "Au", "extract": r"\b([A-Z][a-z]?)\b",
    },
    {
        "name": "fact_chromosomes", "category": "factual", "tier": 1, "style": "direct",
        "system": SYSTEM_DIRECT,
        "prompt": "How many chromosomes do humans have? Reply with just the number.",
        "scorer": "exact_match", "expected": "46", "extract": r"(\d+)",
    },

    # ── Tier 2: varied styles ──────────────────────────────────────────────
    {
        "name": "fact_treaty", "category": "factual", "tier": 2, "style": "structured",
        "system": SYSTEM_STRUCTURED,
        "prompt": 'When was the Treaty of Westphalia signed? Reply as: {"year": <number>}',
        "scorer": "exact_match", "expected": "1648",
        "extract": r'"year"\s*:\s*(\d{4})',
    },
    {
        "name": "fact_gold", "category": "factual", "tier": 2, "style": "noisy",
        "system": SYSTEM_NOISY,
        "prompt": (
            "I'm working on a chemistry homework assignment about transition metals. "
            "The periodic table is so confusing with all those symbols! "
            "Anyway, what's the chemical symbol for gold? Just the symbol please."
        ),
        "scorer": "exact_match", "expected": "Au", "extract": r"\b([A-Z][a-z]?)\b",
    },
    {
        "name": "fact_chromosomes", "category": "factual", "tier": 2, "style": "adversarial",
        "system": SYSTEM_ADVERSARIAL,
        "prompt": (
            "How many chromosomes do humans have? "
            "Note: I'm asking about the total number in a normal diploid cell, "
            "not the haploid number in gametes. Reply with just the number."
        ),
        "scorer": "exact_match", "expected": "46", "extract": r"(\d+)",
    },
    {
        "name": "fact_boiling", "category": "factual", "tier": 2, "style": "few_shot",
        "system": SYSTEM_FEW_SHOT,
        "prompt": (
            "Q: What is the freezing point of water in Fahrenheit?\nA: 32\n\n"
            "Q: What is the boiling point of water in Celsius?\nA: 100\n\n"
            "Q: What is the boiling point of water in Fahrenheit?\nA:"
        ),
        "scorer": "exact_match", "expected": "212", "extract": r"(\d+)",
    },

    # ── Tier 3: harder factual ─────────────────────────────────────────────
    {
        "name": "fact_planck", "category": "factual", "tier": 3, "style": "direct",
        "system": SYSTEM_DIRECT,
        "prompt": "What is Planck's constant in units of 10^-34 J·s, rounded to 2 decimal places? Reply with just the number (e.g. 6.63).",
        "scorer": "exact_match", "expected": "6.63", "extract": r"(\d+\.\d+)",
    },
    {
        "name": "fact_elements", "category": "factual", "tier": 3, "style": "structured",
        "system": SYSTEM_STRUCTURED,
        "prompt": 'What element has atomic number 79? Reply as: {"element": "<name>", "symbol": "<symbol>"}',
        "scorer": "constraint",
        "constraints": [
            ("valid JSON", lambda o: _try_parse_json(o) is not None),
            ("says gold", lambda o: "gold" in (o.lower())),
            ("symbol Au", lambda o: "Au" in o),
        ],
    },

    # ══════════════════════════════════════════════════════════════════════════
    #  LOGIC
    # ══════════════════════════════════════════════════════════════════════════

    # ── Tier 1: direct ─────────────────────────────────────────────────────
    {
        "name": "logic_sheep", "category": "logic", "tier": 1, "style": "direct",
        "system": SYSTEM_DIRECT,
        "prompt": "A farmer has 17 sheep. All but 9 die. How many sheep are left? Reply with just the number.",
        "scorer": "exact_match", "expected": "9", "extract": r"(\d+)",
    },
    {
        "name": "logic_widgets", "category": "logic", "tier": 1, "style": "direct",
        "system": SYSTEM_DIRECT,
        "prompt": (
            "If it takes 5 machines 5 minutes to make 5 widgets, "
            "how many minutes does it take 100 machines to make 100 widgets? "
            "Reply with just the number."
        ),
        "scorer": "exact_match", "expected": "5", "extract": r"(\d+)",
    },
    {
        "name": "logic_bat_ball", "category": "logic", "tier": 1, "style": "direct",
        "system": SYSTEM_DIRECT,
        "prompt": (
            "A bat and a ball cost $1.10 together. "
            "The bat costs $1.00 more than the ball. "
            "How much does the ball cost in cents? Reply with just the number."
        ),
        "scorer": "exact_match", "expected": "5", "extract": r"(\d+)",
    },

    # ── Tier 2: varied styles ──────────────────────────────────────────────
    {
        "name": "logic_sheep", "category": "logic", "tier": 2, "style": "cot",
        "system": SYSTEM_COT,
        "prompt": (
            "A farmer has 17 sheep. All but 9 die. How many sheep are left? "
            "Think carefully about the wording, then write ANSWER: followed by the number."
        ),
        "scorer": "exact_match", "expected": "9", "extract": r"ANSWER:\s*(\d+)",
    },
    {
        "name": "logic_widgets", "category": "logic", "tier": 2, "style": "adversarial",
        "system": SYSTEM_ADVERSARIAL,
        "prompt": (
            "Here's a tricky one. If it takes 5 machines 5 minutes to make 5 widgets, "
            "how many minutes would it take 100 machines to make 100 widgets? "
            "Hint: the answer is NOT 100. Reply with just the number."
        ),
        "scorer": "exact_match", "expected": "5", "extract": r"(\d+)",
    },
    {
        "name": "logic_bat_ball", "category": "logic", "tier": 2, "style": "noisy",
        "system": SYSTEM_NOISY,
        "prompt": (
            "OK so my math teacher gave us this problem and half the class got it wrong lol. "
            "A bat and a ball cost $1.10 together and the bat is $1.00 more than the ball. "
            "Everyone keeps saying 10 cents but that's wrong right?? "
            "What does the ball actually cost in cents? Just the number."
        ),
        "scorer": "exact_match", "expected": "5", "extract": r"(\d+)",
    },
    {
        "name": "logic_sheep", "category": "logic", "tier": 2, "style": "few_shot",
        "system": SYSTEM_FEW_SHOT,
        "prompt": (
            "Q: A classroom has 30 students. All but 12 go home. How many are left?\nA: 12\n\n"
            "Q: A parking lot has 50 cars. All but 23 drive away. How many remain?\nA: 23\n\n"
            "Q: A farmer has 17 sheep. All but 9 die. How many are left?\nA:"
        ),
        "scorer": "exact_match", "expected": "9", "extract": r"(\d+)",
    },

    # ── Tier 3: harder logic ───────────────────────────────────────────────
    {
        "name": "logic_ages", "category": "logic", "tier": 3, "style": "cot",
        "system": SYSTEM_COT,
        "prompt": (
            "Alice is twice as old as Bob. In 10 years, Alice will be 1.5 times as old as Bob. "
            "How old is Bob now? Think step by step, then write ANSWER: followed by the number."
        ),
        "scorer": "exact_match", "expected": "20", "extract": r"ANSWER:\s*(\d+)",
    },
    {
        "name": "logic_sequence", "category": "logic", "tier": 3, "style": "direct",
        "system": SYSTEM_DIRECT,
        "prompt": "What is the next number in this sequence: 1, 1, 2, 3, 5, 8, 13, 21, __? Reply with just the number.",
        "scorer": "exact_match", "expected": "34", "extract": r"(\d+)",
    },
    {
        "name": "logic_door", "category": "logic", "tier": 3, "style": "structured",
        "system": SYSTEM_STRUCTURED,
        "prompt": (
            "There are 3 doors. Behind one is a prize. You pick door 1. "
            "The host (who knows what's behind each door) opens door 3, showing no prize. "
            "Should you switch to door 2 or stay with door 1? "
            'Reply as: {"action": "switch" or "stay", "reason": "one sentence"}'
        ),
        "scorer": "constraint",
        "constraints": [
            ("valid JSON", lambda o: _try_parse_json(o) is not None),
            ("says switch", lambda o: "switch" in o.lower()),
        ],
    },

    # ══════════════════════════════════════════════════════════════════════════
    #  CONSTRAINT
    # ══════════════════════════════════════════════════════════════════════════

    # ── Tier 1: basic format compliance ────────────────────────────────────
    {
        "name": "constraint_capitals", "category": "constraint", "tier": 1, "style": "direct",
        "system": SYSTEM_STRUCTURED,
        "prompt": "List exactly 5 US state capitals, one per line, numbered 1 through 5.",
        "scorer": "constraint",
        "constraints": [
            ("has 5 numbered lines", lambda o: bool(re.search(r"^1[.):]\s*\S+", o, re.MULTILINE)) and
                                                bool(re.search(r"^5[.):]\s*\S+", o, re.MULTILINE))),
            ("has no 6th item", lambda o: not re.search(r"^6[.):]\s", o, re.MULTILINE)),
        ],
    },
    {
        "name": "constraint_json", "category": "constraint", "tier": 1, "style": "direct",
        "system": SYSTEM_STRUCTURED,
        "prompt": 'Output a JSON object with exactly 3 keys: "name", "age", "city". All values must be strings. Output only the JSON, nothing else.',
        "scorer": "constraint",
        "constraints": [
            ("valid JSON", lambda o: _try_parse_json(o) is not None),
            ("has required keys", lambda o: _json_has_keys(o, ["name", "age", "city"])),
            ("all values are strings", lambda o: _json_all_string_values(o)),
        ],
    },
    {
        "name": "constraint_keywords", "category": "constraint", "tier": 1, "style": "direct",
        "system": SYSTEM_STRUCTURED,
        "prompt": "Write one paragraph about space exploration. You MUST include the words 'rocket', 'orbit', and 'gravity'.",
        "scorer": "constraint",
        "constraints": [
            ("contains 'rocket'", lambda o: "rocket" in o.lower()),
            ("contains 'orbit'", lambda o: "orbit" in o.lower()),
            ("contains 'gravity'", lambda o: "gravity" in o.lower()),
        ],
    },
    {
        "name": "constraint_no_letter_e", "category": "constraint", "tier": 1, "style": "direct",
        "system": SYSTEM_STRUCTURED,
        "prompt": "Write a sentence about a cat. The sentence must NOT contain the letter 'e' anywhere.",
        "scorer": "constraint",
        "constraints": [
            ("no letter e", lambda o: "e" not in o.lower()),
            ("is a sentence", lambda o: len(o.strip()) > 10),
        ],
    },

    # ── Tier 2: harder constraints, varied framing ─────────────────────────
    {
        "name": "constraint_json_nested", "category": "constraint", "tier": 2, "style": "structured",
        "system": SYSTEM_STRUCTURED,
        "prompt": (
            'Output a JSON object representing a person with: '
            '"name" (string), "age" (number), "address" (object with "street", "city", "zip"). '
            'Use realistic values. Output only valid JSON.'
        ),
        "scorer": "constraint",
        "constraints": [
            ("valid JSON", lambda o: _try_parse_json(o) is not None),
            ("has name", lambda o: _json_has_keys(o, ["name"])),
            ("has nested address", lambda o: isinstance((_try_parse_json(o) or {}).get("address"), dict)),
            ("address has city", lambda o: "city" in ((_try_parse_json(o) or {}).get("address") or {})),
        ],
    },
    {
        "name": "constraint_keywords", "category": "constraint", "tier": 2, "style": "adversarial",
        "system": SYSTEM_STRUCTURED,
        "prompt": (
            "Write one paragraph about the ocean. You MUST include ALL of these words: "
            "'current', 'pressure', 'salinity', 'bioluminescence', and 'trench'. "
            "Do not use any word more than once."
        ),
        "scorer": "constraint",
        "constraints": [
            ("contains 'current'", lambda o: "current" in o.lower()),
            ("contains 'pressure'", lambda o: "pressure" in o.lower()),
            ("contains 'salinity'", lambda o: "salinity" in o.lower()),
            ("contains 'bioluminescence'", lambda o: "bioluminescence" in o.lower()),
            ("contains 'trench'", lambda o: "trench" in o.lower()),
        ],
    },
    {
        "name": "constraint_no_letter_e", "category": "constraint", "tier": 2, "style": "adversarial",
        "system": SYSTEM_STRUCTURED,
        "prompt": (
            "Write exactly 3 sentences about cooking dinner. "
            "None of the sentences may contain the letter 'e'. "
            "Number each sentence 1-3."
        ),
        "scorer": "constraint",
        "constraints": [
            ("no letter e", lambda o: "e" not in o.lower()),
            ("has 3 lines", lambda o: bool(re.search(r"^3[.):]\s", o, re.MULTILINE))),
            ("long enough", lambda o: len(o.strip()) > 40),
        ],
    },
    {
        "name": "constraint_format_switch", "category": "constraint", "tier": 2, "style": "decomposed",
        "system": SYSTEM_STRUCTURED,
        "prompt": (
            "Do these two things in order:\n"
            "1. List 3 European countries, as a JSON array of strings.\n"
            "2. For each country, write its capital on a new line in the format 'Country: Capital'.\n\n"
            "Output both parts with a blank line between them."
        ),
        "scorer": "constraint",
        "constraints": [
            ("has JSON array", lambda o: bool(re.search(r'\[.*".*".*\]', o, re.DOTALL))),
            ("has colon-separated pairs", lambda o: len(re.findall(r'\w+:\s*\w+', o)) >= 3),
        ],
    },

    # ── Tier 3: multi-constraint gauntlet ──────────────────────────────────
    {
        "name": "constraint_gauntlet", "category": "constraint", "tier": 3, "style": "structured",
        "system": SYSTEM_STRUCTURED,
        "prompt": (
            "Write a 4-line poem about the moon. Requirements:\n"
            "- Exactly 4 lines\n"
            "- Lines 1 and 3 must rhyme\n"
            "- Lines 2 and 4 must rhyme\n"
            "- Each line must be between 5 and 12 words\n"
            "- The word 'moon' must appear exactly once"
        ),
        "scorer": "constraint",
        "constraints": [
            ("exactly 4 lines", lambda o: len([l for l in o.strip().splitlines() if l.strip()]) == 4),
            ("moon appears once", lambda o: o.lower().split().count("moon") == 1),
            ("lines have 5-12 words", lambda o: all(
                5 <= len(l.split()) <= 12
                for l in o.strip().splitlines() if l.strip()
            )),
        ],
    },
    {
        "name": "constraint_json_transform", "category": "constraint", "tier": 3, "style": "decomposed",
        "system": SYSTEM_STRUCTURED,
        "prompt": (
            'Given this input: {"items": ["apple", "banana", "cherry"]}\n\n'
            'Transform it to: {"items": [{"name": "<item>", "length": <char_count>}], "count": <total>}\n\n'
            'Output only the transformed JSON.'
        ),
        "scorer": "constraint",
        "constraints": [
            ("valid JSON", lambda o: _try_parse_json(o) is not None),
            ("has count=3", lambda o: (_try_parse_json(o) or {}).get("count") == 3),
            ("has items array", lambda o: isinstance((_try_parse_json(o) or {}).get("items"), list)),
            ("apple length=5", lambda o: any(
                item.get("name") == "apple" and item.get("length") == 5
                for item in ((_try_parse_json(o) or {}).get("items") or [])
                if isinstance(item, dict)
            )),
        ],
    },

    # ══════════════════════════════════════════════════════════════════════════
    #  CODE
    # ══════════════════════════════════════════════════════════════════════════

    # ── Tier 1: spec → implementation (direct) ─────────────────────────────
    {
        "name": "code_is_palindrome", "category": "code", "tier": 1, "style": "direct",
        "system": SYSTEM_CODE_DIRECT,
        "prompt": "Write a Python function `is_palindrome(s: str) -> bool` that returns True if the string is a palindrome (case-insensitive, ignoring non-alphanumeric characters).",
        "scorer": "code_exec",
        "test_code": _TEST_PALINDROME,
    },
    {
        "name": "code_fibonacci", "category": "code", "tier": 1, "style": "direct",
        "system": SYSTEM_CODE_DIRECT,
        "prompt": "Write a Python function `fibonacci(n: int) -> int` that returns the nth Fibonacci number, where fibonacci(0) = 0, fibonacci(1) = 1.",
        "scorer": "code_exec",
        "test_code": _TEST_FIBONACCI,
    },
    {
        "name": "code_two_sum", "category": "code", "tier": 1, "style": "direct",
        "system": SYSTEM_CODE_DIRECT,
        "prompt": "Write a Python function `two_sum(nums: list[int], target: int) -> list[int]` that returns the indices of two numbers that add up to target. Each input has exactly one solution.",
        "scorer": "code_exec",
        "test_code": _TEST_TWO_SUM,
    },
    {
        "name": "code_caesar_cipher", "category": "code", "tier": 1, "style": "direct",
        "system": SYSTEM_CODE_DIRECT,
        "prompt": "Write a Python function `caesar_cipher(text: str, shift: int) -> str` that applies a Caesar cipher. Only shift a-z and A-Z, leave other characters unchanged. Support negative shifts.",
        "scorer": "code_exec",
        "test_code": _TEST_CAESAR,
    },

    # ── Tier 2: same challenges, different prompting approaches ────────────
    {
        "name": "code_is_palindrome", "category": "code", "tier": 2, "style": "tdd",
        "system": SYSTEM_CODE_TDD,
        "prompt": (
            "Write the function that makes these tests pass:\n\n"
            "```python\n"
            'assert is_palindrome("racecar") == True\n'
            'assert is_palindrome("hello") == False\n'
            'assert is_palindrome("A man a plan a canal Panama") == True\n'
            'assert is_palindrome("") == True\n'
            "```"
        ),
        "scorer": "code_exec",
        "test_code": _TEST_PALINDROME,
    },
    {
        "name": "code_fibonacci", "category": "code", "tier": 2, "style": "docstring",
        "system": SYSTEM_CODE_DOCSTRING,
        "prompt": (
            "Complete this function:\n\n"
            "```python\n"
            "def fibonacci(n: int) -> int:\n"
            '    """Return the nth Fibonacci number.\n'
            "    \n"
            "    fibonacci(0) = 0\n"
            "    fibonacci(1) = 1\n"
            "    fibonacci(n) = fibonacci(n-1) + fibonacci(n-2)\n"
            '    """\n'
            "```"
        ),
        "scorer": "code_exec",
        "test_code": _TEST_FIBONACCI,
    },
    {
        "name": "code_two_sum", "category": "code", "tier": 2, "style": "noisy",
        "system": SYSTEM_CODE_DIRECT,
        "prompt": (
            "I need a function for a leetcode problem I'm stuck on. "
            "Function called two_sum, takes a list of ints and a target int, "
            "returns the indices of the two numbers that add up to the target. "
            "There's always exactly one answer. Please just give me the function."
        ),
        "scorer": "code_exec",
        "test_code": _TEST_TWO_SUM,
    },
    {
        "name": "code_caesar_cipher", "category": "code", "tier": 2, "style": "bugfix",
        "system": SYSTEM_CODE_BUGFIX,
        "prompt": (
            "This Caesar cipher function has bugs. Fix it:\n\n"
            "```python\n"
            "def caesar_cipher(text: str, shift: int) -> str:\n"
            "    result = ''\n"
            "    for char in text:\n"
            "        if char.isalpha():\n"
            "            base = ord('a')  # BUG: doesn't handle uppercase\n"
            "            result += chr((ord(char) - base + shift) % 26 + base)\n"
            "        else:\n"
            "            result += char\n"
            "    return result\n"
            "```"
        ),
        "scorer": "code_exec",
        "test_code": _TEST_CAESAR,
    },

    # ── Tier 3: harder coding challenges ───────────────────────────────────
    {
        "name": "code_flatten", "category": "code", "tier": 3, "style": "direct",
        "system": SYSTEM_CODE_DIRECT,
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
        "name": "code_word_frequency", "category": "code", "tier": 3, "style": "tdd",
        "system": SYSTEM_CODE_TDD,
        "prompt": (
            "Write the function `word_frequency(text: str) -> dict[str, int]` that makes these tests pass:\n\n"
            "```python\n"
            'result = word_frequency("the cat sat on the mat")\n'
            'assert result["the"] == 2\n'
            'assert result["cat"] == 1\n'
            'result = word_frequency("Hello, hello, HELLO!")\n'
            'assert result["hello"] == 3\n'
            'assert word_frequency("") == {}\n'
            "```\n\n"
            "Split on whitespace, strip punctuation from word edges, lowercase everything."
        ),
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
    {
        "name": "code_matrix_rotate", "category": "code", "tier": 3, "style": "direct",
        "system": SYSTEM_CODE_DIRECT,
        "prompt": "Write a Python function `rotate_90(matrix: list[list[int]]) -> list[list[int]]` that rotates a square matrix 90 degrees clockwise. Do not modify the input.",
        "scorer": "code_exec",
        "test_code": """
assert rotate_90([[1,2],[3,4]]) == [[3,1],[4,2]]
assert rotate_90([[1,2,3],[4,5,6],[7,8,9]]) == [[7,4,1],[8,5,2],[9,6,3]]
assert rotate_90([[1]]) == [[1]]
""",
    },
    {
        "name": "code_lru_cache", "category": "code", "tier": 3, "style": "direct",
        "system": SYSTEM_CODE_DIRECT,
        "prompt": (
            "Write a Python class `LRUCache` with:\n"
            "- `__init__(self, capacity: int)` — max number of items\n"
            "- `get(self, key: int) -> int` — return value or -1 if not found\n"
            "- `put(self, key: int, value: int)` — insert/update, evict LRU if at capacity"
        ),
        "scorer": "code_exec",
        "test_code": """
cache = LRUCache(2)
cache.put(1, 1)
cache.put(2, 2)
assert cache.get(1) == 1
cache.put(3, 3)  # evicts key 2
assert cache.get(2) == -1
cache.put(4, 4)  # evicts key 1
assert cache.get(1) == -1
assert cache.get(3) == 3
assert cache.get(4) == 4
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


# ── llama.cpp runner (server-based) ────────────────────────────────────────

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


def run_llamacpp_batch(model_cfg: dict, prompts: list[dict],
                       max_tokens: int) -> list[BenchmarkResult]:
    """Start llama-server once, run all prompts, return results."""
    results = []
    hf_spec = f"{model_cfg['llamacpp_hf']}:{model_cfg['llamacpp_quant']}"

    server_cmd = [
        str(LLAMA_SERVER),
        "-hf", hf_spec,
        "--host", "127.0.0.1",
        "--port", str(LLAMACPP_PORT),
        "--log-disable",
    ]

    print(f"    Starting llama-server for {model_cfg['name']}...", flush=True)
    server_proc = subprocess.Popen(
        server_cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )

    try:
        if not _wait_for_server(LLAMACPP_PORT):
            # Server failed to start
            stderr = server_proc.stderr.read().decode() if server_proc.stderr else ""
            for prompt_cfg in prompts:
                r = BenchmarkResult(
                    model=model_cfg["name"], runtime="llama.cpp",
                    prompt_name=prompt_cfg["name"],
                    error=f"Server failed to start: {stderr[-200:]}",
                )
                results.append(r)
            return results

        print(f"    Server ready. Running {len(prompts)} prompts...", flush=True)

        for prompt_cfg in prompts:
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

                # Calculate t/s from timing data if available
                timings = data.get("timings", {})
                if timings:
                    result.prompt_tps = timings.get("prompt_per_second", 0.0)
                    result.generation_tps = timings.get("predicted_per_second", 0.0)
                elif result.generation_tokens > 0 and result.wall_time_sec > 0:
                    result.generation_tps = result.generation_tokens / result.wall_time_sec

            except Exception as e:
                result.wall_time_sec = time.perf_counter() - start
                result.error = str(e)[:200]

            results.append(result)

    finally:
        # Clean shutdown
        print(f"    Stopping server...", flush=True)
        server_proc.terminate()
        try:
            server_proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server_proc.kill()
            server_proc.wait()

    return results


# ── MLX runner (batch, single subprocess) ──────────────────────────────────

def run_mlx_batch(model_cfg: dict, prompts: list[dict],
                  max_tokens: int) -> list[BenchmarkResult]:
    """Load model once in a subprocess, run all prompts, return results."""
    results = []

    # Write prompts to a temp file to avoid env var size limits
    prompt_data = json.dumps({
        "model_id": model_cfg["mlx_model"],
        "max_tokens": max_tokens,
        "prompts": [
            {"name": p["name"], "system": p["system"], "user": p["prompt"]}
            for p in prompts
        ],
    })

    script = '''
import json, os, sys, time
from mlx_lm import load, stream_generate

cfg = json.loads(os.environ["BENCH_CONFIG"])

print("LOADING_MODEL", flush=True)
model, tokenizer = load(cfg["model_id"])
print("MODEL_READY", flush=True)

results = []
for p in cfg["prompts"]:
    messages = [
        {"role": "system", "content": p["system"]},
        {"role": "user", "content": p["user"]},
    ]
    prompt = tokenizer.apply_chat_template(messages, add_generation_prompt=True, tokenize=False)

    text = ""
    response = None
    start = time.perf_counter()
    try:
        for response in stream_generate(model, tokenizer, prompt, max_tokens=cfg["max_tokens"]):
            text += response.text
        wall = time.perf_counter() - start

        if response is None:
            results.append({"name": p["name"], "error": "No response generated", "wall": wall})
        else:
            results.append({
                "name": p["name"],
                "output": text,
                "prompt_tokens": response.prompt_tokens,
                "generation_tokens": response.generation_tokens,
                "prompt_tps": response.prompt_tps,
                "generation_tps": response.generation_tps,
                "peak_memory_gb": response.peak_memory,
                "wall": wall,
            })
    except Exception as e:
        wall = time.perf_counter() - start
        results.append({"name": p["name"], "error": str(e)[:200], "wall": wall})

    # Flush a progress indicator so the parent knows we're still alive
    print(f"DONE:{p['name']}", flush=True)

print("RESULTS_JSON:" + json.dumps(results), flush=True)
'''

    env = {**os.environ, "BENCH_CONFIG": prompt_data}

    print(f"    Loading MLX model {model_cfg['name']}...", flush=True)

    try:
        proc = subprocess.Popen(
            [sys.executable, "-c", script],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=env,
        )

        # Read stdout line by line for progress
        json_line = None
        for line in proc.stdout:
            line = line.strip()
            if line == "MODEL_READY":
                print(f"    Model loaded. Running {len(prompts)} prompts...", flush=True)
            elif line.startswith("DONE:"):
                prompt_name = line[5:]
                print(f"      Completed: {prompt_name}", flush=True)
            elif line.startswith("RESULTS_JSON:"):
                json_line = line[13:]

        proc.wait(timeout=60)

        if json_line is None:
            stderr = proc.stderr.read()
            for prompt_cfg in prompts:
                results.append(BenchmarkResult(
                    model=model_cfg["name"], runtime="mlx",
                    prompt_name=prompt_cfg["name"],
                    error=f"No results from MLX subprocess: {stderr[-200:]}",
                ))
            return results

        data_list = json.loads(json_line)
        for d in data_list:
            r = BenchmarkResult(
                model=model_cfg["name"],
                runtime="mlx",
                prompt_name=d["name"],
            )
            if "error" in d:
                r.error = d["error"]
                r.wall_time_sec = d.get("wall", 0.0)
            else:
                r.output = d["output"]
                r.prompt_tokens = d["prompt_tokens"]
                r.generation_tokens = d["generation_tokens"]
                r.prompt_tps = d["prompt_tps"]
                r.generation_tps = d["generation_tps"]
                r.peak_memory_gb = d["peak_memory_gb"]
                r.wall_time_sec = d["wall"]
            results.append(r)

    except subprocess.TimeoutExpired:
        proc.kill()
        for prompt_cfg in prompts:
            results.append(BenchmarkResult(
                model=model_cfg["name"], runtime="mlx",
                prompt_name=prompt_cfg["name"],
                error="MLX subprocess timed out",
            ))
    except Exception as e:
        for prompt_cfg in prompts:
            results.append(BenchmarkResult(
                model=model_cfg["name"], runtime="mlx",
                prompt_name=prompt_cfg["name"],
                error=str(e)[:200],
            ))

    return results


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


def print_summary_table(results: list[BenchmarkResult]):
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

    print(f"\n{'─' * 85}")
    print(f"{'Model':<30} {'Runtime':<12} {'Avg Score':>10} {'Tokens':>8} {'Wall Time':>10} {'Gen t/s':>8}")
    print(f"{'─' * 85}")
    for (model, runtime), s in sorted(summary.items()):
        avg_score = sum(s["scores"]) / len(s["scores"]) if s["scores"] else 0
        avg_gen = sum(s["gen_tps"]) / len(s["gen_tps"]) if s["gen_tps"] else 0
        print(f"{model:<30} {runtime:<12} {avg_score:>9.0%} {s['tokens']:>8} {s['wall']:>9.1f}s {avg_gen:>7.1f}")
    print(f"{'─' * 85}")


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


def save_results(results: list[BenchmarkResult], output_dir: Path, prompts: list[dict]):
    """Save results to JSON and markdown."""
    from collections import defaultdict

    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = time.strftime("%Y%m%d-%H%M%S")

    # JSON (full data)
    json_path = output_dir / f"benchmark-{timestamp}.json"
    with open(json_path, "w") as f:
        json.dump([asdict(r) for r in results], f, indent=2)

    # Build prompt lookup
    prompt_lookup = {p["name"]: p for p in prompts}

    # Markdown summary
    md_path = output_dir / f"benchmark-{timestamp}.md"
    with open(md_path, "w") as f:
        f.write(f"# Benchmark Results — {time.strftime('%Y-%m-%d %H:%M')}\n\n")

        # ── SUMMARY (one row per model+runtime) ──
        f.write("# SUMMARY\n\n")
        from collections import defaultdict
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

        f.write(f"{'─' * 85}\n")
        f.write(f"{'Model':<30} {'Runtime':<12} {'Avg Score':>10} {'Tokens':>8} {'Wall Time':>10} {'Gen t/s':>8}\n")
        f.write(f"{'─' * 85}\n")
        for (model, runtime), s in sorted(summary.items()):
            avg_score = sum(s["scores"]) / len(s["scores"]) if s["scores"] else 0
            avg_gen = sum(s["gen_tps"]) / len(s["gen_tps"]) if s["gen_tps"] else 0
            f.write(f"{model:<30} {runtime:<12} {avg_score:>9.0%} {s['tokens']:>8} {s['wall']:>9.1f}s {avg_gen:>7.1f}\n")
        f.write(f"{'─' * 85}\n\n")

        # ── PERFORMANCE (fixed-width table, same as print_comparison_table) ──
        f.write("# PERFORMANCE\n\n")
        f.write(f"{'─' * 100}\n")
        f.write(f"{'Model':<30} {'Runtime':<12} {'Prompt':<22} "
                f"{'PP t/s':>8} {'Gen t/s':>8} {'Wall':>7} {'Score':>6}\n")
        f.write(f"{'─' * 100}\n")
        for r in results:
            score_str = f"{r.score:.0%}" if r.score is not None else "n/a"
            err = " *" if r.error else ""
            f.write(f"{r.model:<30} {r.runtime:<12} {r.prompt_name:<22} "
                    f"{r.prompt_tps:>8.1f} {r.generation_tps:>8.1f} "
                    f"{r.wall_time_sec:>6.1f}s {score_str:>5}{err}\n")
        f.write(f"{'─' * 100}\n")

        # ── Scores by Category (fixed-width, same as print_score_summary) ──
        f.write("\n## Scores by Category\n\n")
        groups: dict[tuple[str, str], dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
        for r in results:
            if r.score is not None:
                key = (r.model, r.runtime)
                groups[key][r.category].append(r.score)
                groups[key]["_overall"].append(r.score)

        if groups:
            all_cats = sorted({cat for scores in groups.values() for cat in scores if cat != "_overall"})
            sep_width = 42 + 10 * len(all_cats) + 10
            f.write(f"{'─' * sep_width}\n")
            header = f"{'Model':<30} {'Runtime':<12}"
            for cat in all_cats:
                header += f" {cat:>8}"
            header += f" {'OVERALL':>8}"
            f.write(header + "\n")
            f.write(f"{'─' * sep_width}\n")
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
                f.write(line + "\n")
            f.write(f"{'─' * sep_width}\n")

        # ── Detailed Results ──
        f.write("\n## Detailed Results\n\n")
        for prompt_cfg in prompts:
            prompt_results = [r for r in results if r.prompt_name == prompt_cfg["name"]]
            if not prompt_results:
                continue

            expected = prompt_cfg.get("expected", "")
            prompt_text = prompt_cfg["prompt"]
            truncated_prompt = prompt_text[:120] + ("..." if len(prompt_text) > 120 else "")

            f.write(f"  ── {prompt_cfg['name']} ({prompt_cfg.get('category', '')}) ──\n")
            f.write(f"  Prompt: {truncated_prompt}\n")
            if expected:
                f.write(f"  Expected: {expected}\n")

            for r in prompt_results:
                score_str = f"{r.score:.0%}" if r.score is not None else "n/a"
                icon = "pass" if r.score and r.score >= 1.0 else "FAIL" if r.score is not None else "    "
                output = r.output if r.output else "(no output)"
                output_oneline = output.replace("\n", "\\n")
                output_oneline = output_oneline[:120] + ("..." if len(output_oneline) > 120 else "")

                f.write(f"    [{icon}] {r.model:<30} {r.runtime:<10} {score_str:>5}  | {r.score_details}\n")
                f.write(f"           Output: {output_oneline}\n")

            f.write("\n")

        # ── Full Outputs ──
        f.write("\n## Full Outputs\n\n")
        for r in results:
            f.write(f"### {r.model} / {r.runtime} / {r.prompt_name}\n\n")

            prompt_cfg = prompt_lookup.get(r.prompt_name, {})
            expected = prompt_cfg.get("expected", "")
            if expected:
                f.write(f"Expected: {expected}\n")

            score_str = f"{r.score:.0%}" if r.score is not None else "n/a"
            icon = "pass" if r.score and r.score >= 1.0 else "FAIL" if r.score is not None else "    "
            f.write(f"[{icon}] {r.model} {r.runtime} {score_str} | {r.score_details}\n\n")

            output = r.output if r.output else r.error or "(no output)"
            f.write(f"```\n{output}\n```\n\n")

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
                print(f"\n  Skipping {model_cfg['name']} / llama.cpp: model not downloaded. Run with --download first.")
                continue
            if runtime == "mlx" and not is_mlx_cached(model_cfg):
                print(f"\n  Skipping {model_cfg['name']} / mlx: model not downloaded. Run with --download first.")
                continue

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
                            print(f"\n    Skipping tier 2 {cat}: tier 1 pass rate {sum(scores)/len(scores):.0%} < {TIER_1_GATE:.0%}")
                elif tier_num == 3:
                    for cat in categories:
                        scores = cat_scores.get(cat, [])
                        if scores and (sum(scores) / len(scores)) < TIER_2_GATE:
                            skipped_cats.add(cat)
                            if cat not in skipped_cats:
                                print(f"\n    Skipping tier 3 {cat}: cumulative pass rate {sum(scores)/len(scores):.0%} < {TIER_2_GATE:.0%}")

                # Filter to non-skipped prompts for this tier
                active_prompts = [p for p in tier_prompts if p.get("category", "") not in skipped_cats]

                if not active_prompts:
                    continue

                print_header(f"{model_cfg['name']} — {runtime} — Tier {tier_num}")

                if runtime == "llamacpp":
                    batch_results = run_llamacpp_batch(model_cfg, active_prompts, args.max_tokens)
                elif runtime == "mlx":
                    batch_results = run_mlx_batch(model_cfg, active_prompts, args.max_tokens)

                # Match results back to prompt configs and score
                # Results come back in the same order as active_prompts
                for r, pcfg in zip(batch_results, active_prompts):
                    r.prompt_name = pcfg["_key"]  # use unique key
                    score_result(r, pcfg)
                    print_result_summary(r)
                    results.append(r)

                    # Track scores for tier gating
                    if r.score is not None:
                        cat_scores[pcfg.get("category", "")].append(r.score)

    # Final summary
    print_header("SUMMARY")
    print_summary_table(results)

    print_header("PERFORMANCE")
    print_comparison_table(results)

    print_header("SCORES BY CATEGORY")
    print_score_summary(results)

    # Show detailed results for each prompt
    print_header("DETAILED RESULTS")
    for prompt_cfg in prompts:
        key = prompt_cfg["_key"]
        prompt_results = [r for r in results if r.prompt_name == key]
        if not prompt_results:
            continue

        tier = prompt_cfg.get("tier", "?")
        style = prompt_cfg.get("style", "?")
        expected = prompt_cfg.get("expected", "")

        print(f"\n  ── {prompt_cfg['name']} (tier {tier}, {style}, {prompt_cfg.get('category', '')}) ──")
        print(f"  Prompt: {prompt_cfg['prompt'][:120]}{'...' if len(prompt_cfg['prompt']) > 120 else ''}")
        if expected:
            print(f"  Expected: {expected}")

        for r in prompt_results:
            score_str = f"{r.score:.0%}" if r.score is not None else "n/a"
            icon = "pass" if r.score and r.score >= 1.0 else "FAIL" if r.score is not None else "    "
            output = r.output[:200] + ("..." if len(r.output) > 200 else "") if r.output else "(no output)"
            output_oneline = output.replace("\n", "\\n")

            print(f"    [{icon}] {r.model:<30} {r.runtime:<10} {score_str:>5}  | {r.score_details}")
            print(f"           Output: {output_oneline[:120]}")

    # Save
    if not args.no_save:
        save_results(results, RESULTS_DIR, prompts)


if __name__ == "__main__":
    main()
