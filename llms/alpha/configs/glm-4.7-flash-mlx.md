# glm-4.7-flash-mlx: Alpha challenge set

> GLM-4.7-Flash on mlx 4bit, Apple M5 Max 128GB. Pass rate 39.1% ± 9.6 (95% CI), rank 88 of 110, tier 7. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: GLM-4.7-Flash (`mlx-community/GLM-4.7-Flash-4bit`)
- Runtime: mlx; versions: unknown
- Quant: 4bit; temperature 0.6
- Variant (what sets it apart from the model's other rows): runtime mlx · t0.6
- Config hash: `8d45d94d67f7` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-23T04:05:07.405Z – 2026-07-01T23:44:47.047Z

## Score
- Pass rate: 39.1% ± 9.6 (66/169 items); core 58.5%, stretch 20.7%
- Rank 88 of 110, tier 7 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): no_answer 78, wrong 3

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 787218 total, 4658 per item
- Wall time: 13785 s total, 81.6 s per item
- Generation speed: 57.1 tok/s
- Peak memory: 16.4 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 10/12 | 83.3% ± 24.7 | 26232 | 348 | 75.4 | 16.4 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 6/10 | 60.0% ± 36.9 | 39292 | 493 | 79.6 | 16.4 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 11/35 | 31.4% ± 19.6 | 195626 | 3671 | 53.3 | 16.4 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 11/26 | 42.3% ± 20.4 | 60241 | 751 | 80.2 | 16.4 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 1141 | 13 | 84.9 | 16.4 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 4/26 | 15.4% ± 35.9 | 180778 | 3448 | 52.4 | 16.4 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 7/10 | 70.0% ± 34.6 | 18113 | 479 | 37.8 | 16.4 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 5/13 | 38.5% ± 30.6 | 58285 | 723 | 80.6 | 16.4 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 2/4 | 50.0% | 17353 | 216 | 80.5 | 16.4 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 3/26 | 11.5% ± 20.9 | 190157 | 3643 | 52.2 | 16.4 |
