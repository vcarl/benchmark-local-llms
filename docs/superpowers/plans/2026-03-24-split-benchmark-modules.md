# Split benchmark.py Into Modules — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the 1888-line `benchmark.py` into three focused modules so reporting, execution, and orchestration are independently maintainable — and fix the HTML rendering bugs caused by f-string double-brace escaping.

**Architecture:** Three modules: `common.py` (shared types, config, data loading), `runner.py` (runtime management, scoring, execution), `report.py` (HTML, markdown, and terminal output). `benchmark.py` stays as the thin CLI entry point that imports the others.

**Tech Stack:** Python stdlib only (same as today). HTML template uses `string.Template` substitution to avoid f-string brace escaping.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `common.py` | `BenchmarkResult` dataclass, `MODELS`, `SYSTEM_PROMPTS`, `PROMPTS_DIR`, `EXECUTION_DIR`, `RESULTS_DIR`, path constants, `LLAMA_*` constants, `load_prompts()`, constraint evaluator, hash functions, `model_slug()`, `results_file_path()`, `load_existing_results()`, `load_all_results()`, `append_result()` |
| `runner.py` | `extract_code()`, `run_code_with_tests()`, scoring functions (`score_result`, `_score_exact_match`, `_score_constraints`, `_score_code_exec`), cache checking (`is_llamacpp_cached`, `is_mlx_cached`), server management (`start/stop_llamacpp_server`, `start/stop_mlx_subprocess`), prompt execution (`run_llamacpp_prompt`, `run_mlx_prompt`), model downloading (`download_*`) |
| `report.py` | `print_header()`, `print_result_summary()`, `print_summary_table()`, `print_comparison_table()`, `print_score_summary()`, `print_output_comparison()`, `print_detailed_results()`, `save_markdown_report()`, `save_html_report()` |
| `benchmark.py` | CLI arg parsing, model/prompt filtering, the benchmark execution loop (`main()`), imports from the other three |

---

### Task 1: Create `common.py` — shared types, config, and data loading

**Files:**
- Create: `common.py`
- Modify: `benchmark.py` (remove moved code, add `from common import *`)

- [ ] **Step 1: Create `common.py`**

Move these sections from `benchmark.py` into `common.py`:
- All imports needed by these functions (`argparse` excluded — that stays in `benchmark.py`)
- Constants: `LLAMA_CPP_DIR`, `LLAMA_CLI`, `LLAMA_SERVER`, `LLAMA_CACHE_DIR`, `EXECUTION_DIR`, `RESULTS_DIR`, `MODELS`, `SYSTEM_PROMPTS`, `PROMPTS_DIR`
- Constraint evaluator: `_try_parse_json()`, `evaluate_constraint()`
- Prompt loader: `load_prompts()`, the module-level `PROMPTS = load_prompts()` call
- Legacy aliases: `_json_has_keys()`, `_json_all_string_values()`, `_count_sentences()`
- `BenchmarkResult` dataclass
- Hash functions: `compute_prompt_hash()`, `compute_eval_hash()`, `compute_challenge_hash()`
- File utilities: `model_slug()`, `results_file_path()`, `load_existing_results()`, `load_all_results()`, `append_result()`

Lines in benchmark.py: 1-531 (minus the module docstring and `argparse`/`signal` imports which stay).

- [ ] **Step 2: Update `benchmark.py` imports**

Replace the moved code in `benchmark.py` with:
```python
from common import (
    MODELS, PROMPTS, LLAMA_CLI, EXECUTION_DIR, RESULTS_DIR,
    BenchmarkResult, load_prompts, load_all_results, load_existing_results,
    compute_prompt_hash, compute_eval_hash, compute_challenge_hash,
    append_result, score_result,
)
```

Wait — `score_result` goes in `runner.py`. For now just import everything `benchmark.py` needs from `common.py`.

- [ ] **Step 3: Verify it still runs**

Run: `python benchmark.py --help`
Expected: help output, no import errors.

- [ ] **Step 4: Commit**

```bash
git add common.py benchmark.py
git commit -m "refactor: extract common.py with shared types, config, and data loading"
```

---

### Task 2: Create `runner.py` — execution and scoring

**Files:**
- Create: `runner.py`
- Modify: `benchmark.py` (remove moved code, add imports from `runner`)

- [ ] **Step 1: Create `runner.py`**

