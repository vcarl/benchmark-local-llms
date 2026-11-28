# ternary-bonsai-2.5-27b-llamacpp: Pre-release (draft)

> Ternary-Bonsai-2.5-27B on llamacpp Q2_0, Apple M5 Max 128GB. Pass rate 96.2% ± 2.3 (95% CI), rank 5 of 79, tier 2. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Ternary-Bonsai-2.5-27B (`prism-ml/Ternary-Bonsai-2.5-27B-GGUF`)
- Runtime: llamacpp; versions: llama.cpp b12359 (b1b770d90)
- Quant: Q2_0; temperature 1
- Config hash: `9988ef3cb0afd4669efb813aa29b391a5384076c57ba26541be856bdfb356f1f` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `20c052ee1f43470a575e9271faeab4c792ec342f`, `7e60142b7ae5a7417a91788132f411591e208610`, `b71ff506680ace7cc6ad8e122366d3fd7ab24318`
- Samples per item: 1; submitters: local
- Executed: 2026-11-25T19:23:41.113Z – 2026-11-27T07:00:50.568Z

## Score
- Pass rate: 96.2% ± 2.3 (636/661 items); core 97.0%, stretch 93.2%
- Rank 5 of 79, tier 2 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 17, thinking_truncated 8

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 880331 total, 1332 per item
- Wall time: 22910 s total, 34.7 s per item
- Generation speed: 40.2 tok/s
- Peak memory: 27.8 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 11/13 | 84.6% | 100114 | 2522 | 39.8 | 25.3 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 3784 | 89 | 44.9 | 25.3 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 5550 | 125 | 45.5 | 26.1 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 4747 | 112 | 44.9 | 26.7 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 6283 | 142 | 44.8 | 26.7 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 12/12 | 100.0% | 21399 | 484 | 44.4 | 26.7 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 35/35 | 100.0% ± 0.0 | 16800 | 388 | 44.4 | 26.7 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 13/26 | 50.0% ± 20.6 | 67169 | 1640 | 41.1 | 26.7 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 7492 | 188 | 41.6 | 26.8 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 695 | 18 | 41.7 | 26.8 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 23/26 | 88.5% ± 28.2 | 193916 | 4940 | 39.3 | 27.4 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 36/36 | 100.0% | 25795 | 627 | 42.7 | 24.5 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 12/12 | 100.0% | 6211 | 147 | 43.2 | 24.5 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 1626 | 40 | 43.5 | 25.1 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 8/8 | 100.0% | 18716 | 776 | 35.7 | 27.8 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 1460 | 41 | 39.2 | 27.8 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 7/9 | 77.8% | 12618 | 303 | 42.3 | 27.8 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 673 | 16 | 43.8 | 16.7 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 6099 | 149 | 43.1 | 27.8 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 25/29 | 86.2% ± 38.0 | 242426 | 6225 | 39.0 | 27.8 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 315/316 | 99.7% ± 0.6 | 82567 | 2601 | 42.2 | 27.8 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 12/12 | 100.0% | 8613 | 217 | 41.7 | 27.8 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 26/26 | 100.0% ± 0.0 | 45578 | 1119 | 41.1 | 27.8 |
