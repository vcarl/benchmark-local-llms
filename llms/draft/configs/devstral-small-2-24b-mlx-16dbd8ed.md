# devstral-small-2-24b-mlx: Pre-release (draft)

> Devstral-Small-2-24B-Instruct-2512 on mlx 4bit, Apple M5 Max 128GB. Pass rate 71.6% ± 6.3 (95% CI), rank 46 of 79, tier 8. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Devstral-Small-2-24B-Instruct-2512 (`mlx-community/Devstral-Small-2-24B-Instruct-2512-4bit`)
- Runtime: mlx; versions: mlx-lm 0.31.3
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx · t0.7 · weights unknown
- Config hash: `16dbd8ed4340120fdd190677f0abc6a7194a4f03163c3f9650954862f85d4c38` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: `unknown` (prefix)
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `37f9f14`, `bfb5743`
- Samples per item: 1; submitters: local
- Executed: 2026-06-24T08:38:56.027Z – 2026-11-20T01:20:02.195Z

## Score
- Pass rate: 71.6% ± 6.3 (473/661 items); core 78.8%, stretch 42.9%
- Rank 46 of 79, tier 8 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 171, near_miss 13, length_cutoff 2, loop 2

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 98334 total, 149 per item
- Wall time: 4315 s total, 6.5 s per item
- Generation speed: 28.1 tok/s
- Peak memory: 13.9 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 2/13 | 15.4% | 2979 | 110 | 27.0 | 13.8 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 10/12 | 83.3% | 457 | 16 | 38.8 | 0.1 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 985 | 31 | 32.2 | 12.9 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 11/12 | 91.7% | 1037 | 32 | 38.1 | 13.8 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 7/10 | 70.0% ± 34.6 | 461 | 15 | 31.0 | 12.9 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 2/12 | 16.7% | 4974 | 189 | 37.8 | 13.8 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 19/35 | 54.3% ± 23.0 | 4152 | 146 | 29.3 | 13.8 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 15/26 | 57.7% ± 20.4 | 673 | 24 | 28.5 | 12.9 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 1263 | 53 | 23.9 | 13.8 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 6/7 | 85.7% ± 35.0 | 49 | 3 | 24.8 | 13.8 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 8/26 | 30.8% ± 23.2 | 26919 | 996 | 27.1 | 13.8 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 19/36 | 52.8% | 2152 | 68 | 38.1 | 13.8 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 7/12 | 58.3% | 1783 | 67 | 26.8 | 13.8 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 9/10 | 90.0% ± 22.6 | 363 | 12 | 34.3 | 13.8 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 6/8 | 75.0% | 40 | 271 | 0.1 | 13.9 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 8/13 | 61.5% ± 30.6 | 494 | 217 | 39.0 | 13.8 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 8/9 | 88.9% | 606 | 26 | 23.3 | 13.9 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 532 | 16 | 33.8 | 13.8 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 396 | 21 | 18.5 | 13.9 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 6/29 | 20.7% ± 19.0 | 4390 | 138 | 33.4 | 13.9 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 273/316 | 86.4% ± 6.4 | 18878 | 827 | 35.2 | 13.8 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 1/12 | 8.3% | 787 | 38 | 20.9 | 13.9 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 19/26 | 73.1% ± 28.7 | 23964 | 1002 | 31.1 | 13.8 |
