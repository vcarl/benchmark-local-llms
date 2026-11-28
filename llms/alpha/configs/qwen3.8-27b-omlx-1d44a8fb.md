# qwen3.8-27b-omlx: Alpha challenge set

> Qwen3.8-27B on omlx 4bit, Apple M5 Max 128GB. Pass rate 92.9% ± 5.6 (95% CI), rank 7 of 110, tier 1. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3.8-27B (`mlx-community/Qwen3.8-27B-4bit`)
- Runtime: omlx; versions: unknown
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime omlx · t0.7
- Config hash: `1d44a8fbe6e3` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-08-26T22:25:48.407Z – 2026-08-27T07:26:35.492Z

## Score
- Pass rate: 92.9% ± 5.6 (157/169 items); core 96.3%, stretch 89.7%
- Rank 7 of 110, tier 1 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): thinking_truncated 9, wrong 2, loop 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 215543 total, 1275 per item
- Wall time: 6971 s total, 41.3 s per item
- Generation speed: 31.3 tok/s
- Peak memory: 16.5 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 11048 | 350 | 31.6 | 16.5 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 4298 | 137 | 31.4 | 16.5 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 35/35 | 100.0% ± 0.0 | 11399 | 374 | 30.5 | 16.2 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 23/26 | 88.5% ± 13.2 | 51223 | 1705 | 31.4 | 16.5 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 551 | 19 | 28.8 | 16.5 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 17/26 | 65.4% ± 37.5 | 86832 | 2781 | 31.2 | 16.5 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 1455 | 48 | 30.1 | 16.5 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 1554 | 52 | 29.8 | 16.5 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 494 | 16 | 30.0 | 16.5 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 26/26 | 100.0% ± 0.0 | 46689 | 1489 | 31.4 | 16.5 |