Move these sections from `benchmark.py` into `runner.py`:
- `extract_code()`, `run_code_with_tests()`
- All scoring: `score_result()`, `_score_exact_match()`, `_score_constraints()`, `_score_code_exec()`
- Cache checking: `is_llamacpp_cached()`, `is_mlx_cached()`
- Server management: `_wait_for_server()`, `_chat_completion()`, `start_llamacpp_server()`, `stop_llamacpp_server()`, `run_llamacpp_prompt()`
- MLX management: `start_mlx_subprocess()`, `stop_mlx_subprocess()`, `run_mlx_prompt()`
- Download: `download_llamacpp_model()`, `download_mlx_model()`, `download_models()`

Add at top of `runner.py`:
```python
from common import (
    BenchmarkResult, LLAMA_CLI, LLAMA_SERVER, LLAMA_CACHE_DIR,
    EXECUTION_DIR, MODELS, extract_code,
)
```

(Adjust imports as needed — the key is `runner.py` imports from `common.py`, never from `benchmark.py`.)

Lines in benchmark.py: 535-1089.

- [ ] **Step 2: Update `benchmark.py` imports**

Add imports from `runner`:
```python
from runner import (
    score_result, is_llamacpp_cached, is_mlx_cached,
    start_llamacpp_server, stop_llamacpp_server, run_llamacpp_prompt,
    start_mlx_subprocess, stop_mlx_subprocess, run_mlx_prompt,
    download_models,
)
```

- [ ] **Step 3: Verify it still runs**

Run: `python benchmark.py --help`
Expected: help output, no import errors.

- [ ] **Step 4: Commit**

```bash
git add runner.py benchmark.py
git commit -m "refactor: extract runner.py with execution, scoring, and runtime management"
```

---

### Task 3: Create `report.py` — all reporting and output

**Files:**
- Create: `report.py`
- Modify: `benchmark.py` (remove moved code, add imports from `report`)

- [ ] **Step 1: Create `report.py`**

Move these sections from `benchmark.py` into `report.py`:
- `print_header()`, `print_result_summary()`, `print_summary_table()`, `print_comparison_table()`, `print_score_summary()`, `print_output_comparison()`, `print_detailed_results()`
- `save_markdown_report()`
- `save_html_report()`

Lines in benchmark.py: 1091-1623.

**Critical fix for `save_html_report()`:** Convert the HTML from an f-string to `string.Template`. This eliminates all `{{`/`}}` escaping. The function currently builds HTML as an f-string with `{data_json}` and `{date_display}` as the only substitutions. Replace with:

```python
import string

HTML_TEMPLATE = string.Template("""<!DOCTYPE html>
<html lang="en">
...
<script>const DATA = $data_json;</script>
...
""")

def save_html_report(results, output_dir, prompts):
    ...
    html = HTML_TEMPLATE.substitute(
        data_json=data_json,
        date_display=date_display,
    )
```

All CSS `{` and `}` become literal — no escaping needed. All JS `{` and `}` become literal. The only `$` signs that need escaping are literal `$` in the template (unlikely in this HTML).

- [ ] **Step 2: Update `benchmark.py` imports**

```python
from report import (
    print_header, print_result_summary, print_summary_table,
    print_comparison_table, print_score_summary, print_detailed_results,
    save_markdown_report, save_html_report,
)
```

- [ ] **Step 3: Verify the HTML renders correctly**

Run: `python benchmark.py --report-only`
Expected: generates an HTML file. Open it — the two side-by-side heatmaps should render with correct CSS (no double-brace artifacts).

- [ ] **Step 4: Commit**

```bash
git add report.py benchmark.py
git commit -m "refactor: extract report.py, fix HTML rendering by switching from f-string to string.Template"
```

---

### Task 4: Clean up `benchmark.py` — verify it's a thin CLI entry point

**Files:**
- Modify: `benchmark.py`

- [ ] **Step 1: Clean up `benchmark.py`**

After tasks 1-3, `benchmark.py` should contain only:
- Module docstring
- `import argparse, signal, sys` and imports from `common`, `runner`, `report`
- `def main()` — arg parsing, model/prompt filtering, the benchmark loop, summary output, saving
- `if __name__ == "__main__": main()`

Remove any dead imports, leftover comments about moved code, etc. Remove the `from collections import defaultdict` that's inside `main()` — move it to the top or inline it.

- [ ] **Step 2: Verify full functionality**

Run: `python benchmark.py --report-only`
Expected: HTML report generates correctly.

Run: `python benchmark.py --help`
Expected: all flags shown.

- [ ] **Step 3: Commit**

```bash
git add benchmark.py
git commit -m "refactor: benchmark.py is now a thin CLI entry point"
```
