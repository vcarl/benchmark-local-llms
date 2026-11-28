# qwen3.8-27b-mlx-6bit: Alpha challenge set

> Qwen3.8-27B on mlx 6bit, Apple M5 Max 128GB. Pass rate 50.3% ± 12.1 (95% CI), rank 77 of 110, tier 6. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3.8-27B (`lmstudio-community/Qwen3.8-27B-MLX-6bit`)
- Runtime: mlx; versions: unknown
- Quant: 6bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx · t0.7
- Config hash: `d5b7c05f1d21` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-08-27T12:46:01.953Z – 2026-08-27T13:27:54.740Z

## Score
- Pass rate: 50.3% ± 12.1 (85/169 items); core 61.0%, stretch 40.2%
- Rank 77 of 110, tier 6 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: partial; challenges 5/10, items 90/169
- Failures (sample lines): none

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 44554 total, 495 per item
- Wall time: 2487 s total, 27.6 s per item
- Generation speed: 17.9 tok/s
- Peak memory: 20.8 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 11/12 | 91.7% ± 18.3 | 4211 | 235 | 17.9 | 20.8 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 2588 | 144 | 18.0 | 20.8 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 35/35 | 100.0% ± 0.0 | 12313 | 687 | 17.9 | 20.8 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 22/26 | 84.6% ± 14.9 | 24999 | 1394 | 17.9 | 20.8 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 443 | 26 | 16.8 | 20.8 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | interrupted | 0/26 | 0.0% ± 0.0 | — | — | — | — |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | not_run | 0/10 | 0.0% ± 0.0 | — | — | — | — |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | not_run | 0/13 | 0.0% ± 0.0 | — | — | — | — |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | not_run | 0/4 | 0.0% | — | — | — | — |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | not_run | 0/26 | 0.0% ± 0.0 | — | — | — | — |
