# qwen3.5-35b-a3b-mlx: Alpha challenge set

> Qwen3.5-35B-A3B on mlx 4bit, Apple M5 Max 128GB. Pass rate 36.1% ± 10.4 (95% CI), rank 91 of 110, tier 7. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3.5-35B-A3B (`mlx-community/Qwen3.5-35B-A3B-4bit`)
- Runtime: mlx; versions: mlx-lm 0.31.3, unknown
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx · t0.7
- Config hash: `2c7e2dc1987b` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `2212237`, `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-21T02:20:32.231Z – 2026-11-17T15:35:28.439Z

## Score
- Pass rate: 36.1% ± 10.4 (61/169 items); core 25.6%, stretch 46.0%
- Rank 91 of 110, tier 7 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: partial; challenges 5/10, items 82/169
- Failures (sample lines): thinking_truncated 12, loop 8, wrong 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 166764 total, 2034 per item
- Wall time: 1834 s total, 22.4 s per item
- Generation speed: 115.4 tok/s
- Peak memory: 18.8 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | interrupted | 0/12 | 0.0% ± 0.0 | — | — | — | — |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | interrupted | 0/10 | 0.0% ± 0.0 | — | — | — | — |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 28/35 | 80.0% ± 22.1 | 35995 | 648 | 113.7 | 18.8 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | interrupted | 0/26 | 0.0% ± 0.0 | — | — | — | — |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 2625 | 22 | 120.7 | 18.6 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | interrupted | 0/26 | 0.0% ± 0.0 | — | — | — | — |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 5902 | 47 | 125.0 | 18.8 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | interrupted | 0/13 | 0.0% ± 0.0 | — | — | — | — |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 2529 | 20 | 127.0 | 18.8 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 12/26 | 46.2% ± 35.0 | 119713 | 1097 | 115.2 | 18.8 |
