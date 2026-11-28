# qwen3.5-35b-a3b-mlx: Pre-release (draft)

> Qwen3.5-35B-A3B on mlx 4bit, Apple M5 Max 128GB. Pass rate 79.0% ± 5.4 (95% CI), rank 28 of 79, tier 6. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Qwen3.5-35B-A3B (`mlx-community/Qwen3.5-35B-A3B-4bit`)
- Runtime: mlx; versions: mlx-lm 0.31.3
- Quant: 4bit; temperature 1
- Variant (what sets it apart from the model's other rows): runtime mlx · chatTemplateKwargs {"enable_thinking":true}
- Config hash: `a54a819bfd0ccb1f835ee05683c19bd92c04aa13d13669780af829598b24a7bd` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `a11a8b3`
- Samples per item: 1; submitters: local
- Executed: 2026-11-20T07:24:50.378Z – 2026-11-20T10:51:22.836Z

## Score
- Pass rate: 79.0% ± 5.4 (522/661 items); core 86.2%, stretch 50.4%
- Rank 28 of 79, tier 6 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): loop 111, wrong 19, thinking_truncated 8, near_miss 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 746263 total, 1129 per item
- Wall time: 12173 s total, 18.4 s per item
- Generation speed: 128.7 tok/s
- Peak memory: 18.9 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 10/13 | 76.9% | 23024 | 260 | 131.7 | 18.9 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 8396 | 64 | 136.2 | 18.9 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 5/12 | 41.7% ± 32.7 | 6976 | 408 | 134.1 | 18.9 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 11/12 | 91.7% | 10437 | 90 | 135.5 | 18.9 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 7/10 | 70.0% ± 34.6 | 9871 | 445 | 135.2 | 18.9 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 8/12 | 66.7% | 35968 | 452 | 133.6 | 18.9 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 29/35 | 82.9% ± 25.4 | 34645 | 626 | 135.7 | 18.9 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 2/26 | 7.7% ± 11.0 | 209453 | 2237 | 120.3 | 18.9 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 10/12 | 83.3% | 29265 | 221 | 134.7 | 18.9 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 6/7 | 85.7% ± 35.0 | 1885 | 57 | 137.2 | 18.9 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 6/26 | 23.1% ± 26.1 | 45610 | 1451 | 123.4 | 18.9 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 34/36 | 94.4% | 97170 | 825 | 133.8 | 18.9 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 6/12 | 50.0% | 19141 | 359 | 133.6 | 18.9 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 5188 | 40 | 136.5 | 18.9 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 5/8 | 62.5% | 3181 | 143 | 118.5 | 18.9 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 8662 | 68 | 137.0 | 18.9 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 1/9 | 11.1% | 35665 | 603 | 120.6 | 18.9 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 3718 | 28 | 135.8 | 18.9 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 6/9 | 66.7% | 4596 | 150 | 135.3 | 18.9 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 6/29 | 20.7% ± 37.6 | 15674 | 1574 | 133.9 | 18.9 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 306/316 | 96.8% ± 2.3 | 82075 | 775 | 134.7 | 18.9 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 12/12 | 100.0% | 33741 | 256 | 133.6 | 18.9 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 13/26 | 50.0% ± 37.0 | 21922 | 1041 | 134.9 | 18.9 |
