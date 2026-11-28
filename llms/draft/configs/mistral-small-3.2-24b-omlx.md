# mistral-small-3.2-24b-omlx: Pre-release (draft)

> Mistral-Small-3.2-24B-Instruct-2506 on omlx 4bit, Apple M5 Max 128GB. Pass rate 74.6% ± 5.6 (95% CI), rank 37 of 79, tier 7. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Mistral-Small-3.2-24B-Instruct-2506 (`mlx-community/Mistral-Small-3.2-24B-Instruct-2506-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 0.15
- Variant (what sets it apart from the model's other rows): runtime omlx · t0.15 · weights c42dc21c568f
- Config hash: `6cbe325f404c68b6bef13e60eee192bc06445f5d9552644d98f1d9c849c62529` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: `c42dc21c568f` (prefix)
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `37f9f14`, `bfb5743`
- Samples per item: 1; submitters: local
- Executed: 2026-10-27T05:06:43.460Z – 2026-11-20T01:30:56.157Z

## Score
- Pass rate: 74.6% ± 5.6 (493/661 items); core 81.1%, stretch 48.9%
- Rank 37 of 79, tier 7 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 166, near_miss 2

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 87795 total, 133 per item
- Wall time: 3284 s total, 5.0 s per item
- Generation speed: 30.3 tok/s
- Peak memory: 13.4 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 4/13 | 30.8% | 2510 | 66 | 38.8 | 13.2 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 429 | 14 | 44.0 | 13.3 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 1023 | 30 | 34.6 | 13.2 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 901 | 27 | 43.0 | 13.3 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 7/10 | 70.0% ± 34.6 | 538 | 16 | 33.8 | 13.2 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 6/12 | 50.0% | 5925 | 149 | 40.8 | 13.3 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 23/35 | 65.7% ± 17.3 | 6545 | 175 | 38.0 | 13.3 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 13/26 | 50.0% ± 20.6 | 634 | 21 | 30.3 | 13.3 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 1251 | 90 | 13.9 | 13.3 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 6/7 | 85.7% ± 35.0 | 63 | 3 | 24.2 | 13.3 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 11/26 | 42.3% ± 21.4 | 20294 | 551 | 36.8 | 13.3 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 19/36 | 52.8% | 2173 | 68 | 43.3 | 13.3 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 10/12 | 83.3% | 1721 | 98 | 17.5 | 13.3 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 8/10 | 80.0% ± 30.2 | 770 | 21 | 38.3 | 13.4 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 6/8 | 75.0% | 32 | 442 | 0.1 | 13.3 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 9/13 | 69.2% ± 29.0 | 770 | 22 | 39.6 | 13.3 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 6/9 | 66.7% | 588 | 51 | 11.5 | 13.3 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 3/4 | 75.0% | 509 | 14 | 36.5 | 13.4 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 393 | 39 | 10.1 | 13.4 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 6/29 | 20.7% ± 22.3 | 5094 | 136 | 39.0 | 13.3 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 279/316 | 88.3% ± 5.9 | 21350 | 863 | 40.3 | 13.4 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 2/12 | 16.7% | 765 | 25 | 43.3 | 13.4 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 18/26 | 69.2% ± 29.5 | 13517 | 363 | 37.5 | 13.4 |
