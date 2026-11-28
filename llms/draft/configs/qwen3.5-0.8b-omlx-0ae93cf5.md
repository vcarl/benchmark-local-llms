# qwen3.5-0.8b-omlx: Pre-release (draft)

> Qwen3.5-0.8B on omlx 4bit, Apple M5 Max 128GB. Pass rate 15.0% ± 3.2 (95% CI), rank 75 of 79, tier 16. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Qwen3.5-0.8B (`mlx-community/Qwen3.5-0.8B-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 1
- Variant (what sets it apart from the model's other rows): runtime omlx · t1 · maxTokens 32768 · topP 1 · topK 20 · minP 0 · presencePenalty 2 · chatTemplateKwargs default · weights 824b658b5593
- Config hash: `0ae93cf56cc4a61a4ec8e2a4b0be71eabb42ccb5d7964ab071fb20773dc579f5` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: `824b658b5593` (prefix)
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `bfb5743`
- Samples per item: 1; submitters: local
- Executed: 2026-11-20T02:03:31.856Z – 2026-11-20T02:39:00.462Z

## Score
- Pass rate: 15.0% ± 3.2 (99/661 items); core 15.0%, stretch 15.0%
- Rank 75 of 79, tier 16 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 478, no_answer 50, loop 26, near_miss 6, length_cutoff 2

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 345083 total, 522 per item
- Wall time: 1901 s total, 2.9 s per item
- Generation speed: 385.8 tok/s
- Peak memory: 1.8 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 1/13 | 7.7% | 1343 | 58 | 261.6 | 1.8 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 2/12 | 16.7% | 155 | 2 | 78.5 | 1.8 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 0/12 | 0.0% ± 0.0 | 2151 | 6 | 514.0 | 1.8 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 1/12 | 8.3% | 2389 | 7 | 565.7 | 1.8 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 4/10 | 40.0% ± 36.9 | 364 | 2 | 325.4 | 1.8 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 0/12 | 0.0% | 36835 | 300 | 427.3 | 1.8 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 7/35 | 20.0% ± 16.1 | 14845 | 38 | 400.9 | 1.8 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 1/26 | 3.8% ± 7.9 | 924 | 5 | 258.6 | 1.8 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 0/12 | 0.0% | 1285 | 4 | 804.0 | 1.8 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 4/7 | 57.1% ± 49.4 | 51 | 1 | 54.0 | 1.8 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 4/26 | 15.4% ± 17.0 | 90290 | 525 | 390.5 | 1.8 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 1/36 | 2.8% | 2699 | 46 | 412.5 | 1.8 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 2/12 | 16.7% | 1105 | 4 | 751.7 | 1.8 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 1/10 | 10.0% ± 22.6 | 531 | 2 | 279.5 | 1.8 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 2/8 | 25.0% | 70 | 10 | 8.5 | 1.8 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 1/13 | 7.7% ± 16.8 | 22214 | 55 | 407.2 | 1.8 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 0/9 | 0.0% | 520 | 30 | 267.2 | 1.8 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 1/4 | 25.0% | 427 | 1 | 435.1 | 1.8 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 1/9 | 11.1% | 298 | 2 | 182.7 | 1.8 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 0/29 | 0.0% ± 0.0 | 147 | 49 | 37.9 | 1.8 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 59/316 | 18.7% ± 5.1 | 24497 | 188 | 324.3 | 1.8 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 0/12 | 0.0% | 476 | 32 | 307.5 | 1.8 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 7/26 | 26.9% ± 11.0 | 141467 | 533 | 394.0 | 1.8 |
