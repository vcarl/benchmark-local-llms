# qwen3.5-2b-omlx: Pre-release (draft)

> Qwen3.5-2B on omlx 4bit, Apple M5 Max 128GB. Pass rate 29.3% ± 5.8 (95% CI), rank 72 of 79, tier 14. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Qwen3.5-2B (`mlx-community/Qwen3.5-2B-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 1
- Variant (what sets it apart from the model's other rows): runtime omlx · t1 · maxTokens 32768 · topP 1 · topK 20 · minP 0 · presencePenalty 2 · chatTemplateKwargs default · weights 0a01265cff34
- Config hash: `11cbdc9ad2172f793483b645062d77782e32e0c9ecdcd9f7dbf591408f05b70a` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: `0a01265cff34` (prefix)
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `a11a8b3`
- Samples per item: 1; submitters: local
- Executed: 2026-11-19T17:45:02.347Z – 2026-11-20T03:23:00.192Z

## Score
- Pass rate: 29.3% ± 5.8 (194/661 items); core 30.9%, stretch 23.3%
- Rank 72 of 79, tier 14 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 390, loop 34, near_miss 24, no_answer 19

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 234122 total, 354 per item
- Wall time: 2032 s total, 3.1 s per item
- Generation speed: 293.1 tok/s
- Peak memory: 2.9 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 1/13 | 7.7% | 7468 | 104 | 284.2 | 2.9 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 0/12 | 0.0% | 115 | 2 | 69.0 | 2.9 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 4/12 | 33.3% ± 31.3 | 1426 | 6 | 399.2 | 2.9 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 4/12 | 33.3% | 1412 | 6 | 425.5 | 2.9 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 5/10 | 50.0% ± 37.7 | 417 | 2 | 293.2 | 2.9 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 0/12 | 0.0% | 17033 | 386 | 305.4 | 2.9 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 10/35 | 28.6% ± 22.4 | 3087 | 58 | 226.4 | 2.9 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 4/26 | 15.4% ± 14.9 | 1759 | 9 | 253.2 | 2.9 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 4/12 | 33.3% | 1344 | 6 | 433.2 | 2.9 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 5/7 | 71.4% ± 45.1 | 35 | 9 | 42.3 | 2.9 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 4/26 | 15.4% ± 23.0 | 44735 | 433 | 289.4 | 2.9 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 3/36 | 8.3% | 5771 | 24 | 332.4 | 2.9 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 3/12 | 25.0% | 1980 | 8 | 383.0 | 2.9 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 2/10 | 20.0% ± 30.2 | 615 | 19 | 256.9 | 2.9 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 5/8 | 62.5% | 33 | 16 | 2.1 | 2.9 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 2/13 | 15.4% ± 22.7 | 500 | 3 | 169.0 | 2.9 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 1/9 | 11.1% | 1980 | 30 | 314.5 | 2.9 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 3/4 | 75.0% | 909 | 3 | 313.2 | 2.9 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 5/9 | 55.6% | 433 | 3 | 421.3 | 2.9 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 0/29 | 0.0% ± 0.0 | 179 | 27 | 41.0 | 2.9 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 116/316 | 36.7% ± 9.3 | 34876 | 297 | 332.6 | 2.9 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 0/12 | 0.0% | 754 | 4 | 266.0 | 2.9 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 13/26 | 50.0% ± 24.8 | 107261 | 579 | 296.3 | 2.9 |
