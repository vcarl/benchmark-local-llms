# qwen3.5-35b-a3b-llamacpp: Alpha challenge set

> Qwen3.5-35B-A3B on llamacpp Q8_0, Apple M5 Max 128GB. Pass rate 12.4% ± 5.6 (95% CI), rank 108 of 110, tier 9. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3.5-35B-A3B (`unsloth/Qwen3.5-35B-A3B-GGUF`)
- Runtime: llamacpp; versions: unknown
- Quant: Q8_0; temperature 0.7
- Config hash: `1686b99709c6` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-24T17:19:38.704Z – 2026-06-24T17:28:02.042Z

## Score
- Pass rate: 12.4% ± 5.6 (21/169 items); core 25.6%, stretch 0.0%
- Rank 108 of 110, tier 9 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: partial; challenges 3/10, items 21/169
- Failures (sample lines): none

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 11525 total, 549 per item
- Wall time: 159 s total, 7.6 s per item
- Generation speed: 73.3 tok/s
- Peak memory: 45.7 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | interrupted | 0/12 | 0.0% ± 0.0 | — | — | — | — |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | interrupted | 0/10 | 0.0% ± 0.0 | — | — | — | — |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | stale_hash | 0/35 | 0.0% ± 0.0 | — | — | — | — |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | interrupted | 0/26 | 0.0% ± 0.0 | — | — | — | — |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 2163 | 30 | 73.6 | 44.1 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | interrupted | 0/26 | 0.0% ± 0.0 | — | — | — | — |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 6220 | 86 | 73.2 | 45.2 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | interrupted | 0/13 | 0.0% ± 0.0 | — | — | — | — |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 3142 | 43 | 73.5 | 45.7 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | stale_hash | 0/26 | 0.0% ± 0.0 | — | — | — | — |
