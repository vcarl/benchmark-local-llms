# mistral-small-3.2-24b-omlx: Alpha challenge set

> Mistral-Small-3.2-24B-Instruct-2506 on omlx 4bit, Apple M5 Max 128GB. Pass rate 64.5% ± 8.3 (95% CI), rank 52 of 110, tier 5. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Mistral-Small-3.2-24B-Instruct-2506 (`mlx-community/Mistral-Small-3.2-24B-Instruct-2506-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 0.15
- Variant (what sets it apart from the model's other rows): runtime omlx · t0.15
- Config hash: `5de3bf9dadb7` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `6805db5`
- Samples per item: 1; submitters: local
- Executed: 2026-10-27T05:06:43.460Z – 2026-10-27T05:29:10.051Z

## Score
- Pass rate: 64.5% ± 8.3 (109/169 items); core 67.1%, stretch 62.1%
- Rank 52 of 110, tier 5 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 43, no_answer 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 48433 total, 287 per item
- Wall time: 1329 s total, 7.9 s per item
- Generation speed: 36.5 tok/s
- Peak memory: 13.4 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 1023 | 30 | 34.6 | 13.2 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 7/10 | 70.0% ± 34.6 | 538 | 16 | 33.8 | 13.2 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 27/35 | 77.1% ± 14.9 | 8984 | 246 | 36.6 | 13.3 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 13/26 | 50.0% ± 20.6 | 634 | 21 | 30.3 | 13.3 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 5/7 | 71.4% ± 45.1 | 79 | 3 | 23.6 | 13.3 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 9/26 | 34.6% ± 23.7 | 20320 | 554 | 36.7 | 13.3 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 8/10 | 80.0% ± 30.2 | 781 | 22 | 35.0 | 13.4 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 7/13 | 53.8% ± 31.4 | 866 | 25 | 35.1 | 13.4 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 3/4 | 75.0% | 509 | 14 | 36.7 | 13.4 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 18/26 | 69.2% ± 29.5 | 14699 | 399 | 36.9 | 13.4 |
