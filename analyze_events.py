#!/usr/bin/env python3
"""Analyze game scenario events from benchmark JSONL files."""

import argparse
import glob
import json
from collections import Counter, defaultdict


QUERY_PREFIXES = (
    "get_",
    "find_route",
    "search_systems",
    "view_market",
    "view_orders",
    "catalog",
)


def is_query_command(tool_name):
    """Return True if the tool is a read-only query (not an action)."""
    # Strip namespace prefix like "spacemolt/"
    name = tool_name.split("/")[-1] if "/" in tool_name else tool_name
    return any(name.startswith(p) for p in QUERY_PREFIXES)


def load_records(files, scenario_filter=None, model_filter=None):
    records = []
    for path in files:
        try:
            with open(path) as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        r = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    # Must have scenario_name and events to be a game scenario run
                    if not r.get("scenario_name") or r.get("events") is None:
                        continue
                    if scenario_filter and r["scenario_name"] != scenario_filter:
                        continue
                    if model_filter and r.get("model") != model_filter:
                        continue
                    records.append(r)
        except OSError as e:
            print(f"Warning: could not read {path}: {e}")
    return records


def fmt_table(headers, rows, col_sep="  "):
    """Print a plain-text aligned table."""
    col_widths = [len(h) for h in headers]
    str_rows = []
    for row in rows:
        str_row = [str(v) for v in row]
        str_rows.append(str_row)
        for i, v in enumerate(str_row):
            col_widths[i] = max(col_widths[i], len(v))

    def fmt_row(cells):
        return col_sep.join(c.ljust(col_widths[i]) for i, c in enumerate(cells))

    print(fmt_row(headers))
    print(col_sep.join("-" * w for w in col_widths))
    for row in str_rows:
        print(fmt_row(row))


# ---------------------------------------------------------------------------
# Section 1: Overview table
# ---------------------------------------------------------------------------

def print_overview(records):
    print("\n" + "=" * 70)
    print("OVERVIEW: score / tool_calls / tool_errors / termination per run")
    print("=" * 70)

    # Group by scenario then model
    by_scenario = defaultdict(list)
    for r in records:
        by_scenario[r["scenario_name"]].append(r)

    for scenario, runs in sorted(by_scenario.items()):
        print(f"\nScenario: {scenario}")
        headers = ["model", "runtime", "score", "tool_calls", "tool_errors", "termination"]
        rows = []
        for r in sorted(runs, key=lambda x: (x.get("model", ""), x.get("runtime", ""))):
            events = r.get("events") or []
            tool_errors = sum(1 for e in events if e.get("event") == "tool_error")
            rows.append([
                r.get("model", "?"),
                r.get("runtime", "?"),
                r.get("score", ""),
                r.get("tool_call_count", ""),
                tool_errors,
                r.get("termination_reason", ""),
            ])
        fmt_table(headers, rows)


# ---------------------------------------------------------------------------
# Section 2: Error analysis
# ---------------------------------------------------------------------------

def print_error_analysis(records):
    print("\n" + "=" * 70)
    print("ERROR ANALYSIS: failing commands, bad arg names, first errors")
    print("=" * 70)

    by_scenario = defaultdict(list)
    for r in records:
        by_scenario[r["scenario_name"]].append(r)

    for scenario, runs in sorted(by_scenario.items()):
        print(f"\nScenario: {scenario}")

        error_tools = Counter()
        error_arg_names = Counter()
        first_errors = []

        for r in runs:
            events = r.get("events") or []
            found_first = False
            for e in events:
                if e.get("event") == "tool_error":
                    tool = e.get("data", {}).get("tool", "unknown")
                    tool_short = tool.split("/")[-1] if "/" in tool else tool
                    error_tools[tool_short] += 1
                    # Collect arg key names to surface wrong guesses
                    args = e.get("data", {}).get("args", {}) or {}
                    for k in args:
                        error_arg_names[k] += 1
                    if not found_first:
                        found_first = True
                        first_errors.append((r.get("model", "?"), r.get("runtime", "?"), tool_short))

        if error_tools:
            print("  Most common failing commands:")
            for tool, count in error_tools.most_common(10):
                print(f"    {count:3d}x  {tool}")
        else:
            print("  No tool_error events found.")

        if error_arg_names:
            print("  Most common arg names in errors (wrong guesses):")
            for k, count in error_arg_names.most_common(10):
                print(f"    {count:3d}x  {k}")

        if first_errors:
            print("  First error per run:")
            for model, runtime, tool in sorted(first_errors):
                print(f"    [{runtime}] {model}: {tool}")


