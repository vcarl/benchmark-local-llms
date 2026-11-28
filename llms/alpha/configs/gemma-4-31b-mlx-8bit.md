# gemma-4-31b-mlx-8bit: Alpha challenge set

> gemma-4-31b-it on mlx 8bit, Apple M5 Max 128GB. Pass rate 88.8% ± 5.5 (95% CI), rank 16 of 110, tier 2. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: gemma-4-31b-it (`mlx-community/gemma-4-31b-it-8bit`)
- Runtime: mlx; versions: unknown
- Quant: 8bit; temperature 0.7
- Config hash: `fcdbfcebe557` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-24T07:19:16.176Z – 2026-07-01T17:15:00.759Z

## Score
- Pass rate: 88.8% ± 5.5 (150/169 items); core 91.5%, stretch 86.2%
- Rank 16 of 110, tier 2 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): execution_error 9, wrong 2, no_answer 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 116052 total, 687 per item
- Wall time: 11823 s total, 70.0 s per item
- Generation speed: 12.7 tok/s
- Peak memory: 31.6 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 9172 | 653 | 14.1 | 31.6 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 10401 | 742 | 14.0 | 31.6 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 35/35 | 100.0% ± 0.0 | 21456 | 1732 | 12.4 | 31.6 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 21/26 | 80.8% ± 16.2 | 11832 | 848 | 14.0 | 31.6 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 732 | 55 | 13.3 | 31.6 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 19/26 | 73.1% ± 29.8 | 29632 | 3923 | 12.3 | 31.6 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 2518 | 183 | 13.8 | 31.6 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 4200 | 310 | 13.6 | 31.6 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 1677 | 126 | 13.3 | 31.6 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 21/26 | 80.8% ± 16.2 | 24432 | 3251 | 11.9 | 31.6 |
