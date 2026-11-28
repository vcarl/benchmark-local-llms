# nemotron-nano-8b-llamacpp: Pre-release (draft)

> Llama-3.1-Nemotron-Nano-8B-v1 on llamacpp Q8_0, Apple M5 Max 128GB. Pass rate 51.4% ± 6.2 (95% CI), rank 61 of 79, tier 11. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Llama-3.1-Nemotron-Nano-8B-v1 (`bartowski/nvidia_Llama-3.1-Nemotron-Nano-8B-v1-GGUF`)
- Runtime: llamacpp; versions: llama.cpp b12359 (b1b770d90)
- Quant: Q8_0; temperature 0.6
- Variant (what sets it apart from the model's other rows): chatTemplate nemotron-nano-8b-v1 · weights 4038c132c5f0
- Config hash: `77060fb4661f306b7c7152bcc6a6eaa50c6879f75c5053c906acaa75047d4577` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: `4038c132c5f0` (prefix)
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `1ac5f98`, `2720d72`
- Samples per item: 1; submitters: local
- Executed: 2026-11-20T16:45:34.764Z – 2026-11-20T22:29:16.717Z

## Score
- Pass rate: 51.4% ± 6.2 (340/661 items); core 54.5%, stretch 39.1%
- Rank 61 of 79, tier 11 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 272, near_miss 20, loop 10, thinking_truncated 9, length_cutoff 7, no_answer 3

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 405248 total, 613 per item
- Wall time: 8183 s total, 12.4 s per item
- Generation speed: 57.3 tok/s
- Peak memory: 30.5 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 2/13 | 15.4% | 23680 | 401 | 59.2 | 17.9 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 7/12 | 58.3% | 252 | 5 | 60.5 | 17.9 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 10899 | 187 | 58.6 | 17.2 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 11/12 | 91.7% | 21059 | 354 | 59.8 | 19.8 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 7/10 | 70.0% ± 34.6 | 1254 | 21 | 60.8 | 17.3 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 2/12 | 16.7% | 13255 | 220 | 60.5 | 21.4 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 17/35 | 48.6% ± 20.3 | 82771 | 1536 | 57.4 | 22.9 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 3/26 | 11.5% ± 13.2 | 1213 | 147 | 61.2 | 24.0 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 5/12 | 41.7% | 1125 | 20 | 60.5 | 26.0 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 3/7 | 42.9% ± 49.4 | 47 | 1 | 59.8 | 24.0 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 9/26 | 34.6% ± 21.9 | 78884 | 1429 | 55.3 | 26.3 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 7/36 | 19.4% | 14184 | 398 | 57.9 | 27.2 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 5/12 | 41.7% | 1463 | 25 | 60.4 | 27.2 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 4/10 | 40.0% ± 36.9 | 1073 | 19 | 59.5 | 26.3 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 5/8 | 62.5% | 88 | 92 | 50.5 | 30.5 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 5/13 | 38.5% ± 30.6 | 106 | 2 | 59.8 | 26.3 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 3/9 | 33.3% | 12480 | 430 | 55.8 | 30.5 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 3/4 | 75.0% | 1092 | 19 | 58.1 | 26.5 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 1505 | 26 | 60.3 | 30.5 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 3/29 | 10.3% ± 28.5 | 27035 | 612 | 57.0 | 30.5 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 198/316 | 62.7% ± 8.5 | 20147 | 563 | 60.9 | 30.5 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 1/12 | 8.3% | 16474 | 337 | 60.0 | 30.5 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 19/26 | 73.1% ± 13.1 | 75162 | 1341 | 56.1 | 27.0 |
