# qwq-32b-mlx-8bit: Alpha challenge set

> QwQ-32B on mlx 8bit, Apple M5 Max 128GB. Pass rate 69.8% ± 9.5 (95% CI), rank 45 of 110, tier 5. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: QwQ-32B (`mlx-community/QwQ-32B-8bit`)
- Runtime: mlx; versions: unknown
- Quant: 8bit; temperature 0.6
- Config hash: `7fbcb94f99ba` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-24T05:43:39.329Z – 2026-06-30T08:31:27.044Z

## Score
- Pass rate: 69.8% ± 9.5 (118/169 items); core 79.3%, stretch 60.9%
- Rank 45 of 110, tier 5 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): execution_error 32, wrong 3

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 125662 total, 744 per item
- Wall time: 19385 s total, 114.7 s per item
- Generation speed: 13.3 tok/s
- Peak memory: 32.8 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 11/12 | 91.7% ± 18.3 | 12526 | 1153 | 14.7 | 32.8 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 5447 | 363 | 15.0 | 32.8 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 33/35 | 94.3% ± 11.2 | 46056 | 4317 | 12.4 | 32.8 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 13/26 | 50.0% ± 20.6 | 15079 | 1013 | 14.9 | 32.8 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 1425 | 97 | 14.6 | 32.8 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 7/26 | 26.9% ± 30.2 | 12286 | 6366 | 13.1 | 32.8 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 9/10 | 90.0% ± 22.6 | 6101 | 450 | 13.6 | 32.8 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 9475 | 631 | 15.0 | 32.8 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 3375 | 226 | 14.9 | 32.8 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 13/26 | 50.0% ± 31.5 | 13892 | 4770 | 12.1 | 32.8 |
