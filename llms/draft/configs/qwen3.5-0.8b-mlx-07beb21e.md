# qwen3.5-0.8b-mlx: Pre-release (draft)

> Qwen3.5-0.8B on mlx 4bit, Apple M5 Max 128GB. Pass rate 0.8% ± 0.6 (95% CI), rank 79 of 79, tier 17. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Qwen3.5-0.8B (`mlx-community/Qwen3.5-0.8B-4bit`)
- Runtime: mlx; versions: mlx-lm 0.31.3
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx · t0.7 · maxTokens 2048 · topP default · topK default · minP default · presencePenalty default · chatTemplateKwargs default · weights unknown
- Config hash: `07beb21eb50d1d71e830be3a0ea871b498f813ae40197444e9be77a51524634c` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: `unknown` (prefix)
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `37f9f14`
- Samples per item: 1; submitters: local
- Executed: 2026-06-21T00:54:58.358Z – 2026-11-19T14:14:28.345Z

## Score
- Pass rate: 0.8% ± 0.6 (5/661 items); core 0.8%, stretch 0.8%
- Rank 79 of 79, tier 17 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: partial; challenges 22/23, items 649/661
- Failures (sample lines): loop 267, thinking_truncated 267, no_answer 98, wrong 11, near_miss 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 756576 total, 1166 per item
- Wall time: 2315 s total, 3.6 s per item
- Generation speed: 486.9 tok/s
- Peak memory: 1.0 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 0/13 | 0.0% | 4096 | 38 | 398.4 | 0.9 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 1/12 | 8.3% | 10861 | 39 | 533.5 | 0.9 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 0/12 | 0.0% ± 0.0 | 21037 | 44 | 478.8 | 1.0 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 0/12 | 0.0% | 16384 | 42 | 531.9 | 0.9 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 0/10 | 0.0% ± 0.0 | 20480 | 43 | 474.6 | 1.0 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | not_run | 0/12 | 0.0% | — | — | — | — |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 1/35 | 2.9% ± 5.8 | 46632 | 122 | 481.8 | 1.0 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 0/26 | 0.0% ± 0.0 | 47820 | 104 | 460.9 | 1.0 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 0/12 | 0.0% | 4096 | 32 | 370.4 | 0.9 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 1/7 | 14.3% ± 35.0 | 8289 | 21 | 481.5 | 0.9 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 0/26 | 0.0% ± 0.0 | 36864 | 91 | 478.5 | 1.0 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 0/36 | 0.0% | 54030 | 131 | 528.6 | 0.9 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 0/12 | 0.0% | 6144 | 37 | 374.0 | 0.9 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 0/10 | 0.0% ± 0.0 | 4101 | 27 | 506.1 | 0.9 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 0/8 | 0.0% | 8192 | 59 | 278.4 | 0.9 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 0/13 | 0.0% ± 0.0 | 18432 | 45 | 535.3 | 0.9 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 0/9 | 0.0% | 6144 | 32 | 370.3 | 0.9 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 0/4 | 0.0% | 4096 | 31 | 265.0 | 0.9 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 0/9 | 0.0% | 8192 | 31 | 373.7 | 0.9 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 0/29 | 0.0% ± 0.0 | 24576 | 95 | 479.9 | 0.9 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 2/316 | 0.6% ± 0.8 | 342622 | 1080 | 518.1 | 0.9 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 0/12 | 0.0% | 12288 | 59 | 369.2 | 0.9 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 0/26 | 0.0% ± 0.0 | 51200 | 113 | 468.8 | 1.0 |