# ---------------------------------------------------------------------------
# Section 3: Command success rates
# ---------------------------------------------------------------------------

def print_success_rates(records):
    print("\n" + "=" * 70)
    print("COMMAND SUCCESS RATES: tool_call vs tool_error per command")
    print("=" * 70)

    by_scenario = defaultdict(list)
    for r in records:
        by_scenario[r["scenario_name"]].append(r)

    for scenario, runs in sorted(by_scenario.items()):
        print(f"\nScenario: {scenario}")

        calls = Counter()
        errors = Counter()

        for r in runs:
            events = r.get("events") or []
            for e in events:
                tool = e.get("data", {}).get("tool", "unknown")
                tool_short = tool.split("/")[-1] if "/" in tool else tool
                if e.get("event") == "tool_call":
                    calls[tool_short] += 1
                elif e.get("event") == "tool_error":
                    errors[tool_short] += 1

        all_tools = set(calls) | set(errors)
        if not all_tools:
            print("  No tool events found.")
            continue

        rows = []
        for tool in all_tools:
            c = calls[tool]
            err = errors[tool]
            total = c + err
            rate = err / total if total else 0.0
            rows.append((tool, c, err, total, rate))

        # Sort by error rate descending, then by total descending
        rows.sort(key=lambda x: (-x[4], -x[3]))

        headers = ["command", "calls", "errors", "total", "error_rate"]
        fmt_rows = [
            [tool, c, err, total, f"{rate:.0%}"]
            for tool, c, err, total, rate in rows
        ]
        fmt_table(headers, fmt_rows)


# ---------------------------------------------------------------------------
# Section 4: Orientation cost
# ---------------------------------------------------------------------------

def print_orientation_cost(records):
    print("\n" + "=" * 70)
    print("ORIENTATION COST: events before first non-query action")
    print("=" * 70)

    by_scenario = defaultdict(list)
    for r in records:
        by_scenario[r["scenario_name"]].append(r)

    for scenario, runs in sorted(by_scenario.items()):
        print(f"\nScenario: {scenario}")

        headers = ["model", "runtime", "events_before_first_action", "first_action"]
        rows = []

        for r in sorted(runs, key=lambda x: (x.get("model", ""), x.get("runtime", ""))):
            events = r.get("events") or []
            count = 0
            first_action = None
            for e in events:
                tool = e.get("data", {}).get("tool", "")
                tool_short = tool.split("/")[-1] if "/" in tool else tool
                if e.get("event") in ("tool_call", "tool_error"):
                    if not is_query_command(tool_short):
                        first_action = tool_short
                        break
                count += 1
            if first_action is None:
                # Never made a non-query action
                count = len(events)

            rows.append([
                r.get("model", "?"),
                r.get("runtime", "?"),
                count,
                first_action or "(none)",
            ])

        fmt_table(headers, rows)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Analyze game scenario events from benchmark JSONL files."
    )
    parser.add_argument("--scenario", metavar="NAME", help="Filter to a specific scenario name")
    parser.add_argument("--model", metavar="NAME", help="Filter to a specific model name")
    parser.add_argument("files", nargs="*", metavar="FILE", help="JSONL files to analyze")
    args = parser.parse_args()

    if args.files:
        files = args.files
    else:
        files = sorted(glob.glob("benchmark-execution/*.jsonl"))

    if not files:
        print("No JSONL files found.")
        return

    records = load_records(files, scenario_filter=args.scenario, model_filter=args.model)

    if not records:
        print("No game scenario records with events found in the given files.")
        print("(Records need both 'scenario_name' and 'events' fields.)")
        return

    scenarios = sorted(set(r["scenario_name"] for r in records))
    models = sorted(set(r.get("model", "?") for r in records))
    print(f"Loaded {len(records)} game scenario runs")
    print(f"Scenarios: {', '.join(scenarios)}")
    print(f"Models: {', '.join(models)}")

    print_overview(records)
    print_error_analysis(records)
    print_success_rates(records)
    print_orientation_cost(records)
    print()


if __name__ == "__main__":
    main()
