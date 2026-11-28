# gemma-4-31b-mlx: Alpha challenge set

> gemma-4-31b-it on mlx 4bit, Apple M5 Max 128GB. Pass rate 56.8% ± 12.5 (95% CI), rank 71 of 110, tier 6. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: gemma-4-31b-it (`mlx-community/gemma-4-31b-it-4bit`)
- Runtime: mlx; versions: unknown
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx · t0.7 · topP default · topK default
- Config hash: `bf3520732bc7` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-23T03:00:12.382Z – 2026-06-30T19:40:47.540Z

## Score
- Pass rate: 56.8% ± 12.5 (96/169 items); core 90.2%, stretch 25.3%
- Rank 71 of 110, tier 6 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: partial; challenges 9/10, items 143/169
- Failures (sample lines): execution_error 39

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 48439 total, 339 per item
- Wall time: 3504 s total, 24.5 s per item
- Generation speed: 17.3 tok/s
- Peak memory: 17.4 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 11/12 | 91.7% ± 18.3 | 14158 | 718 | 19.7 | 17.4 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 7/10 | 70.0% ± 34.6 | 9195 | 482 | 19.1 | 17.4 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 16/35 | 45.7% ± 31.2 | 6060 | 1334 | 9.7 | 17.4 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 22/26 | 84.6% ± 14.9 | 7453 | 372 | 20.0 | 17.4 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 826 | 44 | 18.7 | 17.4 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | stale_hash | 0/26 | 0.0% ± 0.0 | — | — | — | — |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 2533 | 135 | 18.8 | 17.4 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 4804 | 245 | 19.6 | 17.4 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 1664 | 84 | 19.8 | 17.4 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 6/26 | 23.1% ± 34.4 | 1746 | 90 | 19.4 | 17.4 |
