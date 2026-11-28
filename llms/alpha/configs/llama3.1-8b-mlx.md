# llama3.1-8b-mlx: Alpha challenge set

> Meta-Llama-3.1-8B-Instruct on mlx 4bit, Apple M5 Max 128GB. Pass rate 45.0% ± 8.7 (95% CI), rank 81 of 110, tier 7. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Meta-Llama-3.1-8B-Instruct (`mlx-community/Meta-Llama-3.1-8B-Instruct-4bit`)
- Runtime: mlx; versions: unknown
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx · t0.7 · topP default
- Config hash: `59f7afbe1082` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-20T22:16:46.195Z – 2026-06-28T01:40:41.354Z

## Score
- Pass rate: 45.0% ± 8.7 (76/169 items); core 56.1%, stretch 34.5%
- Rank 81 of 110, tier 7 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 71

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 26217 total, 155 per item
- Wall time: 284 s total, 1.7 s per item
- Generation speed: 92.3 tok/s
- Peak memory: 4.6 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 827 | 9 | 87.9 | 4.5 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 7/10 | 70.0% ± 34.6 | 557 | 7 | 83.2 | 4.5 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 13/35 | 37.1% ± 24.0 | 3810 | 42 | 90.6 | 4.6 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 7/26 | 26.9% ± 18.3 | 572 | 9 | 64.8 | 4.5 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 6/7 | 85.7% ± 35.0 | 42 | 2 | 22.9 | 4.5 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 8/26 | 30.8% ± 23.2 | 8927 | 93 | 95.6 | 4.6 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 4/10 | 40.0% ± 36.9 | 379 | 5 | 73.3 | 4.5 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 6/13 | 46.2% ± 31.4 | 389 | 6 | 69.6 | 4.5 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 619 | 6 | 102.4 | 4.5 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 9/26 | 34.6% ± 26.8 | 10095 | 105 | 96.0 | 4.6 |
