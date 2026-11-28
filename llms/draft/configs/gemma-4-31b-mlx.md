# gemma-4-31b-mlx: Pre-release (draft)

> gemma-4-31b-it on mlx 4bit, Apple M5 Max 128GB. Pass rate 86.1% ± 4.9 (95% CI), rank 23 of 79, tier 5. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: gemma-4-31b-it (`mlx-community/gemma-4-31b-it-4bit`)
- Runtime: mlx; versions: mlx-lm 0.31.3
- Quant: 4bit; temperature 1
- Variant (what sets it apart from the model's other rows): runtime mlx · chatTemplateKwargs {"enable_thinking":false}
- Config hash: `c8b34bdd0bdbd3d9788c18d24523aad77ac6c8a322dd4eafdc663188b831cb48` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `d9568bc18058b904f584d6a1423a26e745d63b22`
- Samples per item: 1; submitters: local
- Executed: 2026-11-24T21:27:57.529Z – 2026-11-24T22:23:13.748Z

## Score
- Pass rate: 86.1% ± 4.9 (569/661 items); core 94.9%, stretch 51.1%
- Rank 23 of 79, tier 5 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 92

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 57132 total, 86 per item
- Wall time: 3329 s total, 5.0 s per item
- Generation speed: 24.8 tok/s
- Peak memory: 16.6 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 8/13 | 61.5% | 1909 | 74 | 27.5 | 16.6 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 353 | 17 | 28.8 | 16.6 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 1029 | 41 | 28.3 | 16.6 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 1011 | 43 | 27.9 | 16.6 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 400 | 17 | 28.7 | 16.6 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 11/12 | 91.7% | 4886 | 182 | 27.5 | 16.6 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 22/35 | 62.9% ± 21.8 | 115 | 15 | 24.7 | 16.6 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 21/26 | 80.8% ± 16.2 | 614 | 29 | 29.2 | 16.6 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 1407 | 56 | 27.8 | 16.6 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 43 | 4 | 33.8 | 16.6 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 16/26 | 61.5% ± 30.3 | 7303 | 276 | 27.2 | 16.6 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 29/36 | 80.6% | 2633 | 124 | 27.5 | 16.6 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 12/12 | 100.0% | 713 | 29 | 28.5 | 16.6 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 472 | 20 | 25.3 | 16.6 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 6/8 | 75.0% | 38 | 255 | 0.6 | 16.6 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 11/13 | 84.6% ± 22.7 | 583 | 27 | 28.7 | 16.6 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 9/9 | 100.0% | 513 | 23 | 28.2 | 16.6 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 759 | 29 | 27.8 | 16.6 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 408 | 22 | 28.0 | 16.6 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 1/29 | 3.4% ± 9.5 | 1338 | 61 | 27.1 | 16.6 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 310/316 | 98.1% ± 2.1 | 23410 | 1701 | 23.1 | 16.6 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 7/12 | 58.3% | 847 | 42 | 27.0 | 16.6 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 18/26 | 69.2% ± 32.6 | 6348 | 243 | 26.9 | 16.6 |
