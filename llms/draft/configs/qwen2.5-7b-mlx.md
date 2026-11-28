# qwen2.5-7b-mlx: Pre-release (draft)

> Qwen2.5-7B-Instruct on mlx 4bit, Apple M5 Max 128GB. Pass rate 54.3% ± 6.3 (95% CI), rank 58 of 79, tier 11. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Qwen2.5-7B-Instruct (`mlx-community/Qwen2.5-7B-Instruct-4bit`)
- Runtime: mlx; versions: mlx-lm 0.31.3
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx · topP default · topK default · repetitionPenalty default
- Config hash: `b52d389b79097d99df83082a0d9e2297f64868c0352fe97cbd3609c419470b99` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `37f9f14`, `bfb5743`
- Samples per item: 1; submitters: local
- Executed: 2026-06-19T20:18:02.112Z – 2026-11-20T00:48:16.151Z

## Score
- Pass rate: 54.3% ± 6.3 (359/661 items); core 61.0%, stretch 27.8%
- Rank 58 of 79, tier 11 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 244, near_miss 49, no_answer 9

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 59603 total, 90 per item
- Wall time: 779 s total, 1.2 s per item
- Generation speed: 88.7 tok/s
- Peak memory: 4.3 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 5/13 | 38.5% | 1962 | 19 | 106.0 | 2.3 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 5/12 | 41.7% | 71 | 2 | 35.8 | 2.3 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 931 | 10 | 94.8 | 0.0 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 874 | 9 | 96.1 | 4.3 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 285 | 4 | 68.9 | 0.0 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 2/12 | 16.7% | 5429 | 48 | 117.4 | 4.3 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 14/35 | 40.0% ± 25.0 | 2703 | 28 | 104.5 | 4.3 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 9/26 | 34.6% ± 19.6 | 471 | 8 | 59.9 | 0.0 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 10/12 | 83.3% | 1178 | 16 | 71.8 | 4.2 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 50 | 1 | 57.6 | 4.3 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 7/26 | 26.9% ± 18.6 | 9907 | 98 | 102.0 | 4.3 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 8/36 | 22.2% | 2255 | 25 | 90.4 | 4.3 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 6/12 | 50.0% | 1546 | 19 | 82.4 | 4.3 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 9/10 | 90.0% ± 22.6 | 559 | 6 | 112.5 | 4.3 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 6/8 | 75.0% | 65 | 80 | 0.8 | 4.3 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 7/13 | 53.8% ± 31.4 | 546 | 6 | 125.6 | 4.3 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 0/9 | 0.0% | 644 | 7 | 97.4 | 4.3 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 3/4 | 75.0% | 505 | 5 | 109.0 | 4.3 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 371 | 6 | 67.2 | 4.3 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 1/29 | 3.4% ± 9.5 | 180 | 5 | 34.8 | 4.3 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 210/316 | 66.5% ± 8.2 | 17474 | 265 | 105.3 | 4.3 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 2/12 | 16.7% | 606 | 8 | 79.7 | 4.3 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 7/26 | 26.9% ± 13.6 | 10991 | 105 | 104.7 | 4.3 |
