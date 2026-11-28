# qwen3.8-27b-omlx-5bit: Pre-release (draft)

> Qwen3.8-27B on omlx 5bit, Apple M5 Max 128GB. Pass rate 97.7% ± 1.8 (95% CI), rank 3 of 79, tier 1. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Qwen3.8-27B (`lmstudio-community/Qwen3.8-27B-MLX-5bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 5bit; temperature 1
- Config hash: `1e060c4997416a5383eb9f94b652512d085114b13d662bb1fbd1393a35f056bd` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `cf2440dd706e59d757ec13948b85c4bf9790e2d5`
- Samples per item: 1; submitters: local
- Executed: 2026-11-22T05:15:59.526Z – 2026-11-22T13:42:18.513Z

## Score
- Pass rate: 97.7% ± 1.8 (646/661 items); core 98.7%, stretch 94.0%
- Rank 3 of 79, tier 1 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 8, thinking_truncated 7

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 748669 total, 1133 per item
- Wall time: 30500 s total, 46.1 s per item
- Generation speed: 25.6 tok/s
- Peak memory: 19.7 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 12/13 | 92.3% | 84475 | 3769 | 22.5 | 19.6 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 1790 | 74 | 27.3 | 19.6 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 8866 | 341 | 26.5 | 19.6 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 4832 | 189 | 27.0 | 19.6 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 2976 | 114 | 27.2 | 19.6 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 12/12 | 100.0% | 21463 | 815 | 26.5 | 19.6 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 35/35 | 100.0% ± 0.0 | 10297 | 402 | 27.0 | 19.6 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 19/26 | 73.1% ± 18.3 | 73789 | 2839 | 26.1 | 19.6 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 7363 | 285 | 26.8 | 19.6 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 569 | 23 | 28.0 | 19.6 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 25/26 | 96.2% ± 9.4 | 145922 | 5610 | 26.1 | 19.6 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 36/36 | 100.0% | 21301 | 835 | 27.0 | 19.6 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 12/12 | 100.0% | 8028 | 303 | 27.0 | 19.6 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 1156 | 47 | 27.7 | 19.6 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 8/8 | 100.0% | 9488 | 621 | 23.8 | 19.7 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 1165 | 48 | 27.9 | 19.7 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 9/9 | 100.0% | 10028 | 380 | 26.9 | 19.7 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 568 | 22 | 27.5 | 19.7 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 5221 | 204 | 26.9 | 19.7 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 24/29 | 82.8% ± 47.5 | 214223 | 8477 | 25.3 | 19.7 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 316/316 | 100.0% ± 0.0 | 65322 | 3206 | 27.3 | 19.7 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 12/12 | 100.0% | 9356 | 361 | 26.9 | 19.7 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 25/26 | 96.2% ± 8.9 | 40471 | 1532 | 26.7 | 19.7 |
