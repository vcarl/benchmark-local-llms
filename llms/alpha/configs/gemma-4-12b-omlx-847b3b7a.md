# gemma-4-12b-omlx: Alpha challenge set

> gemma-4-12B-it on omlx 4bit, Apple M5 Max 128GB. Pass rate 63.9% ± 8.6 (95% CI), rank 54 of 110, tier 5. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: gemma-4-12B-it (`lmstudio-community/gemma-4-12B-it-MLX-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 1
- Config hash: `847b3b7aeb26` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `94de7a9`
- Samples per item: 1; submitters: local
- Executed: 2026-10-28T15:58:38.368Z – 2026-10-28T16:09:20.341Z

## Score
- Pass rate: 63.9% ± 8.6 (108/169 items); core 78.0%, stretch 50.6%
- Rank 54 of 110, tier 5 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 47, loop 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 23515 total, 139 per item
- Wall time: 602 s total, 3.6 s per item
- Generation speed: 53.3 tok/s
- Peak memory: 8.9 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 11/12 | 91.7% ± 18.3 | 1076 | 21 | 52.3 | 7.9 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 441 | 9 | 47.7 | 7.9 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 16/35 | 45.7% ± 15.8 | 1483 | 33 | 45.0 | 7.9 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 14/26 | 53.8% ± 20.5 | 1015 | 22 | 45.2 | 7.9 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 36 | 2 | 16.2 | 7.9 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 11/26 | 42.3% ± 27.0 | 8595 | 315 | 55.8 | 8.9 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 522 | 11 | 46.9 | 8.9 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 8/13 | 61.5% ± 30.6 | 835 | 16 | 50.8 | 8.9 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 653 | 12 | 56.7 | 8.9 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 17/26 | 65.4% ± 34.7 | 8859 | 160 | 55.2 | 8.9 |
