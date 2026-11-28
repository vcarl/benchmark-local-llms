# qwen2.5-32b-mlx: Pre-release (draft)

> Qwen2.5-32B-Instruct on mlx 4bit, Apple M5 Max 128GB. Pass rate 74.7% ± 6.1 (95% CI), rank 36 of 79, tier 7. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Qwen2.5-32B-Instruct (`mlx-community/Qwen2.5-32B-Instruct-4bit`)
- Runtime: mlx; versions: mlx-lm 0.31.3
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx · topP default · topK default · repetitionPenalty default
- Config hash: `56b0682f8e6ac915d4fd9493c570476addf7932629d01a49c25558759ba25999` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `37f9f14`, `bfb5743`
- Samples per item: 1; submitters: local
- Executed: 2026-06-24T20:25:16.705Z – 2026-11-20T01:34:07.090Z

## Score
- Pass rate: 74.7% ± 6.1 (494/661 items); core 83.3%, stretch 40.6%
- Rank 36 of 79, tier 7 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 162, near_miss 5

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 58098 total, 88 per item
- Wall time: 3322 s total, 5.0 s per item
- Generation speed: 20.6 tok/s
- Peak memory: 17.5 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 7/13 | 53.8% | 2973 | 156 | 19.1 | 17.4 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 11/12 | 91.7% | 62 | 7 | 37.7 | 0.8 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 921 | 49 | 18.7 | 17.5 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 878 | 37 | 28.7 | 17.4 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 370 | 21 | 17.6 | 17.5 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 5/12 | 41.7% | 5154 | 186 | 28.4 | 17.4 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 17/35 | 48.6% ± 25.5 | 1242 | 66 | 20.5 | 17.5 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 15/26 | 57.7% ± 20.4 | 541 | 34 | 16.1 | 17.5 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 1199 | 66 | 18.1 | 17.4 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 57 | 4 | 17.9 | 17.5 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 10/26 | 38.5% ± 32.8 | 9075 | 394 | 23.2 | 17.5 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 19/36 | 52.8% | 2130 | 92 | 28.4 | 17.4 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 8/12 | 66.7% | 1506 | 57 | 26.4 | 17.4 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 345 | 15 | 26.0 | 17.5 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 6/8 | 75.0% | 40 | 345 | 0.1 | 17.5 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 10/13 | 76.9% ± 26.5 | 621 | 25 | 29.3 | 17.4 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 8/9 | 88.9% | 568 | 37 | 15.5 | 17.5 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 518 | 27 | 19.7 | 17.5 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 381 | 31 | 12.3 | 17.5 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 2/29 | 6.9% ± 11.5 | 183 | 17 | 21.7 | 17.5 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 284/316 | 89.9% ± 5.7 | 18362 | 1159 | 25.9 | 17.4 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 3/12 | 25.0% | 656 | 48 | 13.5 | 17.5 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 15/26 | 57.7% ± 31.2 | 10316 | 452 | 22.9 | 17.5 |
