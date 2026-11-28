# qwen3-32b-mlx-4bit: Alpha challenge set

> Qwen3-32B on mlx 4bit, Apple M5 Max 128GB. Pass rate 72.8% ± 8.8 (95% CI), rank 41 of 110, tier 4. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3-32B (`mlx-community/Qwen3-32B-4bit`)
- Runtime: mlx; versions: unknown
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx · t0.7
- Config hash: `ce2910b49cba` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-21T01:08:05.995Z – 2026-06-28T06:42:02.178Z

## Score
- Pass rate: 72.8% ± 8.8 (123/169 items); core 80.5%, stretch 65.5%
- Rank 41 of 110, tier 4 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): no_answer 31, wrong 3

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 287063 total, 1699 per item
- Wall time: 13342 s total, 78.9 s per item
- Generation speed: 21.5 tok/s
- Peak memory: 17.6 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 11/12 | 91.7% ± 18.3 | 17725 | 806 | 22.0 | 17.6 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 8179 | 372 | 22.0 | 17.6 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 32/35 | 91.4% ± 8.9 | 65895 | 3189 | 20.7 | 17.5 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 17/26 | 65.4% ± 19.6 | 10403 | 450 | 23.1 | 17.6 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 1613 | 69 | 23.3 | 17.5 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 10/26 | 38.5% ± 36.5 | 82357 | 3840 | 21.4 | 17.5 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 9/10 | 90.0% ± 22.6 | 6552 | 282 | 23.2 | 17.5 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 10/13 | 76.9% ± 26.5 | 21120 | 1003 | 21.1 | 17.6 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 6408 | 266 | 24.1 | 17.5 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 15/26 | 57.7% ± 31.7 | 66811 | 3066 | 21.8 | 17.5 |
