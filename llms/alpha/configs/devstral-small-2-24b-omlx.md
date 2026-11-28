# devstral-small-2-24b-omlx: Alpha challenge set

> Devstral-Small-2-24B-Instruct-2512 on omlx 4bit, Apple M5 Max 128GB. Pass rate 64.5% ± 9.0 (95% CI), rank 51 of 110, tier 5. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Devstral-Small-2-24B-Instruct-2512 (`mlx-community/Devstral-Small-2-24B-Instruct-2512-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 0.15
- Variant (what sets it apart from the model's other rows): runtime omlx · t0.15
- Config hash: `39e0e47b6b04` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `6805db5`
- Samples per item: 1; submitters: local
- Executed: 2026-10-27T02:27:00.876Z – 2026-10-27T02:49:12.792Z

## Score
- Pass rate: 64.5% ± 9.0 (109/169 items); core 75.6%, stretch 54.0%
- Rank 51 of 110, tier 5 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 44, loop 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 39807 total, 236 per item
- Wall time: 1332 s total, 7.9 s per item
- Generation speed: 34.1 tok/s
- Peak memory: 15.3 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 1004 | 30 | 33.2 | 15.1 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 443 | 14 | 31.6 | 15.1 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 17/35 | 48.6% ± 26.2 | 2816 | 251 | 32.7 | 15.2 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 13/26 | 50.0% ± 20.6 | 642 | 23 | 28.5 | 15.2 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 36 | 2 | 15.0 | 15.2 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 11/26 | 42.3% ± 20.1 | 16876 | 490 | 34.4 | 15.2 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 341 | 12 | 29.5 | 15.2 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 8/13 | 61.5% ± 30.6 | 536 | 17 | 31.4 | 15.2 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 491 | 14 | 34.5 | 15.2 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 19/26 | 73.1% ± 28.7 | 16622 | 479 | 34.7 | 15.3 |
