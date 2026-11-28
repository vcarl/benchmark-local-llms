# qwen3.5-2b-mlx: Pre-release (draft)

> Qwen3.5-2B on mlx 4bit, Apple M5 Max 128GB. Pass rate 12.7% ± 3.9 (95% CI), rank 77 of 79, tier 16. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Qwen3.5-2B (`mlx-community/Qwen3.5-2B-4bit`)
- Runtime: mlx; versions: mlx-lm 0.31.3
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx · t0.7 · maxTokens 2048 · topP default · topK default · minP default · presencePenalty default · chatTemplateKwargs default · weights unknown
- Config hash: `97d13649df2f50d8bd8849e709298f727d735d7944d21720bb78ab97c2d2183d` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: `unknown` (prefix)
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `37f9f14`
- Samples per item: 1; submitters: local
- Executed: 2026-06-21T00:59:57.741Z – 2026-11-19T16:25:17.908Z

## Score
- Pass rate: 12.7% ± 3.9 (84/661 items); core 15.5%, stretch 1.5%
- Rank 77 of 79, tier 16 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: partial; challenges 22/23, items 649/661
- Failures (sample lines): thinking_truncated 254, loop 186, no_answer 97, wrong 21, near_miss 6, length_cutoff 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 771020 total, 1188 per item
- Wall time: 3382 s total, 5.2 s per item
- Generation speed: 304.0 tok/s
- Peak memory: 1.6 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 0/13 | 0.0% | 6144 | 82 | 254.0 | 1.6 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 0/12 | 0.0% | 24576 | 76 | 334.8 | 1.5 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 3/12 | 25.0% ± 28.7 | 19187 | 68 | 283.8 | 1.6 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 1/12 | 8.3% | 21009 | 68 | 333.6 | 1.5 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 0/10 | 0.0% ± 0.0 | 20480 | 71 | 289.6 | 1.6 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | not_run | 0/12 | 0.0% | — | — | — | — |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 0/35 | 0.0% ± 0.0 | 53248 | 218 | 297.7 | 1.6 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 2/26 | 7.7% ± 11.0 | 47306 | 165 | 287.4 | 1.6 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 1/12 | 8.3% | 14613 | 72 | 247.6 | 1.5 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 4/7 | 57.1% ± 49.4 | 6118 | 25 | 290.6 | 1.6 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 0/26 | 0.0% ± 0.0 | 38912 | 162 | 291.2 | 1.6 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 3/36 | 8.3% | 54858 | 199 | 332.6 | 1.5 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 0/12 | 0.0% | 10240 | 68 | 250.9 | 1.5 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 2/10 | 20.0% ± 30.2 | 9037 | 41 | 324.4 | 1.5 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 1/8 | 12.5% | 10577 | 89 | 164.9 | 1.5 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 6/13 | 46.2% ± 31.4 | 13582 | 51 | 335.7 | 1.5 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 0/9 | 0.0% | 8192 | 62 | 249.5 | 1.5 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 0/4 | 0.0% | 6144 | 26 | 285.6 | 1.6 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 0/9 | 0.0% | 6144 | 48 | 248.1 | 1.5 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 0/29 | 0.0% ± 0.0 | 28672 | 149 | 305.0 | 1.5 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 56/316 | 17.7% ± 6.5 | 308363 | 1401 | 329.1 | 1.5 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 3/12 | 25.0% | 17433 | 74 | 247.1 | 1.5 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 2/26 | 7.7% ± 18.5 | 46185 | 170 | 285.9 | 1.6 |
