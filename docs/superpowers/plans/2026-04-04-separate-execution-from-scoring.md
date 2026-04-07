# Separate Execution from Scoring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make JSONL files an immutable execution log and move all scoring to report-generation time, so scoring changes never alter stored data.

**Architecture:** JSONL files store only execution data (output, timing, tokens, prompt_hash). Scoring happens fresh each time results are loaded for reporting. The benchmark loop's cache logic simplifies to a prompt_hash check — no eval_hash, no re-scoring, no appending duplicate entries.

**Tech Stack:** Python, existing modules (common.py, runner.py, benchmark.py, report.py)

---

### Task 1: Move `prompt_key` into `common.py` and set `_key` during prompt loading

Currently `prompt_key()` is a local function in `benchmark.py:main()` and `_key` is set manually in the main loop. Report-time scoring needs prompt configs to have `_key` set so they can match against `prompt_name` in JSONL results.

**Files:**
- Modify: `common.py:186-192` (inside `load_prompts`)
- Modify: `benchmark.py:186-192` (remove local `prompt_key` and manual `_key` assignment)

- [ ] **Step 1: Add `prompt_key` to `common.py` and call it in `load_prompts`**

In `common.py`, add `prompt_key` as a module-level function above `load_prompts`, then call it inside the loader:

```python
def prompt_key(p: dict) -> str:
    """Build a unique key for a prompt config: name__tTIER_STYLE."""
    return f"{p['name']}__t{p.get('tier', 0)}_{p.get('style', 'default')}"
```

In `load_prompts`, add this line at the end of the `for p in entries:` loop (after the constraints conversion, before `prompts.append(p)`):

```python
            p["_key"] = prompt_key(p)
```

- [ ] **Step 2: Remove `prompt_key` and manual `_key` assignment from `benchmark.py`**

Remove these lines from `benchmark.py:main()`:

```python
    # Build a unique key for each prompt (name alone is not unique across tiers/styles)
    def prompt_key(p: dict) -> str:
        return f"{p['name']}__t{p.get('tier', 0)}_{p.get('style', 'default')}"

    # Tag each prompt with its key for result matching
    for p in prompts:
        p["_key"] = prompt_key(p)
```

Keep the `prompt_lookup` line since it's still used:

```python
    prompt_lookup = {p["_key"]: p for p in prompts}
```

- [ ] **Step 3: Verify prompts have `_key` set**

```bash
python -c "from common import PROMPTS; print(PROMPTS[0]['_key']); print(len(PROMPTS), 'prompts loaded with _key')"
```

Expected: prints a key like `math_add__t1_direct` and a count.

- [ ] **Step 4: Commit**

```bash
git add common.py benchmark.py
git commit -m "Move prompt_key into common.py, set _key during load_prompts"
```

---

### Task 2: Make `load_all_results` deduplicate

Currently `load_all_results` returns every line from every JSONL file, including duplicates from re-scoring. This causes duplicate entries in HTML reports. Change it to deduplicate by `(model, runtime, prompt_name)`, latest entry wins (same semantics as `load_existing_results`).

**Files:**
- Modify: `common.py:489-503` (`load_all_results`)

- [ ] **Step 1: Rewrite `load_all_results` to deduplicate**

Replace the function body:

```python
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
```

- [ ] **Step 2: Verify dedup works**

```bash
python -c "
from common import load_all_results
results = load_all_results()
keys = [(r.model, r.runtime, r.prompt_name) for r in results]
print(f'{len(results)} results (unique)')
print(f'{len(keys)} keys, {len(set(keys))} unique keys')
assert len(keys) == len(set(keys)), 'DUPLICATES FOUND'
print('No duplicates - OK')
"
```

- [ ] **Step 3: Commit**

```bash
git add common.py
git commit -m "Deduplicate load_all_results by (model, runtime, prompt_name)"
```

---

### Task 3: Add `score_results` helper to `runner.py`

