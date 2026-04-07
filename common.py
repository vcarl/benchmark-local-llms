"""
Shared types, configuration, and data-loading utilities for the benchmark suite.

This module contains constants, model configs, prompt loading, the BenchmarkResult
dataclass, constraint evaluation, hashing helpers, and file I/O utilities that are
used by both the runner and report modules.
"""

import hashlib
import json
import re
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional

# ── Configuration ──────────────────────────────────────────────────────────

LLAMA_CPP_DIR = Path(__file__).parent / "llama.cpp" / "llama-b8400"
LLAMA_CLI = LLAMA_CPP_DIR / "llama-cli"
LLAMA_SERVER = LLAMA_CPP_DIR / "llama-server"
LLAMA_CACHE_DIR = Path.home() / "Library" / "Caches" / "llama.cpp"
EXECUTION_DIR = Path(__file__).parent / "benchmark-execution"  # per-model cached results
RESULTS_DIR = Path(__file__).parent / "benchmark-results"  # generated reports (markdown)

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

def prompt_key(p: dict) -> str:
    """Build a unique key for a prompt config: name__tTIER_STYLE."""
    return f"{p['name']}__t{p.get('tier', 0)}_{p.get('style', 'default')}"


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
            p["_key"] = prompt_key(p)
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


# ── BenchmarkResult dataclass ──────────────────────────────────────────────

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
    prompt_hash: str = ""  # hash of prompt + system (determines if we need to re-run)
    # ── Game scenario fields (None for prompt-based runs) ──
    scenario_name: Optional[str] = None
    termination_reason: Optional[str] = None  # completed | wall_clock | tokens | tool_calls | error
    tool_call_count: Optional[int] = None
    final_state_summary: Optional[dict] = None
    scenario_hash: Optional[str] = None


# ── Challenge hashing and result caching ───────────────────────────────────

def compute_prompt_hash(prompt_cfg: dict) -> str:
    """Hash of what gets sent to the model — if this changes, we need to re-run."""
    parts = [
        prompt_cfg["prompt"],
        prompt_cfg["system"],
    ]
    blob = "|".join(parts).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()[:12]


def compute_scenario_hash(scenario: "Scenario") -> str:
    """Hash of the scenario inputs that determine the run.

    Includes fixture, scorer config, cutoffs, and player config. Excludes the
    name (so renaming a scenario file does not invalidate cache).
    """
    parts = [
        scenario.fixture,
        scenario.scorer,
        json.dumps(scenario.scorer_params, sort_keys=True),
        json.dumps(scenario.players, sort_keys=True),
        f"{scenario.cutoffs.wall_clock_sec}|{scenario.cutoffs.total_tokens}|{scenario.cutoffs.tool_calls}",
        str(scenario.commander_max_turns),
    ]
    blob = "|".join(parts).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()[:12]


# ── Scenario loader (game benchmarks) ──────────────────────────────────────

SCENARIOS_DIR = Path(__file__).parent / "prompts" / "scenarios"


@dataclass
class ScenarioCutoffs:
    wall_clock_sec: float
    total_tokens: int
    tool_calls: int


@dataclass
class Scenario:
    name: str
    fixture: str
    players: list[dict]
    scorer: str
    cutoffs: ScenarioCutoffs
    scorer_params: dict = field(default_factory=dict)
    commander_max_turns: int = 250

    @property
    def llm_player_id(self) -> str:
        return next(p["id"] for p in self.players if p.get("controlled_by") == "llm")


def load_scenarios(scenarios_dir: Path = SCENARIOS_DIR) -> list[Scenario]:
    """Load all scenario YAML files from a directory.

    Each YAML file contains one scenario (one document, not a list — different
    from prompts which are lists). Files starting with `_` are skipped.
    """
    import yaml
    scenarios: list[Scenario] = []
    if not scenarios_dir.exists():
        return scenarios
    for yaml_file in sorted(scenarios_dir.glob("*.yaml")):
        if yaml_file.name.startswith("_"):
            continue
        with open(yaml_file) as f:
            data = yaml.safe_load(f)
        if not data:
            continue

        llm_players = [p for p in data.get("players", []) if p.get("controlled_by") == "llm"]
        if len(llm_players) != 1:
            raise ValueError(
                f"Scenario {yaml_file.name}: must have exactly one player with "
                f"controlled_by: llm (found {len(llm_players)})"
            )

        cutoffs_raw = data.get("cutoffs", {})
        cutoffs = ScenarioCutoffs(
            wall_clock_sec=float(cutoffs_raw["wall_clock_sec"]),
            total_tokens=int(cutoffs_raw["total_tokens"]),
            tool_calls=int(cutoffs_raw["tool_calls"]),
        )

        scenarios.append(Scenario(
            name=data["name"],
            fixture=data["fixture"],
            players=data["players"],
            scorer=data["scorer"],
            scorer_params=data.get("scorer_params", {}),
            cutoffs=cutoffs,
            commander_max_turns=int(data.get("commander", {}).get("max_turns", 250)),
        ))
    return scenarios


# ── File utilities ─────────────────────────────────────────────────────────

def model_slug(name: str) -> str:
    """Convert model name to filesystem-safe slug."""
    slug = name.lower()
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    slug = slug.strip('-')
    return slug


def results_file_path(model_name: str, runtime: str, output_dir: Path = EXECUTION_DIR) -> Path:
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


def load_all_results(execution_dir: Path = EXECUTION_DIR) -> list[BenchmarkResult]:
    """Load deduplicated results from all JSONL files. Latest entry per prompt wins."""
    if not execution_dir.exists():
        return []
    # Deduplicate: (model, runtime, prompt_name) -> BenchmarkResult, latest wins
    by_key: dict[tuple[str, str, str], BenchmarkResult] = {}
    for f in sorted(execution_dir.glob("*.jsonl")):
        with open(f) as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                d = json.loads(line)
                r = BenchmarkResult(**{k: v for k, v in d.items() if k in BenchmarkResult.__dataclass_fields__})
                by_key[(r.model, r.runtime, r.prompt_name)] = r
    return list(by_key.values())


# Fields persisted to JSONL — execution data only, no scoring
_EXECUTION_FIELDS = {
    "model", "runtime", "prompt_name",
    "prompt_tokens", "generation_tokens", "prompt_tps", "generation_tps",
    "peak_memory_gb", "wall_time_sec",
    "output", "error",
    "prompt_hash",
    # game scenario fields
    "scenario_name", "termination_reason", "tool_call_count",
    "final_state_summary", "scenario_hash",
}


def append_result(result: BenchmarkResult) -> None:
    """Append execution data to the model+runtime JSONL file.

    Only writes execution fields — scoring is done at report time.
    """
    path = results_file_path(result.model, result.runtime)
    record = {k: v for k, v in asdict(result).items() if k in _EXECUTION_FIELDS}
    with open(path, "a") as f:
        f.write(json.dumps(record) + "\n")
