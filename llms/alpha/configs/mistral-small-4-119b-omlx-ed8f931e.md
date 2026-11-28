# mistral-small-4-119b-omlx: Alpha challenge set

> Mistral-Small-4-119B-2603 on omlx 4bit, Apple M5 Max 128GB. Pass rate 91.7% ± 4.4 (95% CI), rank 12 of 110, tier 1. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Mistral-Small-4-119B-2603 (`mlx-community/Mistral-Small-4-119B-2603-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 0.7
- Config hash: `ed8f931ec45f` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `5a9b817`
- Samples per item: 1; submitters: local
- Executed: 2026-10-29T08:32:04.655Z – 2026-10-29T10:17:17.127Z

## Score
- Pass rate: 91.7% ± 4.4 (155/169 items); core 89.0%, stretch 94.3%
- Rank 12 of 110, tier 1 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): execution_error 2, near_miss 1, no_answer 1, thinking_truncated 1, wrong 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 315914 total, 1869 per item
- Wall time: 6350 s total, 37.6 s per item
- Generation speed: 49.9 tok/s
- Peak memory: 29.3 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 21552 | 304 | 70.8 | 29.3 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 9/10 | 90.0% ± 22.6 | 5508 | 76 | 72.0 | 29.3 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 35/35 | 100.0% ± 0.0 | 38371 | 561 | 68.4 | 29.3 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 19/26 | 73.1% ± 18.3 | 9147 | 125 | 73.2 | 29.3 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 1059 | 15 | 71.1 | 29.3 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 23/26 | 88.5% ± 19.0 | 160046 | 3881 | 41.5 | 29.3 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 9/10 | 90.0% ± 22.6 | 3435 | 47 | 73.1 | 29.3 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 5394 | 75 | 72.3 | 29.3 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 2210 | 30 | 72.8 | 29.3 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 24/26 | 92.3% ± 11.2 | 69192 | 1235 | 56.0 | 29.3 |
