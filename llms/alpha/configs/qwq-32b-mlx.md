# qwq-32b-mlx: Alpha challenge set

> QwQ-32B on mlx 4bit, Apple M5 Max 128GB. Pass rate 79.9% ± 8.1 (95% CI), rank 29 of 110, tier 3. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: QwQ-32B (`mlx-community/QwQ-32B-4bit`)
- Runtime: mlx; versions: unknown
- Quant: 4bit; temperature 0.6
- Config hash: `dbea368f6d7e` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-24T02:51:54.314Z – 2026-06-29T13:01:12.767Z

## Score
- Pass rate: 79.9% ± 8.1 (135/169 items); core 81.7%, stretch 78.2%
- Rank 29 of 110, tier 3 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): execution_error 16, wrong 3

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 218522 total, 1293 per item
- Wall time: 14756 s total, 87.3 s per item
- Generation speed: 22.0 tok/s
- Peak memory: 17.6 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 11/12 | 91.7% ± 18.3 | 17766 | 702 | 25.3 | 17.6 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 3566 | 143 | 25.0 | 17.6 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 35/35 | 100.0% ± 0.0 | 61868 | 2666 | 23.2 | 17.6 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 14/26 | 53.8% ± 20.5 | 16776 | 660 | 25.4 | 17.6 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 1707 | 68 | 25.1 | 17.6 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 13/26 | 50.0% ± 35.2 | 55459 | 5841 | 22.0 | 17.6 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 5214 | 208 | 25.1 | 17.6 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 12533 | 496 | 25.3 | 17.6 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 2737 | 471 | 5.8 | 17.6 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 20/26 | 76.9% ± 27.4 | 40896 | 3502 | 20.5 | 17.6 |
