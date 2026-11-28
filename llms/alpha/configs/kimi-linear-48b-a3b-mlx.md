# kimi-linear-48b-a3b-mlx: Alpha challenge set

> Kimi-Linear-48B-A3B-Instruct on mlx 4bit, Apple M5 Max 128GB. Pass rate 50.3% ± 11.2 (95% CI), rank 75 of 110, tier 6. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Kimi-Linear-48B-A3B-Instruct (`mlx-community/Kimi-Linear-48B-A3B-Instruct-4bit`)
- Runtime: mlx; versions: mlx-lm 0.31.3, unknown
- Quant: 4bit; temperature 0.7
- Config hash: `20a6427343c4` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `2212237`, `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-25T19:41:09.756Z – 2026-11-17T10:03:27.173Z

## Score
- Pass rate: 50.3% ± 11.2 (85/169 items); core 80.5%, stretch 21.8%
- Rank 75 of 110, tier 6 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: partial; challenges 8/10, items 108/169
- Failures (sample lines): wrong 7, loop 5, near_miss 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 6385 total, 59 per item
- Wall time: 370 s total, 3.4 s per item
- Generation speed: 104.6 tok/s
- Peak memory: 26.0 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 933 | 10 | 93.0 | 25.9 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 388 | 4 | 100.2 | 25.9 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | interrupted | 0/35 | 0.0% ± 0.0 | — | — | — | — |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 18/26 | 69.2% ± 19.0 | 593 | 7 | 81.9 | 26.0 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 27 | 1 | 32.3 | 26.0 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | interrupted | 0/26 | 0.0% ± 0.0 | — | — | — | — |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 9/10 | 90.0% ± 22.6 | 430 | 5 | 93.5 | 26.0 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 8/13 | 61.5% ± 30.6 | 295 | 3 | 86.6 | 26.0 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 374 | 3 | 113.9 | 26.0 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 19/26 | 73.1% ± 21.2 | 3345 | 337 | 120.5 | 26.0 |
