# qwen3-coder-next-llamacpp: Alpha challenge set

> Qwen3-Coder-Next on llamacpp Q5_K_M, Apple M5 Max 128GB. Pass rate 52.7% ± 11.6 (95% CI), rank 74 of 110, tier 6. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3-Coder-Next (`Qwen/Qwen3-Coder-Next-GGUF`)
- Runtime: llamacpp; versions: unknown
- Quant: Q5_K_M; temperature 0.7
- Config hash: `ea9a3ee1d5b2` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-25T06:08:31.611Z – 2026-06-29T06:03:50.747Z

## Score
- Pass rate: 52.7% ± 11.6 (89/169 items); core 84.1%, stretch 23.0%
- Rank 74 of 110, tier 6 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: partial; challenges 8/10, items 117/169
- Failures (sample lines): wrong 18

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 6417 total, 55 per item
- Wall time: 109 s total, 0.9 s per item
- Generation speed: 70.0 tok/s
- Peak memory: 59.9 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 1046 | 17 | 67.9 | 53.2 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 9/10 | 90.0% ± 22.6 | 487 | 8 | 71.4 | 53.2 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 20/35 | 57.1% ± 29.6 | 2803 | 48 | 67.9 | 55.8 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 17/26 | 65.4% ± 19.6 | 541 | 10 | 77.0 | 57.1 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 43 | 1 | 86.5 | 57.1 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | stale_hash | 0/26 | 0.0% ± 0.0 | — | — | — | — |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 442 | 7 | 75.5 | 57.1 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 10/13 | 76.9% ± 26.5 | 554 | 9 | 72.6 | 59.9 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 501 | 8 | 70.3 | 59.9 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | stale_hash | 0/26 | 0.0% ± 0.0 | — | — | — | — |
