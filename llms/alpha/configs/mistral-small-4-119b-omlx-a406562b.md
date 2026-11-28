# mistral-small-4-119b-omlx: Alpha challenge set

> Mistral-Small-4-119B-2603 on omlx 4bit, Apple M5 Max 128GB. Pass rate 62.7% ± 8.7 (95% CI), rank 61 of 110, tier 5. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Mistral-Small-4-119B-2603 (`mlx-community/Mistral-Small-4-119B-2603-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 0.7
- Config hash: `a406562b7418` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `5a50116`
- Samples per item: 1; submitters: local
- Executed: 2026-10-29T00:00:57.711Z – 2026-10-29T00:09:36.532Z

## Score
- Pass rate: 62.7% ± 8.7 (106/169 items); core 80.5%, stretch 46.0%
- Rank 61 of 110, tier 5 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 53

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 28975 total, 171 per item
- Wall time: 481 s total, 2.8 s per item
- Generation speed: 60.3 tok/s
- Peak memory: 27.7 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 1228 | 18 | 66.5 | 27.6 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 9/10 | 90.0% ± 22.6 | 469 | 19 | 24.8 | 27.7 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 12/35 | 34.3% ± 17.7 | 569 | 29 | 19.6 | 27.7 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 17/26 | 65.4% ± 19.6 | 711 | 17 | 42.4 | 27.7 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 50 | 3 | 16.8 | 27.7 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 12/26 | 46.2% ± 13.9 | 15051 | 249 | 60.5 | 27.7 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 9/10 | 90.0% ± 22.6 | 367 | 7 | 56.1 | 27.7 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 8/13 | 61.5% ± 30.6 | 631 | 11 | 59.4 | 27.7 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 291 | 4 | 73.9 | 27.7 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 16/26 | 61.5% ± 29.4 | 9608 | 125 | 77.0 | 27.7 |
