# gpt-oss-20b-omlx: Pre-release (draft)

> gpt-oss-20b on omlx 4bit, Apple M5 Max 128GB. Pass rate 82.1% ± 4.6 (95% CI), rank 27 of 79, tier 6. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: gpt-oss-20b (`mlx-community/gpt-oss-20b-MXFP4-Q4`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 1
- Variant (what sets it apart from the model's other rows): runtime omlx · t1 · maxTokens 32768 · topP 1
- Config hash: `638352d35fc6a896dc5cfff7d6cfe31fbec9ede7648e548f1d50b4e9c400aa0a` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `0c2104433be9dd6bfacac98f6fbed57185f76060`
- Samples per item: 1; submitters: local
- Executed: 2026-11-24T07:44:54.328Z – 2026-11-24T09:38:20.775Z

## Score
- Pass rate: 82.1% ± 4.6 (543/661 items); core 86.7%, stretch 63.9%
- Rank 27 of 79, tier 6 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 98, no_answer 14, near_miss 6

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 1000502 total, 1514 per item
- Wall time: 6911 s total, 10.5 s per item
- Generation speed: 151.9 tok/s
- Peak memory: 11.5 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 8/13 | 61.5% | 50398 | 350 | 145.9 | 11.5 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 2877 | 20 | 174.8 | 11.5 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 8239 | 53 | 165.6 | 11.5 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 11999 | 77 | 163.3 | 11.5 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 9/10 | 90.0% ± 22.6 | 11630 | 75 | 161.5 | 11.5 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 6/12 | 50.0% | 91492 | 627 | 146.9 | 11.5 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 32/35 | 91.4% ± 8.0 | 40719 | 261 | 162.2 | 11.5 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 14/26 | 53.8% ± 20.5 | 18455 | 118 | 166.6 | 11.5 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 7/12 | 58.3% | 14254 | 92 | 162.0 | 11.5 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 2615 | 17 | 169.9 | 11.5 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 14/26 | 53.8% ± 39.1 | 157819 | 1079 | 147.5 | 11.5 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 33/36 | 91.7% | 64757 | 422 | 158.5 | 11.5 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 12/12 | 100.0% | 21646 | 138 | 161.2 | 11.5 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 9/10 | 90.0% ± 22.6 | 5396 | 35 | 166.3 | 11.5 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 4/8 | 50.0% | 16320 | 163 | 132.8 | 11.5 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 3091 | 21 | 175.6 | 11.5 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 6/9 | 66.7% | 18985 | 122 | 159.5 | 11.5 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 1944 | 13 | 168.9 | 11.5 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 8/9 | 88.9% | 3453 | 24 | 167.9 | 11.5 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 8/29 | 27.6% ± 41.4 | 234197 | 1628 | 144.9 | 11.5 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 283/316 | 89.6% ± 4.7 | 106640 | 823 | 165.1 | 11.5 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 9/12 | 75.0% | 28146 | 183 | 157.2 | 11.5 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 21/26 | 80.8% ± 21.3 | 85430 | 571 | 151.7 | 11.5 |
