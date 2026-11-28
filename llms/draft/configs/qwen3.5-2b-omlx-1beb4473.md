# qwen3.5-2b-omlx: Pre-release (draft)

> Qwen3.5-2B on omlx 4bit, Apple M5 Max 128GB. Pass rate 35.7% ± 6.0 (95% CI), rank 68 of 79, tier 13. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Qwen3.5-2B (`mlx-community/Qwen3.5-2B-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime omlx · t0.7 · maxTokens 32768 · topP 0.8 · topK 20 · minP 0 · presencePenalty 1.5 · chatTemplateKwargs default · weights unknown
- Config hash: `1beb4473ef25a2c7ec4f2bf8b93b91cfc098e6140ae35f9a407088d87675c9c3` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: `unknown` (prefix)
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `37f9f14`
- Samples per item: 1; submitters: local
- Executed: 2026-10-23T06:50:47.747Z – 2026-11-19T07:09:01.659Z

## Score
- Pass rate: 35.7% ± 6.0 (236/661 items); core 38.6%, stretch 24.1%
- Rank 68 of 79, tier 13 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: partial; challenges 22/23, items 649/661
- Failures (sample lines): wrong 335, near_miss 47, loop 18, no_answer 13

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 87019 total, 134 per item
- Wall time: 1160 s total, 1.8 s per item
- Generation speed: 242.8 tok/s
- Peak memory: 2.9 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 0/13 | 0.0% | 7493 | 27 | 279.6 | 2.9 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 1/12 | 8.3% | 42 | 2 | 26.3 | 2.9 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 6/12 | 50.0% ± 33.2 | 984 | 5 | 206.1 | 2.8 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 4/12 | 33.3% | 1168 | 6 | 209.8 | 2.9 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 596 | 3 | 189.3 | 2.8 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | not_run | 0/12 | 0.0% | — | — | — | — |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 12/35 | 34.3% ± 22.5 | 2049 | 58 | 179.9 | 2.9 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 5/26 | 19.2% ± 16.2 | 793 | 6 | 140.6 | 2.9 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 8/12 | 66.7% | 1351 | 8 | 161.9 | 2.8 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 5/7 | 71.4% ± 45.1 | 39 | 1 | 39.5 | 2.9 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 5/26 | 19.2% ± 21.1 | 30259 | 387 | 263.4 | 2.9 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 4/36 | 11.1% | 2601 | 14 | 180.4 | 2.9 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 8/12 | 66.7% | 1141 | 7 | 166.5 | 2.8 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 4/10 | 40.0% ± 36.9 | 651 | 3 | 187.6 | 2.9 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 5/8 | 62.5% | 33 | 23 | 1.4 | 2.9 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 4/13 | 30.8% ± 29.0 | 268 | 3 | 103.6 | 2.8 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 1/9 | 11.1% | 467 | 24 | 158.7 | 2.9 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 581 | 2 | 241.6 | 2.9 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 6/9 | 66.7% | 378 | 3 | 131.4 | 2.9 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 0/29 | 0.0% ± 0.0 | 207 | 4 | 46.2 | 2.9 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 134/316 | 42.4% ± 9.1 | 25668 | 289 | 356.6 | 2.9 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 0/12 | 0.0% | 708 | 5 | 150.2 | 2.9 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 12/26 | 46.2% ± 14.3 | 9542 | 280 | 268.2 | 2.9 |
