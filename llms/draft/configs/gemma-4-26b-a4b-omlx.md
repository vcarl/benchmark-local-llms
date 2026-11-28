# gemma-4-26b-a4b-omlx: Pre-release (draft)

> gemma-4-26b-a4b-it on omlx 4bit, Apple M5 Max 128GB. Pass rate 82.6% ± 5.3 (95% CI), rank 26 of 79, tier 6. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: gemma-4-26b-a4b-it (`mlx-community/gemma-4-26b-a4b-it-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 1
- Variant (what sets it apart from the model's other rows): runtime omlx · chatTemplateKwargs default
- Config hash: `73af6def207dcb6fadfaae6b7eaa5b7452523b433bfe7bf968adfbffd3b22dc5` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `37f9f14`, `bfb5743`
- Samples per item: 1; submitters: local
- Executed: 2026-10-27T06:03:55.798Z – 2026-11-20T00:50:54.944Z

## Score
- Pass rate: 82.6% ± 5.3 (546/661 items); core 90.9%, stretch 49.6%
- Rank 26 of 79, tier 6 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 114, near_miss 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 63240 total, 96 per item
- Wall time: 870 s total, 1.3 s per item
- Generation speed: 90.8 tok/s
- Peak memory: 16.7 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 7/13 | 53.8% | 1906 | 20 | 97.6 | 16.2 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 462 | 7 | 68.1 | 16.4 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 1021 | 11 | 89.6 | 16.2 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 1009 | 12 | 85.3 | 16.4 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 357 | 5 | 68.0 | 16.2 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 10/12 | 83.3% | 6304 | 56 | 120.5 | 16.2 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 18/35 | 51.4% ± 23.6 | 1240 | 19 | 64.1 | 16.2 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 20/26 | 76.9% ± 17.4 | 548 | 10 | 52.6 | 16.2 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 1395 | 15 | 91.7 | 16.2 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 36 | 2 | 19.7 | 16.2 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 17/26 | 65.4% ± 27.8 | 9446 | 88 | 107.2 | 16.7 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 21/36 | 58.3% | 3816 | 46 | 83.8 | 16.4 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 12/12 | 100.0% | 940 | 11 | 88.5 | 16.2 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 9/10 | 90.0% ± 22.6 | 527 | 7 | 78.6 | 16.7 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 6/8 | 75.0% | 30 | 57 | 0.5 | 16.2 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 9/13 | 69.2% ± 29.0 | 808 | 10 | 83.3 | 16.1 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 7/9 | 77.8% | 904 | 11 | 82.3 | 16.2 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 739 | 7 | 103.9 | 16.7 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 398 | 6 | 64.7 | 16.2 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 1/29 | 3.4% ± 9.5 | 149 | 9 | 17.2 | 16.4 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 304/316 | 96.2% ± 2.9 | 21796 | 370 | 108.8 | 16.7 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 7/12 | 58.3% | 1310 | 15 | 85.8 | 16.2 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 20/26 | 76.9% ± 19.3 | 8099 | 76 | 106.4 | 16.7 |
