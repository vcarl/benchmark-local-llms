# phi-4-omlx: Alpha challenge set

> phi-4 on omlx 4bit, Apple M5 Max 128GB. Pass rate 63.3% ± 8.0 (95% CI), rank 56 of 110, tier 5. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: phi-4 (`mlx-community/phi-4-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 0
- Variant (what sets it apart from the model's other rows): runtime omlx · t0
- Config hash: `71e0adabfb22` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `6805db5`
- Samples per item: 1; submitters: local
- Executed: 2026-10-27T03:59:20.283Z – 2026-10-27T04:11:34.654Z

## Score
- Pass rate: 63.3% ± 8.0 (107/169 items); core 74.4%, stretch 52.9%
- Rank 56 of 110, tier 5 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 42, near_miss 2

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 33305 total, 197 per item
- Wall time: 695 s total, 4.1 s per item
- Generation speed: 56.1 tok/s
- Peak memory: 8.5 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 963 | 18 | 54.5 | 8.3 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 9/10 | 90.0% ± 22.6 | 542 | 10 | 53.5 | 8.4 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 17/35 | 48.6% ± 17.9 | 5604 | 100 | 55.9 | 8.4 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 9/26 | 34.6% ± 19.6 | 837 | 17 | 49.9 | 8.4 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 46 | 2 | 27.8 | 8.4 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 11/26 | 42.3% ± 15.9 | 12020 | 211 | 56.9 | 8.5 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 539 | 112 | 52.8 | 8.5 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 10/13 | 76.9% ± 26.5 | 753 | 14 | 53.4 | 8.5 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 719 | 12 | 58.3 | 8.5 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 18/26 | 69.2% ± 26.1 | 11282 | 199 | 56.7 | 8.5 |
