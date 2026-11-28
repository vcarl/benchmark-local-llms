# qwen3.8-27b-omlx-5bit: Alpha challenge set

> Qwen3.8-27B on omlx 5bit, Apple M5 Max 128GB. Pass rate 91.7% ± 5.6 (95% CI), rank 10 of 110, tier 1. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3.8-27B (`lmstudio-community/Qwen3.8-27B-MLX-5bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 5bit; temperature 1
- Variant (what sets it apart from the model's other rows): runtime omlx · t1
- Config hash: `4ab20fb782a8` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `641c840`
- Samples per item: 1; submitters: local
- Executed: 2026-10-26T20:46:29.082Z – 2026-10-26T22:55:33.298Z

## Score
- Pass rate: 91.7% ± 5.6 (155/169 items); core 93.9%, stretch 89.7%
- Rank 10 of 110, tier 1 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): thinking_truncated 9, wrong 5

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 188301 total, 1114 per item
- Wall time: 7846 s total, 46.4 s per item
- Generation speed: 24.0 tok/s
- Peak memory: 19.6 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 9249 | 373 | 24.8 | 19.6 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 3884 | 165 | 23.6 | 19.6 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 35/35 | 100.0% ± 0.0 | 11168 | 468 | 23.9 | 19.6 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 21/26 | 80.8% ± 16.2 | 41212 | 1661 | 24.8 | 19.6 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 533 | 23 | 23.0 | 19.6 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 18/26 | 69.2% ± 37.2 | 83741 | 3446 | 24.3 | 19.6 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 1365 | 64 | 21.2 | 19.6 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 1252 | 59 | 21.3 | 19.6 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 622 | 29 | 21.7 | 19.6 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 25/26 | 96.2% ± 8.9 | 35275 | 1559 | 22.6 | 19.6 |
