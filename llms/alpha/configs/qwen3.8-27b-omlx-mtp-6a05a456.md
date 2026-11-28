# qwen3.8-27b-omlx-mtp: Alpha challenge set

> Qwen3.8-27B-MTP on omlx 4bit, Apple M5 Max 128GB. Pass rate 91.1% ± 5.8 (95% CI), rank 13 of 110, tier 1. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3.8-27B-MTP (`~/.omlx/models/Qwen3.8-27B-4bit-MTP`)
- Runtime: omlx; versions: unknown
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): t0.7
- Config hash: `6a05a4567238` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-08-27T17:11:21.558Z – 2026-08-27T20:00:15.559Z

## Score
- Pass rate: 91.1% ± 5.8 (154/169 items); core 95.1%, stretch 87.4%
- Rank 13 of 110, tier 1 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): thinking_truncated 12, wrong 3

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 206129 total, 1220 per item
- Wall time: 6890 s total, 40.8 s per item
- Generation speed: 29.9 tok/s
- Peak memory: 15.5 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 5116 | 172 | 29.8 | 15.2 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 3462 | 112 | 30.8 | 15.2 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 35/35 | 100.0% ± 0.0 | 11195 | 366 | 30.6 | 15.2 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 22/26 | 84.6% ± 14.9 | 52333 | 1729 | 30.3 | 15.5 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 563 | 21 | 26.6 | 15.5 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 16/26 | 61.5% ± 34.2 | 87108 | 2945 | 29.6 | 15.5 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 1427 | 50 | 28.4 | 15.5 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 1329 | 48 | 28.0 | 15.5 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 500 | 18 | 28.4 | 15.5 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 25/26 | 96.2% ± 8.9 | 43096 | 1429 | 30.1 | 15.5 |
