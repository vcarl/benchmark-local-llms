# laguna-s-2.1-omlx: Pre-release (draft)

> Laguna-S-2.1 on omlx oQ4e, Apple M5 Max 128GB. Pass rate 78.5% ± 4.1 (95% CI), rank 29 of 79, tier 6. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Laguna-S-2.1 (`mlx-community/Laguna-S-2.1-oQ4e`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: oQ4e; temperature 1
- Config hash: `a04648276efdf08ff0b7f0e3da2baed2a0b89298e4db235909602201ca25e98e` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `60cac01449e205c0ce82239d9a5abfe32c9323cc`
- Samples per item: 1; submitters: local
- Executed: 2026-11-23T09:26:53.097Z – 2026-11-23T13:04:50.029Z

## Score
- Pass rate: 78.5% ± 4.1 (519/661 items); core 80.7%, stretch 69.9%
- Rank 29 of 79, tier 6 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 92, no_answer 37, near_miss 12, thinking_truncated 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 771201 total, 1167 per item
- Wall time: 13439 s total, 20.3 s per item
- Generation speed: 60.9 tok/s
- Peak memory: 18.5 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 5/13 | 38.5% | 66266 | 1114 | 59.6 | 18.1 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 11/12 | 91.7% | 504 | 13 | 66.9 | 18.1 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 957 | 20 | 71.4 | 18.1 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 1880 | 35 | 67.0 | 18.1 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 429 | 9 | 77.6 | 18.1 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 8/12 | 66.7% | 74280 | 1189 | 62.8 | 18.1 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 29/35 | 82.9% ± 16.9 | 38787 | 618 | 63.7 | 18.1 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 19/26 | 73.1% ± 18.3 | 588 | 15 | 56.8 | 18.1 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 1564 | 30 | 67.9 | 18.1 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 2615 | 42 | 64.6 | 18.1 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 21/26 | 80.8% ± 15.4 | 204575 | 3397 | 60.4 | 18.1 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 22/36 | 61.1% | 4792 | 102 | 67.1 | 18.1 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 10/12 | 83.3% | 1646 | 29 | 69.0 | 18.1 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 1881 | 32 | 63.5 | 18.1 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 6/8 | 75.0% | 382 | 189 | 3.6 | 18.2 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 11/13 | 84.6% ± 22.7 | 6441 | 105 | 63.3 | 18.3 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 8/9 | 88.9% | 55966 | 906 | 62.1 | 18.3 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 2470 | 39 | 64.6 | 18.3 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 3970 | 69 | 64.7 | 18.3 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 13/29 | 44.8% ± 33.4 | 171081 | 2837 | 60.5 | 18.3 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 253/316 | 80.1% ± 5.4 | 33497 | 1069 | 65.1 | 18.5 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 7/12 | 58.3% | 2754 | 51 | 65.9 | 18.5 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 22/26 | 84.6% ± 17.7 | 93876 | 1529 | 61.8 | 18.5 |
