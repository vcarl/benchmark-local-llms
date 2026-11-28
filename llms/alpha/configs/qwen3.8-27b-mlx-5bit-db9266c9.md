# qwen3.8-27b-mlx-5bit: Alpha challenge set

> Qwen3.8-27B on mlx 5bit, Apple M5 Max 128GB. Pass rate 83.4% ± 6.6 (95% CI), rank 24 of 110, tier 3. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3.8-27B (`lmstudio-community/Qwen3.8-27B-MLX-5bit`)
- Runtime: mlx; versions: unknown
- Quant: 5bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx · t0.7
- Config hash: `db9266c90973` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-08-27T07:27:50.540Z – 2026-08-27T10:50:14.526Z

## Score
- Pass rate: 83.4% ± 6.6 (141/169 items); core 84.1%, stretch 82.8%
- Rank 24 of 110, tier 3 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): thinking_truncated 12, wrong 2, loop 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 254960 total, 1509 per item
- Wall time: 12244 s total, 72.5 s per item
- Generation speed: 21.1 tok/s
- Peak memory: 17.6 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 3673 | 176 | 20.9 | 17.6 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 9/10 | 90.0% ± 22.6 | 10210 | 482 | 21.2 | 17.6 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 32/35 | 91.4% ± 11.5 | 25061 | 1188 | 21.1 | 17.6 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 14/26 | 53.8% ± 20.5 | 95976 | 4552 | 21.1 | 17.6 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 466 | 24 | 19.7 | 17.6 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 17/26 | 65.4% ± 34.6 | 78195 | 3865 | 20.9 | 17.6 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 1082 | 53 | 20.3 | 17.6 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 1266 | 62 | 20.3 | 17.6 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 518 | 25 | 20.7 | 17.6 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 23/26 | 88.5% ± 18.1 | 38513 | 1818 | 21.2 | 17.6 |
