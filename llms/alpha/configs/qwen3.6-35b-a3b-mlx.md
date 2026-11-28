# qwen3.6-35b-a3b-mlx: Alpha challenge set

> Qwen3.6-35B-A3B on mlx 4bit, Apple M5 Max 128GB. Pass rate 29.0% ± 9.0 (95% CI), rank 96 of 110, tier 8. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3.6-35B-A3B (`mlx-community/Qwen3.6-35B-A3B-4bit`)
- Runtime: mlx; versions: mlx-lm 0.31.3, unknown
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx · t0.7
- Config hash: `02d64659ca2c` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `2212237`, `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-21T02:27:20.216Z – 2026-11-17T17:54:26.759Z

## Score
- Pass rate: 29.0% ± 9.0 (49/169 items); core 37.8%, stretch 20.7%
- Rank 96 of 110, tier 8 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: partial; challenges 5/10, items 57/169
- Failures (sample lines): thinking_truncated 5, wrong 2, loop 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 106196 total, 1863 per item
- Wall time: 992 s total, 17.4 s per item
- Generation speed: 111.8 tok/s
- Peak memory: 18.8 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | interrupted | 0/12 | 0.0% ± 0.0 | — | — | — | — |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 13621 | 110 | 124.0 | 18.8 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | interrupted | 0/35 | 0.0% ± 0.0 | — | — | — | — |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | interrupted | 0/26 | 0.0% ± 0.0 | — | — | — | — |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 3233 | 27 | 118.7 | 18.8 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | interrupted | 0/26 | 0.0% ± 0.0 | — | — | — | — |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 6701 | 55 | 122.7 | 18.8 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | interrupted | 0/13 | 0.0% ± 0.0 | — | — | — | — |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 4188 | 35 | 120.5 | 18.8 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 18/26 | 69.2% ± 22.2 | 78453 | 766 | 108.4 | 18.8 |
