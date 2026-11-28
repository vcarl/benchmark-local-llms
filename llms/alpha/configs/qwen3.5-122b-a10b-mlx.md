# qwen3.5-122b-a10b-mlx: Alpha challenge set

> Qwen3.5-122B-A10B on mlx 4bit, Apple M5 Max 128GB. Pass rate 40.8% ± 11.8 (95% CI), rank 85 of 110, tier 7. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3.5-122B-A10B (`mlx-community/Qwen3.5-122B-A10B-4bit`)
- Runtime: mlx; versions: unknown
- Quant: 4bit; temperature 0.7
- Config hash: `7542195ae0c0` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-08-16T19:51:06.763Z – 2026-08-16T21:25:47.060Z

## Score
- Pass rate: 40.8% ± 11.8 (69/169 items); core 41.5%, stretch 40.2%
- Rank 85 of 110, tier 7 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: partial; challenges 5/10, items 69/169
- Failures (sample lines): none

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 73047 total, 1059 per item
- Wall time: 1980 s total, 28.7 s per item
- Generation speed: 36.9 tok/s
- Peak memory: 32.2 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | interrupted | 0/12 | 0.0% ± 0.0 | — | — | — | — |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | interrupted | 0/10 | 0.0% ± 0.0 | — | — | — | — |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 35/35 | 100.0% ± 0.0 | 51215 | 1427 | 35.9 | 32.2 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | interrupted | 0/26 | 0.0% ± 0.0 | — | — | — | — |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 3298 | 86 | 38.4 | 32.2 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | interrupted | 0/26 | 0.0% ± 0.0 | — | — | — | — |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 5803 | 147 | 39.6 | 32.2 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 8098 | 205 | 39.5 | 32.2 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 4633 | 116 | 40.0 | 32.2 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | interrupted | 0/26 | 0.0% ± 0.0 | — | — | — | — |
