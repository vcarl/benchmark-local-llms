# qwen3.8-27b-omlx-6bit: Alpha challenge set

> Qwen3.8-27B on omlx 6bit, Apple M5 Max 128GB. Pass rate 93.5% ± 5.4 (95% CI), rank 4 of 110, tier 1. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3.8-27B (`lmstudio-community/Qwen3.8-27B-MLX-6bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 6bit; temperature 1
- Variant (what sets it apart from the model's other rows): runtime omlx · t1
- Config hash: `5082351c349c` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `641c840`
- Samples per item: 1; submitters: local
- Executed: 2026-10-26T22:58:22.447Z – 2026-10-27T01:35:22.752Z

## Score
- Pass rate: 93.5% ± 5.4 (158/169 items); core 95.1%, stretch 92.0%
- Rank 4 of 110, tier 1 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): thinking_truncated 9, wrong 2

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 194564 total, 1151 per item
- Wall time: 9486 s total, 56.1 s per item
- Generation speed: 20.5 tok/s
- Peak memory: 22.7 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 4372 | 215 | 20.3 | 22.4 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 3724 | 188 | 19.8 | 22.4 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 35/35 | 100.0% ± 0.0 | 10010 | 509 | 19.7 | 22.4 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 22/26 | 84.6% ± 14.9 | 53604 | 2626 | 20.4 | 22.7 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 486 | 25 | 19.2 | 22.7 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 19/26 | 73.1% ± 36.8 | 79558 | 3845 | 20.7 | 22.7 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 1030 | 52 | 19.7 | 22.7 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 1175 | 60 | 19.6 | 22.7 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 581 | 29 | 20.0 | 22.7 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 26/26 | 100.0% ± 0.0 | 40024 | 1937 | 20.7 | 22.7 |
