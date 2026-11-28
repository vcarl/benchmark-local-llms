# laguna-s-2.1-omlx: Alpha challenge set

> Laguna-S-2.1 on omlx oQ4e, Apple M5 Max 128GB. Pass rate 76.3% ± 8.4 (95% CI), rank 34 of 110, tier 4. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Laguna-S-2.1 (`mlx-community/Laguna-S-2.1-oQ4e`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: oQ4e; temperature 1
- Config hash: `0e3c0062094b` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `57c2aa8`
- Samples per item: 1; submitters: local
- Executed: 2026-10-28T19:05:19.151Z – 2026-10-28T20:48:09.167Z

## Score
- Pass rate: 76.3% ± 8.4 (129/169 items); core 82.9%, stretch 70.1%
- Rank 34 of 110, tier 4 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 28, thinking_truncated 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 355065 total, 2101 per item
- Wall time: 6546 s total, 38.7 s per item
- Generation speed: 54.2 tok/s
- Peak memory: 18.5 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 992 | 20 | 50.1 | 18.4 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 7/10 | 70.0% ± 34.6 | 535 | 11 | 48.3 | 18.4 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 26/35 | 74.3% ± 21.0 | 57505 | 1010 | 56.9 | 18.5 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 18/26 | 69.2% ± 19.0 | 742 | 18 | 40.2 | 18.5 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 2416 | 42 | 56.9 | 18.5 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 12/26 | 46.2% ± 32.9 | 182336 | 3423 | 53.3 | 18.5 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 9/10 | 90.0% ± 22.6 | 1654 | 31 | 53.2 | 18.5 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 11/13 | 84.6% ± 22.7 | 5244 | 94 | 55.7 | 18.5 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 3507 | 62 | 56.7 | 18.5 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 23/26 | 88.5% ± 14.3 | 100134 | 1834 | 54.6 | 18.5 |
