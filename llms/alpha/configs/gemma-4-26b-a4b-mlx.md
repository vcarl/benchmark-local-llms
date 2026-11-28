# gemma-4-26b-a4b-mlx: Alpha challenge set

> gemma-4-26b-a4b-it on mlx 4bit, Apple M5 Max 128GB. Pass rate 40.2% ± 10.6 (95% CI), rank 86 of 110, tier 7. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: gemma-4-26b-a4b-it (`mlx-community/gemma-4-26b-a4b-it-4bit`)
- Runtime: mlx; versions: unknown
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx · t0.7 · topP default · topK default
- Config hash: `069b2b5b3452` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-23T02:41:38.771Z – 2026-06-23T02:59:38.475Z

## Score
- Pass rate: 40.2% ± 10.6 (68/169 items); core 82.9%, stretch 0.0%
- Rank 86 of 110, tier 7 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: partial; challenges 7/10, items 82/169
- Failures (sample lines): none

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 82777 total, 1009 per item
- Wall time: 851 s total, 10.4 s per item
- Generation speed: 97.3 tok/s
- Peak memory: 14.7 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 11/12 | 91.7% ± 18.3 | 24093 | 248 | 97.1 | 14.7 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 6/10 | 60.0% ± 36.9 | 17660 | 184 | 96.2 | 14.7 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | stale_hash | 0/35 | 0.0% ± 0.0 | — | — | — | — |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 17/26 | 65.4% ± 19.6 | 28826 | 298 | 96.8 | 14.7 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 976 | 11 | 92.8 | 14.7 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | stale_hash | 0/26 | 0.0% ± 0.0 | — | — | — | — |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 3314 | 33 | 101.0 | 14.7 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 5880 | 58 | 101.3 | 14.7 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 2028 | 20 | 100.9 | 14.7 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | stale_hash | 0/26 | 0.0% ± 0.0 | — | — | — | — |
