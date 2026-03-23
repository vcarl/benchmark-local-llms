#!/usr/bin/env python3
"""
Migrate historical benchmark JSON files to per-model JSONL format.

Reads benchmark-results/benchmark-*.json files (old format: arrays of result objects),
backfills new fields (tier, style, prompt_text, expected, challenge_hash),
deduplicates, and writes per-model JSONL files.

Usage:
    python migrate_results.py              # Run migration
    python migrate_results.py --dry-run    # Preview without writing
    python migrate_results.py --force      # Overwrite existing JSONL files
"""

import argparse
import glob
import json
import re
import sys
from collections import defaultdict
from dataclasses import asdict
from pathlib import Path

from benchmark import (
    BenchmarkResult,
    PROMPTS,
    compute_challenge_hash,
    model_slug,
    results_file_path,
    SYSTEM_PROMPTS,
)

RESULTS_DIR = Path(__file__).parent / "benchmark-results"


def prompt_key(p: dict) -> str:
    """Reproduce the _key format used in benchmark.py."""
    return f"{p['name']}__t{p.get('tier', 0)}_{p.get('style', 'default')}"


def build_prompt_lookup() -> dict[str, dict]:
    """Build a lookup from prompt _key to prompt config.
    Also builds a secondary lookup by bare name for tier-1 prompts."""
    lookup = {}
    for p in PROMPTS:
        key = prompt_key(p)
        lookup[key] = p
    return lookup


def build_bare_name_lookup() -> dict[str, dict]:
    """Build a lookup from bare prompt name to tier-1 prompt config.
    Used for old-format results that don't have __t{tier}_{style} suffix."""
    lookup = {}
    for p in PROMPTS:
        if p.get("tier", 1) == 1:
            lookup[p["name"]] = p
    return lookup


def parse_prompt_name(prompt_name: str) -> tuple[int, str]:
    """Parse tier and style from prompt_name format: {name}__t{tier}_{style}.

    Returns (tier, style). Falls back to (0, "") if not parseable.
    """
    match = re.search(r"__t(\d+)_(.+)$", prompt_name)
    if match:
        return int(match.group(1)), match.group(2)
    return 0, ""


def find_historical_files() -> list[Path]:
    """Find all benchmark-*.json and benchmark-*.jsonl batch files, sorted by filename."""
    json_files = sorted(glob.glob(str(RESULTS_DIR / "benchmark-*.json")))
    jsonl_files = sorted(glob.glob(str(RESULTS_DIR / "benchmark-*.jsonl")))
    # Interleave by name so timestamp ordering is preserved
    all_files = sorted(set(json_files + jsonl_files))
    return [Path(f) for f in all_files]


def _load_records(filepath: Path) -> list[dict]:
    """Load records from a JSON array file or a JSONL file."""
    records = []
    if filepath.suffix == ".jsonl":
        with open(filepath) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    records.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    else:
        with open(filepath) as f:
            try:
                data = json.load(f)
            except json.JSONDecodeError:
                print(f"  WARNING: Could not parse {filepath.name}, skipping")
                return []
            if not isinstance(data, list):
                print(f"  WARNING: {filepath.name} is not a JSON array, skipping")
                return []
            records = data
    return records


def load_and_backfill(json_files: list[Path], prompt_lookup: dict[str, dict], bare_lookup: dict[str, dict]) -> list[dict]:
    """Load all historical files and backfill missing fields.

    Returns list of (result_dict, source_file_index) tuples.
    """
    all_results = []

    for file_idx, json_file in enumerate(json_files):
        records = _load_records(json_file)

        for rec in records:
            # Normalize runtime (historical data uses "llama.cpp", new code uses "llamacpp")
            if "runtime" in rec:
                rec["runtime"] = rec["runtime"].replace(".", "")

            prompt_name = rec.get("prompt_name", "")

            # Check if this result already has the new fields
            has_new_fields = bool(rec.get("challenge_hash"))

            if not has_new_fields:
                # Parse tier and style from prompt_name
                tier, style = parse_prompt_name(prompt_name)
                rec.setdefault("tier", tier)
                rec.setdefault("style", style)

                # Try to match against current PROMPTS by _key first
                pcfg = prompt_lookup.get(prompt_name)
                # Fallback: bare name match (old format without __t{tier}_{style})
                if not pcfg and "__t" not in prompt_name:
                    pcfg = bare_lookup.get(prompt_name)
                    if pcfg:
                        # Old-format names are tier 1 / direct
                        rec["tier"] = 1
                        rec["style"] = pcfg.get("style", "direct")
                        rec.setdefault("category", pcfg.get("category", ""))
                if pcfg:
                    if not rec.get("prompt_text"):
                        rec["prompt_text"] = pcfg.get("prompt", "")
                    if not rec.get("expected"):
                        rec["expected"] = pcfg.get("expected", "")
                    if not rec.get("challenge_hash"):
                        rec["challenge_hash"] = compute_challenge_hash(pcfg)
                    if not rec.get("category"):
                        rec["category"] = pcfg.get("category", "")
                else:
                    # No matching prompt config — skip this result entirely
                    continue

            # Ensure all BenchmarkResult fields have defaults
            rec.setdefault("category", "")
            rec.setdefault("tier", 0)
            rec.setdefault("style", "")
            rec.setdefault("prompt_text", "")
            rec.setdefault("expected", "")
            rec.setdefault("score", None)
            rec.setdefault("score_details", "")
            rec.setdefault("challenge_hash", "")

            all_results.append((rec, file_idx))

    return all_results


