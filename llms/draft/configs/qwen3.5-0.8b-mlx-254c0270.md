# qwen3.5-0.8b-mlx: Pre-release (draft)

> Qwen3.5-0.8B on mlx 4bit, Apple M5 Max 128GB. Pass rate 16.2% ± 4.9 (95% CI), rank 74 of 79, tier 15. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Qwen3.5-0.8B (`mlx-community/Qwen3.5-0.8B-4bit`)
- Runtime: mlx; versions: mlx-lm 0.31.3
- Quant: 4bit; temperature 1
- Variant (what sets it apart from the model's other rows): runtime mlx · t1 · maxTokens 32768 · topP 1 · topK 20 · minP 0 · presencePenalty 2 · chatTemplateKwargs {"enable_thinking":false} · weights 824b658b5593
- Config hash: `254c027062cfee910524d01a71a04e7bcb871608e35cbe0463f90b47aa461757` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: `824b658b5593` (prefix)
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `a11a8b3`
- Samples per item: 1; submitters: local
- Executed: 2026-11-20T02:39:33.622Z – 2026-11-20T02:52:32.725Z

## Score
- Pass rate: 16.2% ± 4.9 (107/661 items); core 16.3%, stretch 15.8%
- Rank 74 of 79, tier 15 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 505, loop 33, no_answer 13, length_cutoff 3

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 114331 total, 173 per item
- Wall time: 543 s total, 0.8 s per item
- Generation speed: 331.3 tok/s
- Peak memory: 0.9 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 0/13 | 0.0% | 529 | 11 | 469.7 | 0.8 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 3/12 | 25.0% | 127 | 2 | 578.0 | 0.8 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 0/12 | 0.0% ± 0.0 | 526 | 16 | 521.1 | 0.9 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 1/12 | 8.3% | 1294 | 4 | 515.1 | 0.9 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 5/10 | 50.0% ± 37.7 | 457 | 2 | 524.8 | 0.9 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 0/12 | 0.0% | 34486 | 109 | 396.4 | 0.9 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 6/35 | 17.1% ± 14.5 | 1125 | 13 | 474.6 | 0.9 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 1/26 | 3.8% ± 7.9 | 33296 | 88 | 393.1 | 0.9 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 1/12 | 8.3% | 1212 | 4 | 509.6 | 0.9 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 5/7 | 71.4% ± 45.1 | 48 | 1 | 621.5 | 0.9 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 4/26 | 15.4% ± 18.8 | 1628 | 47 | 415.7 | 0.9 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 0/36 | 0.0% | 2166 | 9 | 511.7 | 0.9 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 1/12 | 8.3% | 731 | 11 | 522.4 | 0.9 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 1/10 | 10.0% ± 22.6 | 67 | 4 | 296.2 | 0.9 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 4/8 | 50.0% | 39 | 13 | 6.3 | 0.9 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 0/13 | 0.0% ± 0.0 | 517 | 5 | 476.1 | 0.9 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 0/9 | 0.0% | 32944 | 86 | 391.5 | 0.9 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 2/4 | 50.0% | 96 | 3 | 531.9 | 0.9 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 0/9 | 0.0% | 324 | 2 | 519.8 | 0.9 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 0/29 | 0.0% ± 0.0 | 164 | 4 | 317.7 | 0.9 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 64/316 | 20.3% ± 9.1 | 923 | 58 | 16.4 | 0.9 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 0/12 | 0.0% | 464 | 2 | 514.3 | 0.9 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 9/26 | 34.6% ± 21.3 | 1168 | 49 | 370.1 | 0.9 |
