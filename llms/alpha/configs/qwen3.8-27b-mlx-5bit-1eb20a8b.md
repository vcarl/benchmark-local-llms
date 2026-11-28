# qwen3.8-27b-mlx-5bit: Alpha challenge set

> Qwen3.8-27B on mlx 5bit, Apple M5 Max 128GB. Pass rate 20.7% ± 11.5 (95% CI), rank 101 of 110, tier 8. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3.8-27B (`lmstudio-community/Qwen3.8-27B-MLX-5bit`)
- Runtime: mlx; versions: unknown
- Quant: 5bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx · t0.7
- Config hash: `1eb20a8bf34e` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-08-26T23:24:03.456Z – 2026-08-26T23:33:44.218Z

## Score
- Pass rate: 20.7% ± 11.5 (35/169 items); core 0.0%, stretch 40.2%
- Rank 101 of 110, tier 8 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: partial; challenges 1/10, items 35/169
- Failures (sample lines): none

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 11314 total, 323 per item
- Wall time: 595 s total, 17.0 s per item
- Generation speed: 19.0 tok/s
- Peak memory: 17.8 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | not_run | 0/12 | 0.0% ± 0.0 | — | — | — | — |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | not_run | 0/10 | 0.0% ± 0.0 | — | — | — | — |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 35/35 | 100.0% ± 0.0 | 11314 | 595 | 19.0 | 17.8 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | not_run | 0/26 | 0.0% ± 0.0 | — | — | — | — |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | not_run | 0/7 | 0.0% ± 0.0 | — | — | — | — |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | not_run | 0/26 | 0.0% ± 0.0 | — | — | — | — |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | not_run | 0/10 | 0.0% ± 0.0 | — | — | — | — |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | not_run | 0/13 | 0.0% ± 0.0 | — | — | — | — |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | not_run | 0/4 | 0.0% | — | — | — | — |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | not_run | 0/26 | 0.0% ± 0.0 | — | — | — | — |
