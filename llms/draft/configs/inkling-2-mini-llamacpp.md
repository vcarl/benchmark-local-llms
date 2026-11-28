# inkling-2-mini-llamacpp: Pre-release (draft)

> Inkling-2-Mini on llamacpp IQ4_NL, Apple M5 Max 128GB. Pass rate 98.0% ± 1.1 (95% CI), rank 2 of 79, tier 1. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Inkling-2-Mini (`ggml-org/Inkling-2-Mini-GGUF`)
- Runtime: llamacpp; versions: llama.cpp b12774 (171527522)
- Quant: IQ4_NL; temperature 1
- Config hash: `2d7b24cbb79e4c3020bfaec8137ae3bc44fb01c4814917cba00895250db957f6` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `3b28a9a8da7aa7da67df84f9230245602f16bf94`, `d875260d362fceee597c3ab2da108948d858c078`
- Samples per item: 1; submitters: local
- Executed: 2026-11-27T15:11:14.216Z – 2026-11-28T03:05:00.179Z

## Score
- Pass rate: 98.0% ± 1.1 (648/661 items); core 97.9%, stretch 98.5%
- Rank 2 of 79, tier 1 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 11, no_answer 1, thinking_truncated 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 744181 total, 1126 per item
- Wall time: 17060 s total, 25.8 s per item
- Generation speed: 47.0 tok/s
- Peak memory: 31.3 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 13/13 | 100.0% | 70129 | 1515 | 46.4 | 30.3 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 3539 | 75 | 49.2 | 31.0 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 7339 | 152 | 49.1 | 31.3 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 8893 | 187 | 49.2 | 31.3 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 7615 | 157 | 49.0 | 31.3 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 12/12 | 100.0% | 24366 | 499 | 49.0 | 31.3 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 35/35 | 100.0% ± 0.0 | 19449 | 404 | 49.2 | 31.3 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 21/26 | 80.8% ± 16.2 | 65374 | 1347 | 48.7 | 31.3 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 11/12 | 91.7% | 9865 | 206 | 49.1 | 31.3 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 1360 | 29 | 49.2 | 31.3 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 25/26 | 96.2% ± 9.4 | 131216 | 2799 | 47.0 | 31.3 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 36/36 | 100.0% | 24405 | 539 | 47.7 | 31.3 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 12/12 | 100.0% | 11493 | 237 | 49.0 | 31.3 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 2183 | 47 | 49.0 | 31.3 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 8/8 | 100.0% | 9456 | 573 | 44.3 | 31.3 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 1923 | 42 | 49.1 | 31.3 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 9/9 | 100.0% | 8953 | 186 | 49.1 | 31.3 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 1810 | 214 | 8.9 | 31.3 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 5174 | 112 | 49.2 | 31.3 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 28/29 | 96.6% ± 9.5 | 210627 | 4498 | 46.9 | 31.3 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 311/316 | 98.4% ± 1.6 | 66519 | 2136 | 48.0 | 31.3 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 12/12 | 100.0% | 9198 | 193 | 49.2 | 31.3 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 26/26 | 100.0% ± 0.0 | 43295 | 912 | 47.9 | 31.3 |
