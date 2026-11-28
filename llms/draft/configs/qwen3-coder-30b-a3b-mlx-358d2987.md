# qwen3-coder-30b-a3b-mlx: Pre-release (draft)

> Qwen3-Coder-30B-A3B-Instruct on mlx 4bit, Apple M5 Max 128GB. Pass rate 60.5% ± 6.1 (95% CI), rank 52 of 79, tier 10. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Qwen3-Coder-30B-A3B-Instruct (`mlx-community/Qwen3-Coder-30B-A3B-Instruct-4bit`)
- Runtime: mlx; versions: mlx-lm 0.31.3
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx · topP 0.8 · topK 20 · repetitionPenalty 1.05 · weights 38089644afcb
- Config hash: `358d2987f58dcd39cd767289e2dab44ab9d1adb0a581f8d75564c688ecd55aee` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: `38089644afcb` (prefix)
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `1ac5f98`
- Samples per item: 1; submitters: local
- Executed: 2026-11-20T13:56:27.552Z – 2026-11-20T14:37:45.381Z

## Score
- Pass rate: 60.5% ± 6.1 (400/661 items); core 65.9%, stretch 39.1%
- Rank 52 of 79, tier 10 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 176, no_answer 43, loop 23, near_miss 16, length_cutoff 3

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 125737 total, 190 per item
- Wall time: 2237 s total, 3.4 s per item
- Generation speed: 122.8 tok/s
- Peak memory: 16.4 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 4/13 | 30.8% | 17429 | 151 | 117.7 | 16.4 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 9/12 | 75.0% | 594 | 25 | 139.9 | 16.4 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 10/12 | 83.3% ± 24.7 | 1232 | 11 | 139.2 | 16.4 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 921 | 9 | 137.7 | 16.4 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 5/10 | 50.0% ± 37.7 | 540 | 5 | 141.8 | 16.4 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 2/12 | 16.7% | 7399 | 57 | 134.7 | 16.4 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 22/35 | 62.9% ± 16.3 | 12639 | 422 | 122.9 | 16.4 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 18/26 | 69.2% ± 19.0 | 624 | 16 | 145.1 | 16.4 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 1122 | 10 | 137.1 | 16.4 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 5/7 | 71.4% ± 45.1 | 154 | 2 | 147.3 | 16.4 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 10/26 | 38.5% ± 20.2 | 31416 | 428 | 120.0 | 16.4 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 13/36 | 36.1% | 2066 | 22 | 135.6 | 16.4 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 7/12 | 58.3% | 1228 | 43 | 139.5 | 16.4 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 9/10 | 90.0% ± 22.6 | 922 | 8 | 140.0 | 16.4 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 4/8 | 50.0% | 35 | 126 | 2.5 | 16.4 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 8/13 | 61.5% ± 30.6 | 1186 | 13 | 139.1 | 16.4 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 7/9 | 77.8% | 655 | 7 | 138.4 | 16.4 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 3/4 | 75.0% | 595 | 5 | 137.9 | 16.4 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 437 | 5 | 136.7 | 16.4 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 0/29 | 0.0% ± 0.0 | 4475 | 188 | 130.4 | 16.4 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 216/316 | 68.4% ± 8.2 | 20159 | 299 | 125.3 | 16.4 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 1/12 | 8.3% | 591 | 7 | 134.5 | 16.4 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 14/26 | 53.8% ± 30.3 | 19318 | 380 | 125.2 | 16.4 |
