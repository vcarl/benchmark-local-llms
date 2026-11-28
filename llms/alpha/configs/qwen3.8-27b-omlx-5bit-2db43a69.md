# qwen3.8-27b-omlx-5bit: Alpha challenge set

> Qwen3.8-27B on omlx 5bit, Apple M5 Max 128GB. Pass rate 92.3% ± 5.5 (95% CI), rank 8 of 110, tier 1. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3.8-27B (`lmstudio-community/Qwen3.8-27B-MLX-5bit`)
- Runtime: omlx; versions: unknown
- Quant: 5bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime omlx · t0.7
- Config hash: `2db43a694b28` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-08-27T10:52:54.926Z – 2026-08-27T12:44:10.764Z

## Score
- Pass rate: 92.3% ± 5.5 (156/169 items); core 93.9%, stretch 90.8%
- Rank 8 of 110, tier 1 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): thinking_truncated 7, wrong 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 168456 total, 997 per item
- Wall time: 6735 s total, 39.9 s per item
- Generation speed: 25.0 tok/s
- Peak memory: 19.6 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 11/12 | 91.7% ± 18.3 | 4803 | 191 | 25.1 | 19.3 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 3809 | 152 | 25.0 | 19.3 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 35/35 | 100.0% ± 0.0 | 10307 | 416 | 24.8 | 19.3 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 22/26 | 84.6% ± 14.9 | 32132 | 1273 | 25.2 | 19.6 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 455 | 20 | 22.8 | 19.6 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 19/26 | 73.1% ± 36.8 | 75334 | 3001 | 25.1 | 19.6 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 1114 | 47 | 23.7 | 19.6 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 1238 | 53 | 23.5 | 19.6 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 940 | 38 | 24.6 | 19.6 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 25/26 | 96.2% ± 8.9 | 38324 | 1543 | 24.8 | 19.6 |