Report-time scoring needs a function that scores a list of `BenchmarkResult` objects against current prompt configs. This is a thin wrapper around `score_result` that handles matching results to prompt configs by `_key`.

**Files:**
- Modify: `runner.py` (add `score_results` function after `score_result`)

- [ ] **Step 1: Add `score_results` function**

Add after the existing `score_result` function (after line ~130):

```python
def score_results(results: list[BenchmarkResult], prompts: list[dict]) -> None:
    """Score all results in-place using current prompt configs."""
    prompt_lookup = {p["_key"]: p for p in prompts}
    for r in results:
        pcfg = prompt_lookup.get(r.prompt_name)
        if pcfg:
            score_result(r, pcfg)
```

- [ ] **Step 2: Verify it works**

```bash
python -c "
from common import load_all_results, load_prompts
from runner import score_results
results = load_all_results()
prompts = load_prompts()
# Clear scores to simulate fresh load
for r in results:
    r.score = None
    r.score_details = ''
score_results(results, prompts)
scored = [r for r in results if r.score is not None]
print(f'{len(scored)}/{len(results)} results scored')
"
```

- [ ] **Step 3: Commit**

```bash
git add runner.py
git commit -m "Add score_results helper for batch scoring at report time"
```

---

### Task 4: Write execution-only fields to JSONL

Change `append_result` to only persist execution data. Scoring fields, prompt metadata, and cache hashes (except `prompt_hash`) are no longer stored. Old JSONL files with extra fields still load fine — the loader filters to known dataclass fields, and missing fields get defaults.

**Files:**
- Modify: `common.py:506-510` (`append_result`)

- [ ] **Step 1: Define execution fields and update `append_result`**

Add a constant above `append_result`:

```python
# Fields persisted to JSONL — execution data only, no scoring
_EXECUTION_FIELDS = {
    "model", "runtime", "prompt_name",
    "prompt_tokens", "generation_tokens", "prompt_tps", "generation_tps",
    "peak_memory_gb", "wall_time_sec",
    "output", "error",
    "prompt_hash",
}
```

Rewrite `append_result`:

```python
def append_result(result: BenchmarkResult) -> None:
    """Append execution data to the model+runtime JSONL file.

    Only writes execution fields — scoring is done at report time.
    """
    path = results_file_path(result.model, result.runtime)
    record = {k: v for k, v in asdict(result).items() if k in _EXECUTION_FIELDS}
    with open(path, "a") as f:
        f.write(json.dumps(record) + "\n")
```

- [ ] **Step 2: Commit**

```bash
git add common.py
git commit -m "Write only execution fields to JSONL, no scoring data"
```

---

### Task 5: Simplify benchmark.py cache logic

Remove all eval_hash comparison branches and re-scoring-with-persist logic. The cache check becomes: "do we have output with a matching prompt_hash?" If yes, skip. Score inline for console display but don't call `append_result` for cached results.

**Files:**
- Modify: `benchmark.py:215-296` (cache logic in main loop)
- Modify: `benchmark.py:22-31` (imports — remove eval_hash, challenge_hash)

- [ ] **Step 1: Update imports**

In `benchmark.py`, change the `common` import to remove `compute_eval_hash` and `compute_challenge_hash`:

```python
from common import (
    LLAMA_CLI,
    EXECUTION_DIR, RESULTS_DIR,
    MODELS, PROMPTS,
    BenchmarkResult,
    load_prompts,
    compute_prompt_hash,
    load_existing_results, load_all_results,
    append_result,
)
```

Add `score_results` to the runner import:

```python
from runner import (
    score_result,
    score_results,
    is_llamacpp_cached, is_mlx_cached,
    start_llamacpp_server, stop_llamacpp_server, run_llamacpp_prompt,
    start_mlx_subprocess, stop_mlx_subprocess, run_mlx_prompt,
    download_models,
)
```

- [ ] **Step 2: Simplify the "all_cached" pre-check (lines 215-246)**

Replace the all_cached check and collection block:

