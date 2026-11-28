# llama3.1-8b-llamacpp: Pre-release (draft)

> Meta-Llama-3.1-8B-Instruct on llamacpp Q8_0, Apple M5 Max 128GB. Pass rate 44.0% ± 5.5 (95% CI), rank 63 of 79, tier 12. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Meta-Llama-3.1-8B-Instruct (`bartowski/Meta-Llama-3.1-8B-Instruct-GGUF`)
- Runtime: llamacpp; versions: llama.cpp b12359 (b1b770d90)
- Quant: Q8_0; temperature 0.7
- Config hash: `cfa6c2f06e097bb011a2e540a1c30ecccf46e9987e80fc6d1b1f1d9a60160c76` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `f2e8cc0`
- Samples per item: 1; submitters: local
- Executed: 2026-11-20T11:45:10.846Z – 2026-11-20T12:12:42.865Z

## Score
- Pass rate: 44.0% ± 5.5 (291/661 items); core 48.9%, stretch 24.8%
- Rank 63 of 79, tier 12 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 306, near_miss 58, no_answer 5, length_cutoff 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 83959 total, 127 per item
- Wall time: 1650 s total, 2.5 s per item
- Generation speed: 59.8 tok/s
- Peak memory: 27.9 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 2/13 | 15.4% | 557 | 10 | 60.6 | 16.5 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 4/12 | 33.3% | 164 | 3 | 60.5 | 16.5 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 11/12 | 91.7% ± 18.3 | 750 | 13 | 60.5 | 16.8 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 10/12 | 83.3% | 930 | 17 | 60.5 | 16.8 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 678 | 12 | 60.7 | 17.2 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 1/12 | 8.3% | 4500 | 75 | 60.3 | 17.5 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 10/35 | 28.6% ± 14.9 | 2160 | 37 | 60.1 | 17.7 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 9/26 | 34.6% ± 19.6 | 623 | 11 | 60.3 | 17.9 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 9/12 | 75.0% | 1016 | 18 | 60.3 | 17.9 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 6/7 | 85.7% ± 35.0 | 139 | 3 | 59.7 | 17.9 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 7/26 | 26.9% ± 23.5 | 7544 | 127 | 60.2 | 18.9 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 9/36 | 25.0% | 5201 | 89 | 60.1 | 19.7 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 9/12 | 75.0% | 2072 | 35 | 60.4 | 19.9 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 5/10 | 50.0% ± 37.7 | 488 | 9 | 59.9 | 19.9 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 5/8 | 62.5% | 44 | 92 | 45.4 | 26.2 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 8/13 | 61.5% ± 30.6 | 983 | 17 | 62.2 | 27.0 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 2/9 | 22.2% | 1292 | 22 | 61.6 | 27.0 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 557 | 9 | 61.3 | 27.0 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 497 | 10 | 60.0 | 27.0 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 1/29 | 3.4% ± 9.5 | 7866 | 139 | 57.3 | 27.0 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 149/316 | 47.2% ± 7.8 | 31337 | 657 | 59.9 | 27.9 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 2/12 | 16.7% | 6039 | 103 | 59.8 | 27.9 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 11/26 | 42.3% ± 22.5 | 8522 | 144 | 59.8 | 27.9 |
