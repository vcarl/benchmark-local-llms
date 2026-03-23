"""Recover benchmark results from markdown file back to JSON."""
import json
import re
import sys
from pathlib import Path

md_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("benchmark-results/benchmark-20260322-192640.md")
out_path = md_path.with_suffix(".json")

with open(md_path) as f:
    text = f.read()

# 1. Parse PERFORMANCE table
perf = {}
perf_section = text.split("# PERFORMANCE")[1].split("## ")[0] if "# PERFORMANCE" in text else ""
for line in perf_section.splitlines():
    line = line.rstrip()
    if not line or line.startswith("─") or line.startswith("Model"):
        continue
    # Fixed-width columns: Model(30) Runtime(12) Prompt(22) PP(8) Gen(8) Wall(7) Score(6)
    # But they bleed — use regex from the right side
    m = re.match(r'^(.+?)\s{2,}(\S+)\s{2,}(\S+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)s\s+(\S+)', line)
    if not m:
        continue
    model, runtime, prompt, pp, gen, wall, score_str = m.groups()
    model = model.strip()
    key = (model, runtime, prompt)
    score = None if score_str == "n/a" else float(score_str.rstrip("%")) / 100
    perf[key] = {
        "model": model, "runtime": runtime, "prompt_name": prompt,
        "prompt_tps": float(pp), "generation_tps": float(gen),
        "wall_time_sec": float(wall), "score": score,
    }

# 2. Parse Full Outputs
outputs = {}
full_section = text.split("## Full Outputs")[1] if "## Full Outputs" in text else ""
entries = re.split(r'^### ', full_section, flags=re.MULTILINE)[1:]  # skip pre-header

for entry in entries:
    lines = entry.strip().splitlines()
    if not lines:
        continue
    # Header: "Model / Runtime / PromptName"
    header = lines[0].strip()
    parts = header.split(" / ")
    if len(parts) != 3:
        continue
    model, runtime, prompt = parts

    expected = ""
    score_details = ""
    score = None
    output_lines = []
    in_code = False

    for line in lines[1:]:
        if line.startswith("Expected:"):
            expected = line[len("Expected:"):].strip()
        elif line.startswith("["):
            # [pass] Model Runtime 100% | details
            m2 = re.match(r'\[(pass|FAIL| {4})\]\s+.+?\s+(\d+%|n/a)\s*\|\s*(.*)', line)
            if m2:
                icon, sc, details = m2.groups()
                score = None if sc == "n/a" else float(sc.rstrip("%")) / 100
                score_details = details.strip()
        elif line == "```":
            if in_code:
                in_code = False
            else:
                in_code = True
        elif in_code:
            output_lines.append(line)

    key = (model, runtime, prompt)
    outputs[key] = {
        "output": "\n".join(output_lines),
        "expected": expected,
        "score": score,
        "score_details": score_details,
    }

# 3. Merge
all_keys = set(perf.keys()) | set(outputs.keys())
results = []
for key in sorted(all_keys):
    rec = {
        "model": key[0], "runtime": key[1], "prompt_name": key[2],
        "prompt_tokens": 0, "generation_tokens": 0,
        "prompt_tps": 0.0, "generation_tps": 0.0,
        "peak_memory_gb": 0.0, "wall_time_sec": 0.0,
        "output": "", "error": None,
        "category": "", "score": None, "score_details": "",
    }
    if key in perf:
        rec.update(perf[key])
    if key in outputs:
        rec["output"] = outputs[key]["output"]
        rec["expected"] = outputs[key]["expected"]
        rec["score_details"] = outputs[key]["score_details"]
        if outputs[key]["score"] is not None:
            rec["score"] = outputs[key]["score"]
    results.append(rec)

with open(out_path, "w") as f:
    json.dump(results, f, indent=2)

# Summary
perf_only = set(perf.keys()) - set(outputs.keys())
out_only = set(outputs.keys()) - set(perf.keys())
both = set(perf.keys()) & set(outputs.keys())
models = sorted(set(k[0] for k in all_keys))

print(f"Recovered {len(results)} results to {out_path.name}")
print(f"  Matched (perf+output): {len(both)}")
print(f"  Perf only:             {len(perf_only)}")
print(f"  Output only:           {len(out_only)}")
print(f"  Models: {len(models)}")
for m in models:
    count = sum(1 for k in all_keys if k[0] == m)
    print(f"    {m}: {count}")
