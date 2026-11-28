# qwen3-coder-30b-a3b-mlx: Pre-release (draft)

> Qwen3-Coder-30B-A3B-Instruct on mlx 4bit, Apple M5 Max 128GB. Pass rate 59.0% ± 6.3 (95% CI), rank 53 of 79, tier 10. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Qwen3-Coder-30B-A3B-Instruct (`mlx-community/Qwen3-Coder-30B-A3B-Instruct-4bit`)
- Runtime: mlx; versions: mlx-lm 0.31.3
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx · topP default · topK default · repetitionPenalty default · weights unknown
- Config hash: `44e3d9ad312bde178d42c11228751c188f99031e019a47108d936cd44d4b5222` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: `unknown` (prefix)
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `37f9f14`, `bfb5743`
- Samples per item: 1; submitters: local
- Executed: 2026-06-25T06:04:05.743Z – 2026-11-20T00:57:04.757Z

## Score
- Pass rate: 59.0% ± 6.3 (390/661 items); core 64.6%, stretch 36.8%
- Rank 53 of 79, tier 10 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 182, no_answer 37, loop 34, near_miss 16, length_cutoff 2

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 75114 total, 114 per item
- Wall time: 1636 s total, 2.5 s per item
- Generation speed: 112.3 tok/s
- Peak memory: 16.4 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 4/13 | 30.8% | 1791 | 54 | 116.3 | 16.4 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 9/12 | 75.0% | 719 | 28 | 141.6 | 16.4 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 10/12 | 83.3% ± 24.7 | 1029 | 11 | 94.7 | 16.4 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 938 | 9 | 139.7 | 16.4 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 540 | 6 | 95.1 | 16.4 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 0/12 | 0.0% | 7376 | 83 | 135.8 | 16.4 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 19/35 | 54.3% ± 21.3 | 12111 | 346 | 123.9 | 16.4 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 17/26 | 65.4% ± 19.6 | 670 | 14 | 146.9 | 16.4 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 11/12 | 91.7% | 1161 | 10 | 110.8 | 1.4 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 6/7 | 85.7% ± 35.0 | 255 | 3 | 104.3 | 16.4 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 9/26 | 34.6% ± 23.7 | 7129 | 230 | 127.9 | 16.4 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 14/36 | 38.9% | 2119 | 22 | 137.5 | 16.4 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 8/12 | 66.7% | 1028 | 29 | 116.5 | 16.4 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 9/10 | 90.0% ± 22.6 | 926 | 8 | 137.4 | 16.4 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 4/8 | 50.0% | 41 | 66 | 0.6 | 16.4 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 6/13 | 46.2% ± 31.4 | 573 | 29 | 144.2 | 16.4 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 6/9 | 66.7% | 602 | 6 | 100.5 | 16.4 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 2/4 | 50.0% | 563 | 5 | 122.7 | 16.4 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 434 | 6 | 74.6 | 16.4 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 0/29 | 0.0% ± 0.0 | 206 | 101 | 91.5 | 16.4 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 210/316 | 66.5% ± 8.9 | 20261 | 256 | 127.5 | 16.4 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 2/12 | 16.7% | 309 | 45 | 77.7 | 16.4 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 15/26 | 57.7% ± 24.4 | 14333 | 270 | 122.0 | 16.4 |
