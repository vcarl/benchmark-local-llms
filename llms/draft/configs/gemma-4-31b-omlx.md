# gemma-4-31b-omlx: Pre-release (draft)

> gemma-4-31b-it on omlx 4bit, Apple M5 Max 128GB. Pass rate 86.1% ± 4.8 (95% CI), rank 22 of 79, tier 5. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: gemma-4-31b-it (`mlx-community/gemma-4-31b-it-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 1
- Variant (what sets it apart from the model's other rows): runtime omlx · chatTemplateKwargs default
- Config hash: `0413552039bb0c73796651df16f9c54b9076b24c07ecc4939ad78fbeb662dd7a` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `37f9f14`, `bfb5743`
- Samples per item: 1; submitters: local
- Executed: 2026-10-27T15:06:40.586Z – 2026-11-20T01:37:35.329Z

## Score
- Pass rate: 86.1% ± 4.8 (569/661 items); core 94.9%, stretch 51.1%
- Rank 22 of 79, tier 5 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 92

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 57349 total, 87 per item
- Wall time: 3740 s total, 5.7 s per item
- Generation speed: 19.1 tok/s
- Peak memory: 28.5 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 7/13 | 53.8% | 1428 | 85 | 16.8 | 18.8 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 322 | 17 | 30.4 | 18.8 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 1017 | 46 | 22.3 | 18.8 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 981 | 44 | 28.3 | 18.8 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 408 | 20 | 20.3 | 18.8 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 11/12 | 91.7% | 5127 | 191 | 27.7 | 18.8 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 22/35 | 62.9% ± 23.1 | 371 | 30 | 12.4 | 18.8 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 20/26 | 76.9% ± 17.4 | 527 | 30 | 17.3 | 18.8 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 1395 | 95 | 14.8 | 18.8 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 36 | 4 | 8.9 | 18.8 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 16/26 | 61.5% ± 28.9 | 7738 | 338 | 22.9 | 19.8 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 30/36 | 83.3% | 2604 | 131 | 27.7 | 19.0 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 12/12 | 100.0% | 681 | 45 | 15.0 | 18.8 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 521 | 23 | 23.9 | 19.8 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 6/8 | 75.0% | 30 | 432 | 0.1 | 21.6 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 11/13 | 84.6% ± 22.7 | 543 | 25 | 23.9 | 19.0 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 8/9 | 88.9% | 510 | 43 | 11.8 | 28.5 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 555 | 24 | 23.0 | 19.8 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 409 | 37 | 11.0 | 28.5 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 2/29 | 6.9% ± 11.5 | 1547 | 77 | 24.3 | 28.5 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 310/316 | 98.1% ± 2.1 | 22920 | 1635 | 23.5 | 21.1 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 8/12 | 66.7% | 1058 | 80 | 13.2 | 28.5 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 18/26 | 69.2% ± 32.6 | 6621 | 287 | 23.1 | 21.1 |
