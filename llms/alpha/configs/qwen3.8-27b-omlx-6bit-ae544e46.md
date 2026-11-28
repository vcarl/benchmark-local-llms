# qwen3.8-27b-omlx-6bit: Alpha challenge set

> Qwen3.8-27B on omlx 6bit, Apple M5 Max 128GB. Pass rate 94.7% ± 5.3 (95% CI), rank 1 of 110, tier 1. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3.8-27B (`lmstudio-community/Qwen3.8-27B-MLX-6bit`)
- Runtime: omlx; versions: unknown
- Quant: 6bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime omlx · t0.7
- Config hash: `ae544e4699fe` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-08-27T13:37:06.163Z – 2026-08-27T16:22:24.955Z

## Score
- Pass rate: 94.7% ± 5.3 (160/169 items); core 93.9%, stretch 95.4%
- Rank 1 of 110, tier 1 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): thinking_truncated 5, wrong 3

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 164229 total, 972 per item
- Wall time: 10003 s total, 59.2 s per item
- Generation speed: 16.4 tok/s
- Peak memory: 22.8 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 11/12 | 91.7% ± 18.3 | 4003 | 205 | 19.5 | 22.5 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 2540 | 125 | 20.2 | 22.5 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 35/35 | 100.0% ± 0.0 | 9511 | 463 | 20.5 | 22.5 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 22/26 | 84.6% ± 14.9 | 40115 | 3345 | 12.0 | 22.8 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 608 | 31 | 19.5 | 22.8 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 22/26 | 84.6% ± 37.7 | 70497 | 4019 | 17.5 | 22.8 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 1248 | 66 | 18.9 | 22.8 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 1288 | 68 | 18.9 | 22.8 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 590 | 32 | 18.6 | 22.8 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 26/26 | 100.0% ± 0.0 | 33829 | 1649 | 20.5 | 22.8 |
