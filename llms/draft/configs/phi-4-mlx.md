# phi-4-mlx: Pre-release (draft)

> phi-4 on mlx 4bit, Apple M5 Max 128GB. Pass rate 72.9% ± 6.0 (95% CI), rank 44 of 79, tier 8. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: phi-4 (`mlx-community/phi-4-4bit`)
- Runtime: mlx; versions: mlx-lm 0.31.3
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx · t0.7
- Config hash: `febf979bb9b23eae10256ac839205d40537cff61cce3167b7145b95a50044f12` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `37f9f14`, `bfb5743`
- Samples per item: 1; submitters: local
- Executed: 2026-06-23T03:45:28.772Z – 2026-11-20T01:10:26.607Z

## Score
- Pass rate: 72.9% ± 6.0 (482/661 items); core 80.9%, stretch 41.4%
- Rank 44 of 79, tier 8 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 166, near_miss 6, no_answer 4, length_cutoff 2, loop 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 115385 total, 175 per item
- Wall time: 2451 s total, 3.7 s per item
- Generation speed: 52.1 tok/s
- Peak memory: 8.0 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 3/13 | 23.1% | 1818 | 32 | 57.3 | 7.9 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 801 | 15 | 63.4 | 1.4 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 982 | 22 | 45.0 | 7.9 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 11/12 | 91.7% | 928 | 18 | 62.7 | 8.0 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 562 | 13 | 42.1 | 7.9 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 6/12 | 50.0% | 4831 | 80 | 62.3 | 8.0 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 18/35 | 51.4% ± 19.9 | 5235 | 93 | 57.8 | 8.0 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 7/26 | 26.9% ± 18.3 | 790 | 19 | 40.5 | 7.9 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 10/12 | 83.3% | 1141 | 31 | 36.8 | 8.0 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 49 | 2 | 30.3 | 8.0 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 11/26 | 42.3% ± 20.1 | 11016 | 220 | 50.3 | 8.0 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 20/36 | 55.6% | 6659 | 115 | 61.5 | 8.0 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 4/12 | 33.3% | 2052 | 64 | 44.3 | 8.0 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 9/10 | 90.0% ± 22.6 | 8764 | 153 | 57.7 | 8.0 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 5/8 | 62.5% | 266 | 161 | 1.6 | 8.0 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 9/13 | 69.2% ± 29.0 | 784 | 14 | 59.3 | 8.0 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 6/9 | 66.7% | 469 | 13 | 35.9 | 8.0 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 638 | 14 | 46.4 | 8.0 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 375 | 12 | 30.0 | 8.0 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 1/29 | 3.4% ± 9.5 | 15380 | 265 | 58.7 | 8.0 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 281/316 | 88.9% ± 5.4 | 33346 | 742 | 60.8 | 8.0 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 7/12 | 58.3% | 6059 | 103 | 59.0 | 8.0 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 20/26 | 76.9% ± 27.4 | 12440 | 251 | 49.8 | 8.0 |
