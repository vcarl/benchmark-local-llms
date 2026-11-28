# qwen2.5-7b-omlx: Pre-release (draft)

> Qwen2.5-7B-Instruct on omlx 4bit, Apple M5 Max 128GB. Pass rate 54.6% ± 6.6 (95% CI), rank 57 of 79, tier 11. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Qwen2.5-7B-Instruct (`mlx-community/Qwen2.5-7B-Instruct-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime omlx · topP 0.8 · topK 20 · repetitionPenalty 1.05
- Config hash: `4f57220e2ea633b97cc85df76a8e5205fda281c73b994ca228d6f8a82930eb75` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `37f9f14`, `bfb5743`
- Samples per item: 1; submitters: local
- Executed: 2026-10-27T02:16:34.234Z – 2026-11-20T00:51:57.170Z

## Score
- Pass rate: 54.6% ± 6.6 (361/661 items); core 61.4%, stretch 27.8%
- Rank 57 of 79, tier 11 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 246, near_miss 44, no_answer 10

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 57254 total, 87 per item
- Wall time: 787 s total, 1.2 s per item
- Generation speed: 87.0 tok/s
- Peak memory: 4.9 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 5/13 | 38.5% | 1346 | 16 | 82.0 | 4.8 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 3/12 | 25.0% | 100 | 2 | 40.6 | 4.8 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 972 | 10 | 98.2 | 4.8 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 872 | 10 | 90.8 | 4.8 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 7/10 | 70.0% ± 34.6 | 301 | 4 | 76.8 | 4.8 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 2/12 | 16.7% | 5551 | 50 | 116.6 | 4.8 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 11/35 | 31.4% ± 21.4 | 2446 | 26 | 93.3 | 4.8 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 8/26 | 30.8% ± 19.0 | 477 | 7 | 66.3 | 4.8 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 10/12 | 83.3% | 1163 | 15 | 75.7 | 4.8 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 47 | 1 | 38.1 | 4.8 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 7/26 | 26.9% ± 23.5 | 9368 | 90 | 103.8 | 4.8 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 6/36 | 16.7% | 2201 | 26 | 85.6 | 4.8 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 6/12 | 50.0% | 1460 | 19 | 77.5 | 4.8 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 9/10 | 90.0% ± 22.6 | 589 | 6 | 94.7 | 4.8 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 6/8 | 75.0% | 57 | 90 | 0.6 | 4.9 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 7/13 | 53.8% ± 31.4 | 497 | 6 | 86.2 | 4.8 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 0/9 | 0.0% | 820 | 12 | 65.7 | 4.9 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 3/4 | 75.0% | 455 | 4 | 105.0 | 4.8 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 352 | 7 | 52.1 | 4.9 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 0/29 | 0.0% ± 0.0 | 155 | 6 | 27.2 | 4.9 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 217/316 | 68.7% ± 8.0 | 17246 | 269 | 120.7 | 4.9 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 3/12 | 25.0% | 625 | 11 | 56.4 | 4.9 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 11/26 | 42.3% ± 26.9 | 10154 | 98 | 103.9 | 4.9 |
