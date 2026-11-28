# qwen3.6-35b-a3b-llamacpp: Alpha challenge set

> Qwen3.6-35B-A3B on llamacpp Q6_K, Apple M5 Max 128GB. Pass rate 25.4% ± 8.2 (95% CI), rank 98 of 110, tier 8. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3.6-35B-A3B (`unsloth/Qwen3.6-35B-A3B-GGUF`)
- Runtime: llamacpp; versions: unknown
- Quant: Q6_K; temperature 0.7
- Config hash: `86fb62eceb40` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-24T17:29:53.295Z – 2026-06-24T17:56:59.008Z

## Score
- Pass rate: 25.4% ± 8.2 (43/169 items); core 52.4%, stretch 0.0%
- Rank 98 of 110, tier 8 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: partial; challenges 5/10, items 43/169
- Failures (sample lines): none

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 47443 total, 1103 per item
- Wall time: 628 s total, 14.6 s per item
- Generation speed: 76.1 tok/s
- Peak memory: 35.0 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 19013 | 256 | 74.7 | 27.9 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 16828 | 221 | 76.5 | 29.1 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | interrupted | 0/35 | 0.0% ± 0.0 | — | — | — | — |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | interrupted | 0/26 | 0.0% ± 0.0 | — | — | — | — |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 1923 | 25 | 78.1 | 33.2 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | interrupted | 0/26 | 0.0% ± 0.0 | — | — | — | — |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 6516 | 85 | 77.8 | 34.5 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | interrupted | 0/13 | 0.0% ± 0.0 | — | — | — | — |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 3163 | 41 | 77.9 | 35.0 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | stale_hash | 0/26 | 0.0% ± 0.0 | — | — | — | — |
