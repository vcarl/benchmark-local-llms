# glm-4.7-flash-omlx: Alpha challenge set

> GLM-4.7-Flash on omlx 4bit, Apple M5 Max 128GB. Pass rate 27.8% ± 8.2 (95% CI), rank 97 of 110, tier 8. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: GLM-4.7-Flash (`mlx-community/GLM-4.7-Flash-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 1
- Variant (what sets it apart from the model's other rows): runtime omlx · t1
- Config hash: `ea80d1183830` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `6805db5`
- Samples per item: 1; submitters: local
- Executed: 2026-10-28T05:13:45.472Z – 2026-10-28T05:56:58.937Z

## Score
- Pass rate: 27.8% ± 8.2 (47/169 items); core 45.1%, stretch 11.5%
- Rank 97 of 110, tier 8 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: partial; challenges 5/10, items 90/169
- Failures (sample lines): loop 24, thinking_truncated 7, wrong 6

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 108733 total, 1208 per item
- Wall time: 2563 s total, 28.5 s per item
- Generation speed: 86.8 tok/s
- Peak memory: 16.7 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 9/12 | 75.0% ± 28.7 | 12246 | 200 | 94.5 | 16.7 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 7/10 | 70.0% ± 34.6 | 10941 | 157 | 91.0 | 16.7 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 10/35 | 28.6% ± 20.0 | 44705 | 1409 | 82.7 | 16.7 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 14/26 | 53.8% ± 20.5 | 39626 | 783 | 88.2 | 16.7 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 1215 | 13 | 92.4 | 16.7 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | interrupted | 0/26 | 0.0% ± 0.0 | — | — | — | — |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | not_run | 0/10 | 0.0% ± 0.0 | — | — | — | — |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | not_run | 0/13 | 0.0% ± 0.0 | — | — | — | — |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | not_run | 0/4 | 0.0% | — | — | — | — |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | not_run | 0/26 | 0.0% ± 0.0 | — | — | — | — |
