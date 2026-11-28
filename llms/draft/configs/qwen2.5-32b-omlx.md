# qwen2.5-32b-omlx: Pre-release (draft)

> Qwen2.5-32B-Instruct on omlx 4bit, Apple M5 Max 128GB. Pass rate 74.9% ± 6.2 (95% CI), rank 35 of 79, tier 7. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Qwen2.5-32B-Instruct (`mlx-community/Qwen2.5-32B-Instruct-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime omlx · topP 0.8 · topK 20 · repetitionPenalty 1.05
- Config hash: `152864c64d939a5de0cab1b2f590792df2ae8f6cce99306d893127c447a39d2b` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `37f9f14`, `bfb5743`
- Samples per item: 1; submitters: local
- Executed: 2026-10-27T05:29:52.982Z – 2026-11-20T01:25:43.004Z

## Score
- Pass rate: 74.9% ± 6.2 (495/661 items); core 82.6%, stretch 44.4%
- Rank 35 of 79, tier 7 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 159, near_miss 7

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 56122 total, 85 per item
- Wall time: 3294 s total, 5.0 s per item
- Generation speed: 20.2 tok/s
- Peak memory: 18.3 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 7/13 | 53.8% | 2179 | 118 | 18.4 | 18.2 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 11/12 | 91.7% | 50 | 7 | 9.5 | 18.0 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 927 | 38 | 24.4 | 18.0 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 874 | 38 | 28.9 | 18.1 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 6/10 | 60.0% ± 36.9 | 391 | 17 | 23.1 | 18.0 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 4/12 | 33.3% | 5391 | 196 | 28.2 | 18.1 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 18/35 | 51.4% ± 29.1 | 1173 | 55 | 21.1 | 18.1 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 12/26 | 46.2% ± 20.5 | 483 | 24 | 19.9 | 18.1 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 1187 | 98 | 12.1 | 18.1 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 53 | 4 | 15.6 | 18.1 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 11/26 | 42.3% ± 28.6 | 9249 | 365 | 25.3 | 18.2 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 18/36 | 50.0% | 2093 | 98 | 28.7 | 18.1 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 10/12 | 83.3% | 1376 | 80 | 17.3 | 18.1 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 386 | 17 | 25.5 | 18.2 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 6/8 | 75.0% | 32 | 426 | 0.1 | 18.2 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 10/13 | 76.9% ± 26.5 | 555 | 23 | 25.6 | 18.1 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 6/9 | 66.7% | 509 | 37 | 13.9 | 18.2 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 542 | 21 | 25.6 | 18.2 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 425 | 34 | 12.4 | 18.2 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 2/29 | 6.9% ± 11.5 | 151 | 19 | 15.2 | 18.2 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 287/316 | 90.8% ± 5.6 | 17937 | 1153 | 26.0 | 18.3 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 3/12 | 25.0% | 595 | 48 | 12.4 | 18.2 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 18/26 | 69.2% ± 29.5 | 9564 | 377 | 25.4 | 18.3 |
