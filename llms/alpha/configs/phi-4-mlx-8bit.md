# phi-4-mlx-8bit: Alpha challenge set

> phi-4 on mlx 8bit, Apple M5 Max 128GB. Pass rate 62.7% ± 8.7 (95% CI), rank 60 of 110, tier 5. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: phi-4 (`mlx-community/phi-4-8bit`)
- Runtime: mlx; versions: unknown
- Quant: 8bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx · t0.7
- Config hash: `066f61589f63` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-24T08:23:13.713Z – 2026-07-01T18:04:55.951Z

## Score
- Pass rate: 62.7% ± 8.7 (106/169 items); core 67.1%, stretch 58.6%
- Rank 60 of 110, tier 5 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 43

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 34008 total, 201 per item
- Wall time: 1195 s total, 7.1 s per item
- Generation speed: 28.4 tok/s
- Peak memory: 14.8 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 1182 | 38 | 30.7 | 14.8 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 590 | 20 | 30.0 | 14.8 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 18/35 | 51.4% ± 28.4 | 5149 | 189 | 27.2 | 14.8 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 8/26 | 30.8% ± 19.0 | 824 | 29 | 28.0 | 14.8 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 46 | 3 | 17.6 | 14.8 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 14/26 | 53.8% ± 17.4 | 12350 | 436 | 28.4 | 14.8 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 587 | 20 | 29.5 | 14.8 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 7/13 | 53.8% ± 31.4 | 701 | 24 | 29.7 | 14.8 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 3/4 | 75.0% | 590 | 18 | 32.0 | 14.8 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 19/26 | 73.1% ± 25.2 | 11989 | 419 | 28.6 | 14.8 |
