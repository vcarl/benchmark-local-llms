# gemma-4-e4b-omlx: Pre-release (draft)

> gemma-4-e4b-it on omlx 4bit, Apple M5 Max 128GB. Pass rate 65.8% ± 6.3 (95% CI), rank 50 of 79, tier 9. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: gemma-4-e4b-it (`mlx-community/gemma-4-e4b-it-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 1
- Config hash: `9ca9f55e893a1533de81a6dbe34c9250589fcd0d188dc0a4a0e9893a86a2de47` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `37f9f14`, `bfb5743`
- Samples per item: 1; submitters: local
- Executed: 2026-10-23T12:28:32.445Z – 2026-11-20T00:26:37.925Z

## Score
- Pass rate: 65.8% ± 6.3 (435/661 items); core 73.5%, stretch 35.3%
- Rank 50 of 79, tier 9 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 209, no_answer 14, near_miss 3

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 110101 total, 167 per item
- Wall time: 1094 s total, 1.7 s per item
- Generation speed: 111.7 tok/s
- Peak memory: 6.6 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 3/13 | 23.1% | 2333 | 23 | 103.4 | 6.5 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 10/12 | 83.3% | 433 | 5 | 80.2 | 6.4 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 11/12 | 91.7% ± 18.3 | 1292 | 12 | 108.2 | 6.5 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 1541 | 14 | 107.0 | 6.5 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 442 | 5 | 90.8 | 6.5 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 6/12 | 50.0% | 9269 | 75 | 129.0 | 6.6 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 14/35 | 40.0% ± 26.6 | 5643 | 51 | 111.2 | 6.6 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 10/26 | 38.5% ± 20.0 | 576 | 8 | 69.5 | 6.6 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 1395 | 16 | 85.0 | 6.5 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 41 | 1 | 29.7 | 6.6 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 9/26 | 34.6% ± 23.7 | 23169 | 195 | 119.2 | 6.6 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 9/36 | 25.0% | 2368 | 27 | 86.8 | 6.5 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 9/12 | 75.0% | 1339 | 14 | 93.6 | 6.5 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 9/10 | 90.0% ± 22.6 | 644 | 7 | 97.1 | 6.6 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 5/8 | 62.5% | 51 | 35 | 1.5 | 6.6 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 8/13 | 61.5% ± 30.6 | 2770 | 24 | 116.3 | 6.5 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 2/9 | 22.2% | 523 | 7 | 75.5 | 6.6 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 3/4 | 75.0% | 1036 | 9 | 114.5 | 6.6 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 4/9 | 44.4% | 440 | 6 | 72.2 | 6.6 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 0/29 | 0.0% ± 0.0 | 10566 | 93 | 113.3 | 6.6 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 263/316 | 83.2% ± 5.8 | 23352 | 284 | 129.2 | 6.6 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 3/12 | 25.0% | 741 | 10 | 76.9 | 6.6 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 18/26 | 69.2% ± 24.7 | 20137 | 171 | 118.2 | 6.6 |
