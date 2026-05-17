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
