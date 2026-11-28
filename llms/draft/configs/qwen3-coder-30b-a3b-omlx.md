# qwen3-coder-30b-a3b-omlx: Pre-release (draft)

> Qwen3-Coder-30B-A3B-Instruct on omlx 4bit, Apple M5 Max 128GB. Pass rate 58.5% ± 6.0 (95% CI), rank 54 of 79, tier 10. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Qwen3-Coder-30B-A3B-Instruct (`mlx-community/Qwen3-Coder-30B-A3B-Instruct-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime omlx · topP 0.8 · topK 20 · repetitionPenalty 1.05 · weights 38089644afcb
- Config hash: `d5036163585db6dde2324b04da62f4791bbd762500e8a74fd9c04cb2a2b2bac7` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: `38089644afcb` (prefix)
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `37f9f14`, `bfb5743`
- Samples per item: 1; submitters: local
- Executed: 2026-10-27T01:37:50.527Z – 2026-11-20T00:28:32.098Z

## Score
- Pass rate: 58.5% ± 6.0 (387/661 items); core 62.3%, stretch 43.6%
- Rank 54 of 79, tier 10 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 204, no_answer 52, length_cutoff 7, near_miss 7, loop 4

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 209502 total, 317 per item
- Wall time: 2141 s total, 3.2 s per item
- Generation speed: 114.4 tok/s
- Peak memory: 16.9 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 5/13 | 38.5% | 6313 | 51 | 123.0 | 16.9 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 10/12 | 83.3% | 1429 | 13 | 111.4 | 16.8 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 9/12 | 75.0% ± 28.7 | 1119 | 10 | 107.4 | 16.8 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 942 | 10 | 98.5 | 16.8 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 570 | 6 | 99.3 | 16.8 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 3/12 | 25.0% | 11571 | 94 | 127.1 | 16.9 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 27/35 | 77.1% ± 10.1 | 42174 | 416 | 119.4 | 16.9 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 16/26 | 61.5% ± 20.0 | 603 | 9 | 70.5 | 16.9 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 11/12 | 91.7% | 1120 | 11 | 101.7 | 16.8 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 5/7 | 71.4% ± 45.1 | 125 | 2 | 62.4 | 16.9 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 10/26 | 38.5% ± 19.0 | 54688 | 476 | 115.3 | 16.9 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 11/36 | 30.6% | 2065 | 24 | 85.8 | 16.9 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 6/12 | 50.0% | 1361 | 81 | 115.0 | 16.8 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 9/10 | 90.0% ± 22.6 | 932 | 8 | 110.3 | 16.9 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 4/8 | 50.0% | 2019 | 86 | 23.3 | 16.9 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 10/13 | 76.9% ± 26.5 | 1311 | 12 | 112.7 | 16.8 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 6/9 | 66.7% | 671 | 7 | 99.2 | 16.8 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 3/4 | 75.0% | 693 | 6 | 122.9 | 16.9 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 410 | 5 | 77.7 | 16.8 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 0/29 | 0.0% ± 0.0 | 18230 | 155 | 117.9 | 16.8 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 197/316 | 62.3% ± 8.6 | 20145 | 264 | 147.3 | 16.9 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 2/12 | 16.7% | 609 | 8 | 79.4 | 16.8 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 14/26 | 53.8% ± 30.3 | 40402 | 387 | 118.1 | 16.9 |
