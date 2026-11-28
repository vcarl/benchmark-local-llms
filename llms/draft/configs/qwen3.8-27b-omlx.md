# qwen3.8-27b-omlx: Pre-release (draft)

> Qwen3.8-27B on omlx 4bit, Apple M5 Max 128GB. Pass rate 97.7% ± 1.9 (95% CI), rank 4 of 79, tier 1. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Qwen3.8-27B (`mlx-community/Qwen3.8-27B-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 1
- Config hash: `27e5b5e34e9d8492006a008724b1ed73001c9858fc34c0bae5da62840c46d535` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `96890f43`
- Samples per item: 1; submitters: local
- Executed: 2026-11-21T08:41:52.365Z – 2026-11-21T17:14:44.211Z

## Score
- Pass rate: 97.7% ± 1.9 (646/661 items); core 98.9%, stretch 93.2%
- Rank 4 of 79, tier 1 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): thinking_truncated 8, wrong 7

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 947286 total, 1433 per item
- Wall time: 30637 s total, 46.3 s per item
- Generation speed: 32.0 tok/s
- Peak memory: 16.5 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 12/13 | 92.3% | 85939 | 2795 | 30.8 | 16.5 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 2729 | 88 | 33.7 | 16.5 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 5408 | 167 | 33.5 | 16.5 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 7681 | 238 | 33.4 | 16.5 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 3236 | 100 | 33.7 | 16.5 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 11/12 | 91.7% | 34025 | 1039 | 32.9 | 16.5 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 34/35 | 97.1% ± 5.8 | 17320 | 534 | 33.5 | 16.5 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 21/26 | 80.8% ± 16.2 | 85602 | 2668 | 32.2 | 16.5 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 7694 | 239 | 33.4 | 16.5 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 500 | 17 | 34.9 | 16.5 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 24/26 | 92.3% ± 18.8 | 190749 | 6049 | 31.6 | 16.5 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 36/36 | 100.0% | 24881 | 783 | 33.3 | 16.5 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 12/12 | 100.0% | 6905 | 211 | 33.5 | 16.5 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 1217 | 40 | 34.2 | 16.5 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 8/8 | 100.0% | 13675 | 661 | 29.4 | 16.5 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 1142 | 39 | 34.6 | 16.5 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 9/9 | 100.0% | 32809 | 1017 | 32.4 | 16.5 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 921 | 29 | 33.8 | 16.5 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 5606 | 176 | 33.3 | 16.5 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 24/29 | 82.8% ± 47.5 | 270813 | 8629 | 31.5 | 16.5 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 316/316 | 100.0% ± 0.0 | 76922 | 2917 | 33.4 | 16.5 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 12/12 | 100.0% | 10674 | 333 | 33.2 | 16.5 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 26/26 | 100.0% ± 0.0 | 60838 | 1868 | 32.8 | 16.5 |
