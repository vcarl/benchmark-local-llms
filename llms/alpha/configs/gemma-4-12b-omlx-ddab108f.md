# gemma-4-12b-omlx: Alpha challenge set

> gemma-4-12B-it on omlx 4bit, Apple M5 Max 128GB. Pass rate 85.2% ± 5.5 (95% CI), rank 20 of 110, tier 2. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: gemma-4-12B-it (`lmstudio-community/gemma-4-12B-it-MLX-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 1
- Config hash: `ddab108f5d2a` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `5a9b817`
- Samples per item: 1; submitters: local
- Executed: 2026-10-29T05:16:42.561Z – 2026-10-29T08:26:17.181Z

## Score
- Pass rate: 85.2% ± 5.5 (144/169 items); core 85.4%, stretch 85.1%
- Rank 20 of 110, tier 2 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 8, loop 3, thinking_truncated 2

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 560030 total, 3314 per item
- Wall time: 11631 s total, 68.8 s per item
- Generation speed: 54.3 tok/s
- Peak memory: 11.3 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 11/12 | 91.7% ± 18.3 | 50401 | 898 | 56.1 | 8.3 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 23122 | 419 | 55.2 | 8.3 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 33/35 | 94.3% ± 7.3 | 112169 | 2067 | 54.3 | 8.4 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 15/26 | 57.7% ± 20.4 | 36678 | 721 | 55.7 | 8.4 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 1317 | 24 | 55.1 | 8.4 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 20/26 | 76.9% ± 19.0 | 182008 | 4649 | 53.6 | 11.3 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 3425 | 62 | 54.8 | 11.3 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 9845 | 175 | 56.1 | 11.3 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 1836 | 33 | 56.3 | 11.3 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 21/26 | 80.8% ± 21.3 | 139229 | 2582 | 53.9 | 11.3 |
