# gemma-4-26b-a4b-mlx: Pre-release (draft)

> gemma-4-26b-a4b-it on mlx 4bit, Apple M5 Max 128GB. Pass rate 83.1% ± 5.3 (95% CI), rank 25 of 79, tier 6. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: gemma-4-26b-a4b-it (`mlx-community/gemma-4-26b-a4b-it-4bit`)
- Runtime: mlx; versions: mlx-lm 0.31.3
- Quant: 4bit; temperature 1
- Variant (what sets it apart from the model's other rows): runtime mlx · chatTemplateKwargs {"enable_thinking":false}
- Config hash: `fc11fa9046b13a3e8539bf8e711aa7c1fc11fe12d206c8d745e1073a88464d78` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `5653c862687d7fcb57406a72dd5cc3d3e715eccb`
- Samples per item: 1; submitters: local
- Executed: 2026-11-24T21:13:49.191Z – 2026-11-24T21:27:37.041Z

## Score
- Pass rate: 83.1% ± 5.3 (549/661 items); core 91.7%, stretch 48.9%
- Rank 25 of 79, tier 6 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 109, no_answer 2, near_miss 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 63521 total, 96 per item
- Wall time: 827 s total, 1.3 s per item
- Generation speed: 108.3 tok/s
- Peak memory: 14.0 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 7/13 | 53.8% | 2571 | 25 | 116.6 | 13.9 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 452 | 6 | 121.5 | 14.0 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 1047 | 11 | 121.0 | 14.0 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 1034 | 11 | 119.1 | 14.0 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 364 | 5 | 122.2 | 14.0 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 11/12 | 91.7% | 6178 | 55 | 118.6 | 14.0 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 20/35 | 57.1% ± 27.6 | 906 | 14 | 118.5 | 14.0 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 19/26 | 73.1% ± 18.3 | 667 | 10 | 122.8 | 14.0 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 1407 | 15 | 118.7 | 14.0 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 43 | 2 | 129.8 | 14.0 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 15/26 | 57.7% ± 29.4 | 9597 | 87 | 115.5 | 14.0 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 22/36 | 61.1% | 3472 | 39 | 116.2 | 14.0 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 12/12 | 100.0% | 990 | 11 | 120.9 | 14.0 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 9/10 | 90.0% ± 22.6 | 518 | 6 | 99.0 | 14.0 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 6/8 | 75.0% | 38 | 47 | 3.2 | 14.0 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 10/13 | 76.9% ± 26.5 | 720 | 11 | 119.9 | 14.0 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 7/9 | 77.8% | 1029 | 11 | 118.6 | 14.0 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 677 | 6 | 119.7 | 14.0 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 424 | 6 | 118.4 | 14.0 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 0/29 | 0.0% ± 0.0 | 172 | 7 | 90.0 | 14.0 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 306/316 | 96.8% ± 3.0 | 22385 | 359 | 100.4 | 14.0 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 7/12 | 58.3% | 1399 | 15 | 115.2 | 14.0 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 20/26 | 76.9% ± 19.3 | 7431 | 68 | 116.9 | 14.0 |
