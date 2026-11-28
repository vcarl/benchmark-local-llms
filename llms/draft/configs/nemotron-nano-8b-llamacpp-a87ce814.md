# nemotron-nano-8b-llamacpp: Pre-release (draft)

> Llama-3.1-Nemotron-Nano-8B-v1 on llamacpp Q8_0, Apple M5 Max 128GB. Pass rate 50.4% ± 6.5 (95% CI), rank 62 of 79, tier 11. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Llama-3.1-Nemotron-Nano-8B-v1 (`bartowski/nvidia_Llama-3.1-Nemotron-Nano-8B-v1-GGUF`)
- Runtime: llamacpp; versions: llama.cpp b12359 (b1b770d90)
- Quant: Q8_0; temperature 0.6
- Variant (what sets it apart from the model's other rows): chatTemplate default · weights unknown
- Config hash: `a87ce814f9bc88480e3bf83d5461004217a3e5da7db8cf72cd094cdb974bba8d` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: `unknown` (prefix)
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `a11a8b3`
- Samples per item: 1; submitters: local
- Executed: 2026-11-20T10:52:04.618Z – 2026-11-20T11:42:45.364Z

## Score
- Pass rate: 50.4% ± 6.5 (333/661 items); core 56.8%, stretch 24.8%
- Rank 62 of 79, tier 11 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 281, no_answer 17, near_miss 15, loop 7, execution_error 4, length_cutoff 3, thinking_truncated 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 147620 total, 223 per item
- Wall time: 3173 s total, 4.8 s per item
- Generation speed: 57.9 tok/s
- Peak memory: 19.5 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 1/13 | 7.7% | 276 | 5 | 59.8 | 8.5 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 9/12 | 75.0% | 131 | 3 | 59.5 | 8.5 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 7020 | 116 | 60.6 | 9.0 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 18588 | 459 | 57.3 | 10.6 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 5/10 | 50.0% ± 37.7 | 417 | 7 | 59.8 | 10.6 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 0/12 | 0.0% | 867 | 15 | 59.7 | 11.3 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 12/35 | 34.3% ± 17.6 | 27926 | 553 | 56.9 | 13.3 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 5/26 | 19.2% ± 16.2 | 935 | 17 | 59.8 | 13.6 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 3/12 | 25.0% | 833 | 15 | 59.5 | 13.6 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 3/7 | 42.9% ± 49.4 | 39 | 1 | 55.8 | 13.6 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 7/26 | 26.9% ± 30.2 | 24983 | 478 | 57.3 | 15.1 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 6/36 | 16.7% | 3148 | 88 | 59.6 | 16.1 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 8/12 | 66.7% | 1573 | 27 | 60.0 | 16.4 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 4/10 | 40.0% ± 36.9 | 1059 | 80 | 59.8 | 16.8 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 4/8 | 50.0% | 97 | 14 | 55.7 | 16.8 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 4/13 | 30.8% ± 29.0 | 527 | 9 | 59.9 | 17.7 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 3/9 | 33.3% | 10136 | 178 | 57.1 | 17.7 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 3/4 | 75.0% | 1258 | 21 | 59.8 | 17.7 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 8/9 | 88.9% | 569 | 11 | 59.8 | 17.7 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 1/29 | 3.4% ± 9.5 | 1905 | 34 | 59.8 | 17.7 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 210/316 | 66.5% ± 7.9 | 16087 | 402 | 59.3 | 19.5 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 1/12 | 8.3% | 741 | 147 | 59.8 | 19.5 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 12/26 | 46.2% ± 22.0 | 28505 | 493 | 58.0 | 19.5 |