def deduplicate(results_with_idx: list[tuple[dict, int]]) -> list[dict]:
    """Deduplicate results by (model, runtime, prompt_name).

    Prefer results with challenge_hash; among ties, keep the one from the latest file.
    """
    groups: dict[tuple[str, str, str], list[tuple[dict, int]]] = defaultdict(list)

    for rec, file_idx in results_with_idx:
        key = (rec["model"], rec["runtime"], rec["prompt_name"])
        groups[key].append((rec, file_idx))

    deduped = []
    for key, candidates in groups.items():
        # Sort: prefer challenge_hash present (1 > 0), then by file_idx (later = better)
        best = max(candidates, key=lambda x: (1 if x[0].get("challenge_hash") else 0, x[1]))
        deduped.append(best[0])

    return deduped


def build_benchmark_result(rec: dict) -> BenchmarkResult:
    """Construct a BenchmarkResult from a dict, ignoring unknown fields."""
    known_fields = set(BenchmarkResult.__dataclass_fields__.keys())
    filtered = {k: v for k, v in rec.items() if k in known_fields}
    return BenchmarkResult(**filtered)


def group_by_model_runtime(results: list[dict]) -> dict[tuple[str, str], list[dict]]:
    """Group results by (model, runtime)."""
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for rec in results:
        key = (rec["model"], rec["runtime"])
        groups[key].append(rec)
    return groups


def main():
    parser = argparse.ArgumentParser(description="Migrate benchmark JSON to per-model JSONL")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be done without writing")
    parser.add_argument("--force", action="store_true", help="Overwrite existing JSONL files")
    args = parser.parse_args()

    # Step 1: Find historical JSON files
    json_files = find_historical_files()
    if not json_files:
        print("No historical benchmark-*.json files found in benchmark-results/")
        sys.exit(0)

    print(f"Found {len(json_files)} historical JSON files")

    # Build prompt lookups
    prompt_lookup = build_prompt_lookup()
    bare_lookup = build_bare_name_lookup()
    print(f"Loaded {len(prompt_lookup)} prompt configs from YAML ({len(bare_lookup)} tier-1 bare names)")

    # Step 2: Load and backfill
    results_with_idx = load_and_backfill(json_files, prompt_lookup, bare_lookup)
    total_results = len(results_with_idx)
    print(f"Loaded {total_results} total results across all files")

    # Step 3: Deduplicate
    deduped = deduplicate(results_with_idx)
    print(f"After dedup: {len(deduped)} unique results (removed {total_results - len(deduped)} duplicates)")

    # Step 4: Group and write JSONL files
    groups = group_by_model_runtime(deduped)
    print(f"\nWill write {len(groups)} JSONL files:")

    written_files = []
    for (model_name, runtime), recs in sorted(groups.items()):
        filepath = results_file_path(model_name, runtime)
        filename = filepath.name
        print(f"  {filename} ({len(recs)} results)")

        if args.dry_run:
            written_files.append(filename)
            continue

        if filepath.exists() and not args.force:
            print(f"    WARNING: {filename} already exists. Use --force to overwrite. Skipping.")
            continue

        # Build BenchmarkResult objects and serialize
        with open(filepath, "w") as f:
            for rec in recs:
                br = build_benchmark_result(rec)
                f.write(json.dumps(asdict(br)) + "\n")

        written_files.append(filename)

    # Step 5: Summary
    print(f"\n{'=' * 60}")
    print(f"Migration summary:")
    print(f"  Historical files processed: {len(json_files)}")
    print(f"  Total results loaded:       {total_results}")
    print(f"  Unique results after dedup: {len(deduped)}")
    if args.dry_run:
        print(f"  JSONL files (would write):  {len(written_files)}")
        print(f"\n  [DRY RUN] No files were written.")
    else:
        print(f"  JSONL files written:        {len(written_files)}")


if __name__ == "__main__":
    main()
