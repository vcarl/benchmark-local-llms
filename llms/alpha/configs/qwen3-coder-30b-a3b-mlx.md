# qwen3-coder-30b-a3b-mlx: Alpha challenge set

> Qwen3-Coder-30B-A3B-Instruct on mlx 4bit, Apple M5 Max 128GB. Pass rate 33.7% ± 8.4 (95% CI), rank 92 of 110, tier 7. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3-Coder-30B-A3B-Instruct (`mlx-community/Qwen3-Coder-30B-A3B-Instruct-4bit`)
- Runtime: mlx; versions: mlx-lm 0.31.3, unknown
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx
- Config hash: `14df9b0bf092` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `2212237`, `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-25T06:04:05.743Z – 2026-11-17T10:15:49.090Z

## Score
- Pass rate: 33.7% ± 8.4 (57/169 items); core 40.2%, stretch 27.6%
- Rank 92 of 110, tier 7 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: partial; challenges 7/10, items 95/169
- Failures (sample lines): loop 15, wrong 15, length_cutoff 1, near_miss 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 22084 total, 232 per item
- Wall time: 553 s total, 5.8 s per item
- Generation speed: 118.0 tok/s
- Peak memory: 16.4 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 10/12 | 83.3% ± 24.7 | 1029 | 11 | 94.7 | 16.4 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 7/10 | 70.0% ± 34.6 | 540 | 6 | 95.1 | 16.4 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | interrupted | 0/35 | 0.0% ± 0.0 | — | — | — | — |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | interrupted | 0/26 | 0.0% ± 0.0 | — | — | — | — |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 5/7 | 71.4% ± 45.1 | 281 | 3 | 88.4 | 16.4 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 10/26 | 38.5% ± 26.4 | 6370 | 260 | 125.1 | 16.4 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 9/10 | 90.0% ± 22.6 | 987 | 9 | 110.3 | 16.4 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | interrupted | 0/13 | 0.0% ± 0.0 | — | — | — | — |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 2/4 | 50.0% | 563 | 5 | 119.9 | 16.4 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 14/26 | 53.8% ± 22.9 | 12314 | 260 | 119.7 | 16.4 |