```python
            # Check if all prompts are already cached before starting the model
            existing = load_existing_results(model_cfg["name"], runtime)
            all_cached = all(
                existing.get(pcfg["_key"]) and existing[pcfg["_key"]].prompt_hash == compute_prompt_hash(pcfg)
                for tier_num in tier_order
                for pcfg in tiers[tier_num]
            )

            if all_cached:
                print(f"\n  {model_cfg['name']} / {runtime}: all {len(prompts)} prompts cached, skipping model load")
                for tier_num in tier_order:
                    for pcfg in tiers[tier_num]:
                        cached = existing[pcfg["_key"]]
                        score_result(cached, pcfg)
                        results.append(cached)
                continue
```

- [ ] **Step 3: Simplify the per-prompt cache check (lines 272-296)**

Replace the per-prompt cache block inside the tier loop:

```python
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
```

Note: removed `r.eval_hash`, `r.challenge_hash` assignments and the re-scoring branch entirely.

- [ ] **Step 4: Add scoring to the `--report-only` path**

Replace the `--report-only` block at the top of `main()`:

```python
    if args.report_only:
        prompts = load_prompts()
        all_cached = load_all_results()
        score_results(all_cached, prompts)
        save_html_report(all_cached, RESULTS_DIR, prompts)
        return
```

- [ ] **Step 5: Add scoring before HTML report generation at end of main**

Replace the HTML report section (around line 341-342):

```python
        # HTML report uses all cached execution data, scored fresh
        all_cached = load_all_results()
        score_results(all_cached, prompts)
        save_html_report(all_cached, RESULTS_DIR, prompts)
```

- [ ] **Step 6: Verify the benchmark runs with cached data**

```bash
python benchmark.py --quick --runtime mlx --model-name "Qwen 2.5 7B" --no-save 2>&1 | head -30
```

