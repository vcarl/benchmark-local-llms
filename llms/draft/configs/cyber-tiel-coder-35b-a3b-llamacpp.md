# cyber-tiel-coder-35b-a3b-llamacpp: Pre-release (draft)

> Cyber-Tiel-Coder-35B-A3B on llamacpp UD-Q8_K_XL, Apple M5 Max 128GB. Pass rate 95.0% ± 1.9 (95% CI), rank 6 of 79, tier 2. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Cyber-Tiel-Coder-35B-A3B (`peculiar-ragdoll/Cyber-Tiel-Coder-35B-A3B-GGUF`)
- Runtime: llamacpp; versions: llama.cpp b12359 (b1b770d90)
- Quant: UD-Q8_K_XL; temperature 0.6
- Config hash: `444e91870bf64efd696dcc3c9ac98407aafd92ae1e2f9b28222010fbfbf70821` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `95a1a9e5ef4084611e6bd9939233f2b66d6e067c`
- Samples per item: 1; submitters: local
- Executed: 2026-11-22T19:12:57.680Z – 2026-11-22T20:50:16.337Z

## Score
- Pass rate: 95.0% ± 1.9 (628/661 items); core 95.8%, stretch 91.7%
- Rank 6 of 79, tier 2 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 30, thinking_truncated 3

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 526253 total, 796 per item
- Wall time: 5878 s total, 8.9 s per item
- Generation speed: 93.8 tok/s
- Peak memory: 46.6 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 13/13 | 100.0% | 36602 | 390 | 94.2 | 39.5 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 1535 | 17 | 95.6 | 39.5 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 11/12 | 91.7% ± 18.3 | 1869 | 21 | 96.2 | 41.7 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 4697 | 50 | 97.7 | 44.1 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 9/10 | 90.0% ± 22.6 | 2600 | 27 | 97.7 | 44.4 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 12/12 | 100.0% | 14812 | 153 | 97.7 | 45.3 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 35/35 | 100.0% ± 0.0 | 10065 | 106 | 97.8 | 46.3 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 14/26 | 53.8% ± 20.5 | 8771 | 92 | 97.6 | 46.3 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 4728 | 50 | 97.8 | 46.3 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 260 | 3 | 96.7 | 46.3 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 21/26 | 80.8% ± 22.0 | 117172 | 1269 | 92.5 | 46.3 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 34/36 | 94.4% | 16817 | 178 | 97.7 | 46.3 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 12/12 | 100.0% | 5433 | 57 | 97.7 | 46.3 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 720 | 8 | 97.3 | 46.3 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 7/8 | 87.5% | 1306 | 84 | 85.8 | 46.3 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 873 | 10 | 97.1 | 46.6 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 8/9 | 88.9% | 4195 | 44 | 97.7 | 46.6 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 432 | 5 | 97.3 | 46.6 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 673 | 9 | 97.7 | 46.6 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 25/29 | 86.2% ± 27.5 | 205223 | 2240 | 91.8 | 46.6 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 312/316 | 98.7% ± 1.2 | 54559 | 721 | 96.8 | 46.6 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 12/12 | 100.0% | 8904 | 94 | 97.5 | 46.6 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 24/26 | 92.3% ± 11.2 | 24007 | 249 | 97.5 | 46.6 |
