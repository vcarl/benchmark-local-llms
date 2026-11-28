# qwen3.5-0.8b-omlx: Pre-release (draft)

> Qwen3.5-0.8B on omlx 4bit, Apple M5 Max 128GB. Pass rate 20.3% ± 4.8 (95% CI), rank 73 of 79, tier 15. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Qwen3.5-0.8B (`mlx-community/Qwen3.5-0.8B-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime omlx · t0.7 · maxTokens 32768 · topP 0.8 · topK 20 · minP 0 · presencePenalty 1.5 · chatTemplateKwargs default · weights unknown
- Config hash: `ad7c36ff1c7b8c4363d19e3a527e9a398dfecc0a368fa6435a701b8eb7730547` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: `unknown` (prefix)
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `37f9f14`
- Samples per item: 1; submitters: local
- Executed: 2026-10-23T06:46:18.657Z – 2026-11-19T06:57:56.188Z

## Score
- Pass rate: 20.3% ± 4.8 (134/661 items); core 21.0%, stretch 17.3%
- Rank 73 of 79, tier 15 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: partial; challenges 22/23, items 649/661
- Failures (sample lines): wrong 464, no_answer 23, loop 15, near_miss 12, length_cutoff 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 88674 total, 137 per item
- Wall time: 632 s total, 1.0 s per item
- Generation speed: 291.9 tok/s
- Peak memory: 1.9 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 0/13 | 0.0% | 33 | 55 | 20.7 | 1.8 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 3/12 | 25.0% | 113 | 2 | 60.4 | 1.8 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 2/12 | 16.7% ± 24.7 | 1274 | 4 | 289.4 | 1.8 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 3/12 | 25.0% | 1133 | 4 | 272.5 | 1.8 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 2/10 | 20.0% ± 30.2 | 372 | 2 | 181.9 | 1.8 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | not_run | 0/12 | 0.0% | — | — | — | — |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 9/35 | 25.7% ± 18.7 | 408 | 6 | 74.0 | 1.8 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 3/26 | 11.5% ± 13.2 | 506 | 4 | 117.6 | 1.8 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 3/12 | 25.0% | 1340 | 5 | 297.4 | 1.8 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 3/7 | 42.9% ± 49.4 | 40 | 1 | 40.3 | 1.8 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 6/26 | 23.1% ± 14.2 | 15199 | 108 | 409.4 | 1.9 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 2/36 | 5.6% | 2558 | 11 | 230.6 | 1.8 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 5/12 | 41.7% | 927 | 3 | 265.1 | 1.8 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 2/10 | 20.0% ± 30.2 | 10954 | 27 | 404.8 | 1.9 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 4/8 | 50.0% | 143 | 16 | 8.9 | 1.9 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 2/13 | 15.4% ± 22.7 | 1437 | 5 | 298.0 | 1.8 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 0/9 | 0.0% | 270 | 2 | 141.4 | 1.9 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 2/4 | 50.0% | 364 | 1 | 271.2 | 1.9 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 1/9 | 11.1% | 303 | 2 | 158.5 | 1.9 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 0/29 | 0.0% ± 0.0 | 146 | 4 | 35.0 | 1.9 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 76/316 | 24.1% ± 8.5 | 46774 | 245 | 308.8 | 1.9 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 0/12 | 0.0% | 618 | 3 | 205.7 | 1.9 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 6/26 | 23.1% ± 23.4 | 3762 | 121 | 346.2 | 1.9 |
