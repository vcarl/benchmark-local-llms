# phi-4-mlx: Alpha challenge set

> phi-4 on mlx 4bit, Apple M5 Max 128GB. Pass rate 56.2% ± 8.4 (95% CI), rank 72 of 110, tier 6. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: phi-4 (`mlx-community/phi-4-4bit`)
- Runtime: mlx; versions: mlx-lm 0.31.3, unknown
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx · t0.7
- Config hash: `92e4a8da63f0` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `2212237`, `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-23T03:45:28.772Z – 2026-11-17T13:24:52.161Z

## Score
- Pass rate: 56.2% ± 8.4 (95/169 items); core 58.5%, stretch 54.0%
- Rank 72 of 110, tier 6 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: partial; challenges 9/10, items 159/169
- Failures (sample lines): wrong 42, length_cutoff 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 41157 total, 259 per item
- Wall time: 883 s total, 5.6 s per item
- Generation speed: 46.6 tok/s
- Peak memory: 8.0 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 982 | 22 | 45.0 | 7.9 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 562 | 13 | 42.1 | 7.9 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 16/35 | 45.7% ± 23.6 | 14437 | 307 | 47.0 | 8.0 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 7/26 | 26.9% ± 18.3 | 790 | 19 | 40.5 | 7.9 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 46 | 2 | 23.4 | 7.9 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 11/26 | 42.3% ± 20.1 | 10982 | 231 | 47.6 | 8.0 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | interrupted | 0/10 | 0.0% ± 0.0 | — | — | — | — |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 10/13 | 76.9% ± 26.5 | 750 | 18 | 41.7 | 7.9 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 637 | 14 | 46.0 | 7.9 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 20/26 | 76.9% ± 19.3 | 11971 | 257 | 46.5 | 8.0 |