Expected: should show `[cached]` for all prompts (assuming they've been run before), print scores in the summary tables, and not write any new JSONL lines.

- [ ] **Step 7: Commit**

```bash
git add benchmark.py
git commit -m "Simplify cache to prompt_hash-only, score at report time not storage time"
```

---

### Task 6: Remove dead code

Clean up `_EVAL_VERSION`, `compute_eval_hash`, `compute_challenge_hash`, and the `eval_hash`/`challenge_hash` fields from `BenchmarkResult`. These are no longer used anywhere.

**Files:**
- Modify: `common.py` (remove hash functions, version constant, dataclass fields)

- [ ] **Step 1: Remove `_EVAL_VERSION`, `compute_eval_hash`, `compute_challenge_hash`**

Delete these blocks from `common.py`:

```python
_EVAL_VERSION = "3"  # bump to force re-scoring when scoring logic changes


def compute_eval_hash(prompt_cfg: dict) -> str:
    """Hash of scoring criteria — if this changes, we can re-score cached output."""
    parts = [
        _EVAL_VERSION,
        prompt_cfg.get("expected", ""),
        prompt_cfg.get("scorer", ""),
        prompt_cfg.get("test_code", ""),
        str([c[0] for c in prompt_cfg.get("constraints", [])]),
    ]
    blob = "|".join(parts).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()[:12]


def compute_challenge_hash(prompt_cfg: dict) -> str:
    """Combined hash for backwards compatibility."""
    return compute_prompt_hash(prompt_cfg) + compute_eval_hash(prompt_cfg)
```

- [ ] **Step 2: Remove `eval_hash` and `challenge_hash` from `BenchmarkResult`**

Remove these two lines from the dataclass:

```python
    challenge_hash: str = ""  # legacy combined hash (kept for migration compat)
    eval_hash: str = ""  # hash of scoring criteria (determines if we need to re-score)
```

- [ ] **Step 3: Check for remaining references**

```bash
grep -rn 'eval_hash\|challenge_hash\|compute_eval_hash\|compute_challenge_hash\|_EVAL_VERSION' *.py
```

Expected: no matches in benchmark.py, runner.py, report.py, common.py. (May still appear in `migrate_results.py` — that's OK, it's a legacy script.)

- [ ] **Step 4: Commit**

```bash
git add common.py
git commit -m "Remove eval_hash, challenge_hash, and scoring cache infrastructure"
```

---

### Task 7: Compact existing JSONL files

The existing JSONL files have duplicate entries from past re-scoring runs. Compact each file to keep only the latest entry per `prompt_name`, and strip scoring fields from the output.

**Files:**
- Create: `compact_results.py` (one-time cleanup script)

- [ ] **Step 1: Back up benchmark-execution directory**

```bash
cp -r benchmark-execution benchmark-execution-backup-$(date +%Y%m%d)
```

- [ ] **Step 2: Write the compaction script**

Create `compact_results.py`:

```python
#!/usr/bin/env python3
"""One-time script to compact JSONL files: deduplicate and strip scoring fields."""

import json
from pathlib import Path

EXECUTION_DIR = Path(__file__).parent / "benchmark-execution"

EXECUTION_FIELDS = {
    "model", "runtime", "prompt_name",
    "prompt_tokens", "generation_tokens", "prompt_tps", "generation_tps",
    "peak_memory_gb", "wall_time_sec",
    "output", "error",
    "prompt_hash",
}


def compact_file(path: Path) -> tuple[int, int]:
    """Compact a single JSONL file. Returns (original_count, compacted_count)."""
    records: dict[str, dict] = {}  # prompt_name -> record, latest wins
    original_count = 0

    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            original_count += 1
            d = json.loads(line)
            prompt_name = d.get("prompt_name", "")
            # Keep only execution fields
            clean = {k: v for k, v in d.items() if k in EXECUTION_FIELDS}
            records[prompt_name] = clean

    # Rewrite the file
    with open(path, "w") as f:
        for record in records.values():
            f.write(json.dumps(record) + "\n")

    return original_count, len(records)


def main():
    if not EXECUTION_DIR.exists():
        print("No benchmark-execution directory found.")
        return

    total_before = 0
    total_after = 0

    for jsonl_file in sorted(EXECUTION_DIR.glob("*.jsonl")):
        before, after = compact_file(jsonl_file)
        total_before += before
        total_after += after
        if before != after:
            print(f"  {jsonl_file.name}: {before} -> {after} entries ({before - after} duplicates removed)")
        else:
            print(f"  {jsonl_file.name}: {after} entries (no duplicates)")

    print(f"\nTotal: {total_before} -> {total_after} entries ({total_before - total_after} duplicates removed)")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Run the compaction**

```bash
python compact_results.py
```

Expected: prints per-file stats showing duplicates removed and entries compacted.

- [ ] **Step 4: Verify results still load correctly**

```bash
python -c "
from common import load_all_results, load_prompts
from runner import score_results
results = load_all_results()
prompts = load_prompts()
score_results(results, prompts)
scored = [r for r in results if r.score is not None]
print(f'{len(results)} results loaded, {len(scored)} scored')
"
```

- [ ] **Step 5: Generate a fresh HTML report to verify**

```bash
python benchmark.py --report-only
```

Expected: generates an HTML report in `benchmark-results/` with no errors.

- [ ] **Step 6: Commit**

```bash
git add compact_results.py
git commit -m "Add compaction script, compact existing JSONL files"
```

---

## Verification

After all tasks, run a full check:

```bash
# 1. Verify no scoring data in JSONL
python -c "
import json
from pathlib import Path
for f in sorted(Path('benchmark-execution').glob('*.jsonl')):
    with open(f) as fh:
        for line in fh:
            d = json.loads(line.strip())
            for bad_key in ('score', 'score_details', 'eval_hash', 'challenge_hash'):
                assert bad_key not in d, f'{bad_key} found in {f.name}'
print('All JSONL files clean')
"

# 2. Verify report generation works
python benchmark.py --report-only

# 3. Run a quick benchmark to verify execution + inline scoring
python benchmark.py --quick --runtime mlx --model-name "Qwen 2.5 7B" --no-save
```
