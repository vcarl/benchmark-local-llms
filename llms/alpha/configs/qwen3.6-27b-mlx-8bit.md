# qwen3.6-27b-mlx-8bit: Alpha challenge set

> Qwen3.6-27B on mlx 8bit, Apple M5 Max 128GB. Pass rate 37.9% ± 10.3 (95% CI), rank 89 of 110, tier 7. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3.6-27B (`mlx-community/Qwen3.6-27B-8bit`)
- Runtime: mlx; versions: unknown
- Quant: 8bit; temperature 0.7
- Config hash: `217855715791` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-24T01:22:50.872Z – 2026-06-24T02:44:04.561Z

## Score
- Pass rate: 37.9% ± 10.3 (64/169 items); core 78.0%, stretch 0.0%
- Rank 89 of 110, tier 7 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: partial; challenges 6/10, items 70/169
- Failures (sample lines): none

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 67130 total, 959 per item
- Wall time: 3804 s total, 54.3 s per item
- Generation speed: 17.6 tok/s
- Peak memory: 27.3 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | interrupted | 0/12 | 0.0% ± 0.0 | — | — | — | — |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 14854 | 844 | 17.6 | 27.3 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | stale_hash | 0/35 | 0.0% ± 0.0 | — | — | — | — |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 20/26 | 76.9% ± 17.4 | 31147 | 1766 | 17.6 | 27.3 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 1901 | 109 | 17.4 | 27.3 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | interrupted | 0/26 | 0.0% ± 0.0 | — | — | — | — |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 6062 | 343 | 17.7 | 27.3 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 9567 | 539 | 17.7 | 27.3 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 3599 | 202 | 17.8 | 27.3 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | stale_hash | 0/26 | 0.0% ± 0.0 | — | — | — | — |
