# qwen3.5-2b-mlx: Pre-release (draft)

> Qwen3.5-2B on mlx 4bit, Apple M5 Max 128GB. Pass rate 32.8% ± 5.7 (95% CI), rank 70 of 79, tier 14. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Qwen3.5-2B (`mlx-community/Qwen3.5-2B-4bit`)
- Runtime: mlx; versions: mlx-lm 0.31.3
- Quant: 4bit; temperature 1
- Variant (what sets it apart from the model's other rows): runtime mlx · t1 · maxTokens 32768 · topP 1 · topK 20 · minP 0 · presencePenalty 2 · chatTemplateKwargs {"enable_thinking":false} · weights 0a01265cff34
- Config hash: `e93c20d4cea1b8881b4e2c3db2126c51464bdf4900c81355fc5b628d8eb94834` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: `0a01265cff34` (prefix)
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `a11a8b3`
- Samples per item: 1; submitters: local
- Executed: 2026-11-19T17:37:09.388Z – 2026-11-20T03:45:53.291Z

## Score
- Pass rate: 32.8% ± 5.7 (217/661 items); core 36.6%, stretch 18.0%
- Rank 70 of 79, tier 14 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 327, loop 71, near_miss 29, no_answer 12, length_cutoff 5

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 201934 total, 305 per item
- Wall time: 1488 s total, 2.3 s per item
- Generation speed: 277.4 tok/s
- Peak memory: 1.6 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 1/13 | 7.7% | 32798 | 139 | 273.7 | 1.6 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 2/12 | 16.7% | 39 | 4 | 66.4 | 1.6 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 4/12 | 33.3% ± 31.3 | 787 | 8 | 330.5 | 1.6 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 4/12 | 33.3% | 681 | 21 | 327.2 | 1.6 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 7/10 | 70.0% ± 34.6 | 478 | 3 | 334.2 | 1.6 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 0/12 | 0.0% | 98796 | 436 | 272.8 | 1.5 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 6/35 | 17.1% ± 15.9 | 477 | 32 | 277.3 | 1.6 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 8/26 | 30.8% ± 19.0 | 467 | 20 | 351.0 | 1.6 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 5/12 | 41.7% | 1353 | 6 | 325.5 | 1.6 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 6/7 | 85.7% ± 35.0 | 159 | 1 | 347.3 | 1.6 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 3/26 | 11.5% ± 17.7 | 32793 | 273 | 264.1 | 1.6 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 4/36 | 11.1% | 2438 | 14 | 324.0 | 1.6 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 4/12 | 33.3% | 853 | 15 | 325.0 | 1.6 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 6/10 | 60.0% ± 36.9 | 468 | 3 | 240.5 | 1.6 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 4/8 | 50.0% | 41 | 18 | 10.0 | 1.6 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 3/13 | 23.1% ± 26.5 | 713 | 9 | 331.6 | 1.5 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 0/9 | 0.0% | 258 | 4 | 338.1 | 1.6 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 3/4 | 75.0% | 142 | 4 | 334.8 | 1.6 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 3/9 | 33.3% | 569 | 3 | 327.5 | 1.6 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 1/29 | 3.4% ± 9.5 | 93 | 88 | 192.0 | 1.6 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 132/316 | 41.8% ± 8.6 | 26827 | 265 | 321.5 | 1.6 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 0/12 | 0.0% | 681 | 4 | 326.8 | 1.6 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 11/26 | 42.3% ± 18.6 | 23 | 120 | 80.2 | 1.6 |
