# qwen3.8-27b-omlx: Alpha challenge set

> Qwen3.8-27B on omlx 4bit, Apple M5 Max 128GB. Pass rate 94.1% ± 5.3 (95% CI), rank 2 of 110, tier 1. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3.8-27B (`mlx-community/Qwen3.8-27B-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 1
- Variant (what sets it apart from the model's other rows): runtime omlx · t1
- Config hash: `1f23771198a9` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `641c840`
- Samples per item: 1; submitters: local
- Executed: 2026-10-26T16:27:09.164Z – 2026-10-26T20:43:51.285Z

## Score
- Pass rate: 94.1% ± 5.3 (159/169 items); core 96.3%, stretch 92.0%
- Rank 2 of 110, tier 1 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): thinking_truncated 10

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 234851 total, 1390 per item
- Wall time: 15496 s total, 91.7 s per item
- Generation speed: 15.2 tok/s
- Peak memory: 16.5 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 10429 | 327 | 31.9 | 16.5 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 4419 | 141 | 31.4 | 16.5 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 35/35 | 100.0% ± 0.0 | 14002 | 451 | 31.1 | 16.5 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 23/26 | 88.5% ± 13.2 | 56186 | 9756 | 5.8 | 16.5 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 586 | 20 | 29.0 | 16.5 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 19/26 | 73.1% ± 36.1 | 89859 | 2886 | 31.1 | 16.5 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 1281 | 43 | 29.7 | 16.5 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 1241 | 43 | 29.2 | 16.5 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 698 | 23 | 30.4 | 16.5 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 26/26 | 100.0% ± 0.0 | 56150 | 1806 | 31.1 | 16.5 |
