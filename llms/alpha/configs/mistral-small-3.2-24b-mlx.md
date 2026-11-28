# mistral-small-3.2-24b-mlx: Alpha challenge set

> Mistral-Small-3.2-24B-Instruct-2506 on mlx 4bit, Apple M5 Max 128GB. Pass rate 57.4% ± 9.1 (95% CI), rank 70 of 110, tier 6. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Mistral-Small-3.2-24B-Instruct-2506 (`mlx-community/Mistral-Small-3.2-24B-Instruct-2506-4bit`)
- Runtime: mlx; versions: unknown
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx · t0.7
- Config hash: `5b4d368ce871` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-23T05:13:56.455Z – 2026-07-02T00:28:32.100Z

## Score
- Pass rate: 57.4% ± 9.1 (97/169 items); core 64.6%, stretch 50.6%
- Rank 70 of 110, tier 6 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 52, no_answer 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 30414 total, 180 per item
- Wall time: 1085 s total, 6.4 s per item
- Generation speed: 28.0 tok/s
- Peak memory: 12.9 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 973 | 32 | 30.4 | 12.9 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 7/10 | 70.0% ± 34.6 | 564 | 19 | 30.0 | 12.9 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 17/35 | 48.6% ± 23.8 | 4650 | 173 | 26.8 | 12.9 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 10/26 | 38.5% ± 20.0 | 546 | 21 | 26.2 | 12.9 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 5/7 | 71.4% ± 45.1 | 69 | 3 | 20.2 | 12.9 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 9/26 | 34.6% ± 23.7 | 10490 | 376 | 27.9 | 12.9 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 8/10 | 80.0% ± 30.2 | 470 | 16 | 28.6 | 12.9 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 8/13 | 61.5% ± 30.6 | 998 | 33 | 30.3 | 12.9 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 3/4 | 75.0% | 524 | 16 | 32.6 | 12.9 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 18/26 | 69.2% ± 32.6 | 11130 | 395 | 28.2 | 12.9 |
