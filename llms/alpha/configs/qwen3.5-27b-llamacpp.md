# qwen3.5-27b-llamacpp: Alpha challenge set

> Qwen3.5-27B on llamacpp Q6_K, Apple M5 Max 128GB. Pass rate 20.1% ± 7.2 (95% CI), rank 105 of 110, tier 8. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3.5-27B (`unsloth/Qwen3.5-27B-GGUF`)
- Runtime: llamacpp; versions: unknown
- Quant: Q6_K; temperature 0.7
- Config hash: `efbedd95d3f4` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-25T03:54:25.723Z – 2026-06-25T04:22:45.792Z

## Score
- Pass rate: 20.1% ± 7.2 (34/169 items); core 41.5%, stretch 0.0%
- Rank 105 of 110, tier 8 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: partial; challenges 4/10, items 34/169
- Failures (sample lines): none

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 18886 total, 555 per item
- Wall time: 1052 s total, 30.9 s per item
- Generation speed: 18.2 tok/s
- Peak memory: 40.4 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | interrupted | 0/12 | 0.0% ± 0.0 | — | — | — | — |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | interrupted | 0/10 | 0.0% ± 0.0 | — | — | — | — |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | stale_hash | 0/35 | 0.0% ± 0.0 | — | — | — | — |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | interrupted | 0/26 | 0.0% ± 0.0 | — | — | — | — |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 2351 | 130 | 18.4 | 39.5 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | interrupted | 0/26 | 0.0% ± 0.0 | — | — | — | — |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 4754 | 266 | 18.1 | 40.4 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 8752 | 487 | 18.1 | 40.4 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 3029 | 168 | 18.1 | 40.4 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | stale_hash | 0/26 | 0.0% ± 0.0 | — | — | — | — |
