# kimi-linear-48b-a3b-mlx: Pre-release (draft)

> Kimi-Linear-48B-A3B-Instruct on mlx 4bit, Apple M5 Max 128GB. Pass rate 63.8% ± 6.1 (95% CI), rank 51 of 79, tier 9. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Kimi-Linear-48B-A3B-Instruct (`mlx-community/Kimi-Linear-48B-A3B-Instruct-4bit`)
- Runtime: mlx; versions: mlx-lm 0.31.3
- Quant: 4bit; temperature 0.7
- Config hash: `bb2508036f66da84bc656d06fa8a76c1534500780f5d76d8ec6800ca8f8fee8e` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `37f9f14`, `bfb5743`
- Samples per item: 1; submitters: local
- Executed: 2026-06-25T19:41:09.756Z – 2026-11-20T00:55:35.346Z

## Score
- Pass rate: 63.8% ± 6.1 (422/661 items); core 67.8%, stretch 48.1%
- Rank 51 of 79, tier 9 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 179, loop 36, length_cutoff 10, near_miss 7, no_answer 7

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 132820 total, 201 per item
- Wall time: 2986 s total, 4.5 s per item
- Generation speed: 117.7 tok/s
- Peak memory: 26.0 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 4/13 | 30.8% | 1042 | 40 | 109.2 | 25.9 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 2/12 | 16.7% | 63 | 5 | 12.3 | 1.6 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 933 | 10 | 93.0 | 25.9 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 10/12 | 83.3% | 1112 | 13 | 84.8 | 1.4 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 388 | 4 | 100.2 | 25.9 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 3/12 | 25.0% | 1949 | 210 | 137.3 | 25.9 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 25/35 | 71.4% ± 18.8 | 12131 | 481 | 132.7 | 26.0 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 18/26 | 69.2% ± 19.0 | 593 | 7 | 81.9 | 26.0 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 10/12 | 83.3% | 1094 | 11 | 95.2 | 12.7 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 30 | 3 | 9.1 | 26.0 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 13/26 | 50.0% ± 30.5 | 41510 | 726 | 127.4 | 26.0 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 9/36 | 25.0% | 1873 | 24 | 76.7 | 25.9 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 7/12 | 58.3% | 1915 | 16 | 116.3 | 12.7 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 354 | 6 | 58.2 | 26.0 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 6/8 | 75.0% | 31 | 51 | 0.6 | 12.8 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 7/13 | 53.8% ± 31.4 | 425 | 7 | 63.1 | 1.4 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 7/9 | 77.8% | 1349 | 12 | 111.7 | 12.8 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 375 | 5 | 73.8 | 26.0 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 8/9 | 88.9% | 396 | 5 | 72.4 | 12.8 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 1/29 | 3.4% ± 9.5 | 28380 | 639 | 128.9 | 26.0 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 229/316 | 72.5% ± 7.6 | 32465 | 370 | 130.6 | 26.0 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 3/12 | 25.0% | 621 | 7 | 86.1 | 12.8 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 19/26 | 73.1% ± 25.2 | 3791 | 332 | 123.1 | 26.0 |
