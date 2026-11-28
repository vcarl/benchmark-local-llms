# gemma-4-31b-llamacpp: Alpha challenge set

> gemma-4-31B-it on llamacpp Q4_K_M, Apple M5 Max 128GB. Pass rate 59.8% ± 12.4 (95% CI), rank 67 of 110, tier 6. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: gemma-4-31B-it (`unsloth/gemma-4-31B-it-GGUF`)
- Runtime: llamacpp; versions: unknown
- Quant: Q4_K_M; temperature 0.7
- Variant (what sets it apart from the model's other rows): quant Q4_K_M
- Config hash: `8751a90a601b` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-25T17:33:05.586Z – 2026-06-30T16:03:55.198Z

## Score
- Pass rate: 59.8% ± 12.4 (101/169 items); core 80.5%, stretch 40.2%
- Rank 67 of 110, tier 6 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: partial; challenges 7/10, items 105/169
- Failures (sample lines): none

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 49970 total, 476 per item
- Wall time: 2918 s total, 27.8 s per item
- Generation speed: 17.5 tok/s
- Peak memory: 41.0 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | interrupted | 0/12 | 0.0% ± 0.0 | — | — | — | — |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 10924 | 640 | 17.2 | 37.3 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 35/35 | 100.0% ± 0.0 | 20187 | 1200 | 17.1 | 39.5 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 24/26 | 92.3% ± 11.0 | 8450 | 483 | 18.0 | 41.0 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 848 | 47 | 19.3 | 41.0 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | interrupted | 0/26 | 0.0% ± 0.0 | — | — | — | — |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 2905 | 170 | 17.7 | 41.0 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 4756 | 272 | 17.9 | 41.0 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 1900 | 106 | 18.3 | 41.0 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | stale_hash | 0/26 | 0.0% ± 0.0 | — | — | — | — |
