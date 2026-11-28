# phi-4-omlx: Pre-release (draft)

> phi-4 on omlx 4bit, Apple M5 Max 128GB. Pass rate 73.8% ± 5.8 (95% CI), rank 39 of 79, tier 8. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: phi-4 (`mlx-community/phi-4-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 0
- Variant (what sets it apart from the model's other rows): runtime omlx · t0
- Config hash: `b6389db92104b687d4953327792e0e7f1485563e160395adf800e1871420c9e4` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `3118b7b44ba9ef5056f99339e4d1bd2628bd791d`, `37f9f14`, `bfb5743`
- Samples per item: 1; submitters: local
- Executed: 2026-10-27T03:59:20.283Z – 2026-11-27T07:03:36.160Z

## Score
- Pass rate: 73.8% ± 5.8 (488/661 items); core 82.6%, stretch 39.1%
- Rank 39 of 79, tier 8 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 161, near_miss 6, context_exceeded 4, no_answer 2

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 99350 total, 150 per item
- Wall time: 2147 s total, 3.2 s per item
- Generation speed: 55.8 tok/s
- Peak memory: 8.6 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 3/13 | 23.1% | 2449 | 57 | 43.2 | 8.4 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 595 | 12 | 50.5 | 8.4 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 963 | 18 | 54.5 | 8.3 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 11/12 | 91.7% | 910 | 18 | 50.6 | 8.3 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 9/10 | 90.0% ± 22.6 | 542 | 10 | 53.5 | 8.4 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 6/12 | 50.0% | 4550 | 75 | 63.1 | 8.4 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 17/35 | 48.6% ± 17.9 | 5604 | 99 | 56.8 | 8.4 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 9/26 | 34.6% ± 19.6 | 837 | 17 | 49.9 | 8.4 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 10/12 | 83.3% | 1129 | 30 | 38.1 | 8.4 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 46 | 2 | 27.9 | 8.4 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 11/26 | 42.3% ± 15.9 | 12020 | 210 | 57.7 | 8.5 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 20/36 | 55.6% | 6004 | 113 | 53.3 | 8.5 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 7/12 | 58.3% | 2548 | 59 | 43.3 | 8.4 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 539 | 107 | 54.6 | 8.5 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 3/8 | 37.5% | 97 | 20 | 9.2 | 8.3 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 10/13 | 76.9% ± 26.5 | 753 | 14 | 54.8 | 8.4 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 7/9 | 77.8% | 612 | 18 | 34.7 | 8.5 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 719 | 12 | 58.3 | 8.5 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 352 | 13 | 27.8 | 8.5 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 3/29 | 10.3% ± 18.8 | 6445 | 112 | 57.5 | 8.5 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 283/316 | 89.6% ± 5.1 | 34341 | 797 | 63.5 | 8.6 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 7/12 | 58.3% | 6013 | 142 | 42.5 | 8.5 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 18/26 | 69.2% ± 26.1 | 11282 | 196 | 57.8 | 8.6 |
