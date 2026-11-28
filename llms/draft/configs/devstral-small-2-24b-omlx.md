# devstral-small-2-24b-omlx: Pre-release (draft)

> Devstral-Small-2-24B-Instruct-2512 on omlx 4bit, Apple M5 Max 128GB. Pass rate 73.4% ± 6.1 (95% CI), rank 43 of 79, tier 8. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Devstral-Small-2-24B-Instruct-2512 (`mlx-community/Devstral-Small-2-24B-Instruct-2512-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 0.15
- Variant (what sets it apart from the model's other rows): runtime omlx · t0.15 · weights 005c35b95c4f
- Config hash: `02c624f0c9f0df7c1c196c6211f012f4f8bfc277beba7e4dd697711c7905a873` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: `005c35b95c4f` (prefix)
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `d9568bc18058b904f584d6a1423a26e745d63b22`
- Samples per item: 1; submitters: local
- Executed: 2026-11-24T22:23:54.120Z – 2026-11-24T23:22:23.322Z

## Score
- Pass rate: 73.4% ± 6.1 (485/661 items); core 81.8%, stretch 39.8%
- Rank 43 of 79, tier 8 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 165, near_miss 7, length_cutoff 3, no_answer 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 99223 total, 150 per item
- Wall time: 3537 s total, 5.4 s per item
- Generation speed: 34.9 tok/s
- Peak memory: 15.5 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 5/13 | 38.5% | 3057 | 87 | 35.7 | 15.2 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 9/12 | 75.0% | 392 | 14 | 41.2 | 15.2 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 1013 | 30 | 39.2 | 15.2 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 918 | 30 | 38.6 | 15.2 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 470 | 15 | 40.0 | 15.2 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 6/12 | 50.0% | 5602 | 155 | 37.0 | 15.2 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 14/35 | 40.0% ± 22.6 | 3367 | 101 | 34.4 | 15.2 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 14/26 | 53.8% ± 20.5 | 654 | 23 | 36.5 | 15.2 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 1250 | 39 | 38.1 | 15.2 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 36 | 2 | 20.1 | 15.2 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 10/26 | 38.5% ± 25.7 | 26899 | 761 | 35.6 | 15.2 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 18/36 | 50.0% | 2172 | 76 | 39.2 | 15.2 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 8/12 | 66.7% | 1556 | 44 | 38.5 | 15.2 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 339 | 11 | 33.0 | 15.2 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 6/8 | 75.0% | 32 | 183 | 0.3 | 15.3 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 8/13 | 61.5% ± 30.6 | 524 | 18 | 32.8 | 15.3 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 9/9 | 100.0% | 526 | 17 | 39.3 | 15.3 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 469 | 13 | 37.5 | 15.3 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 390 | 16 | 40.1 | 15.3 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 4/29 | 13.8% ± 22.9 | 6025 | 175 | 36.7 | 15.3 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 280/316 | 88.6% ± 5.6 | 19017 | 912 | 35.0 | 15.3 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 3/12 | 25.0% | 768 | 27 | 38.9 | 15.3 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 17/26 | 65.4% ± 29.7 | 23747 | 787 | 36.5 | 15.5 |
