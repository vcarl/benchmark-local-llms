# gemma-4-26b-a4b-omlx: Alpha challenge set

> gemma-4-26b-a4b-it on omlx 4bit, Apple M5 Max 128GB. Pass rate 74.0% ± 8.1 (95% CI), rank 38 of 110, tier 4. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: gemma-4-26b-a4b-it (`mlx-community/gemma-4-26b-a4b-it-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 1
- Variant (what sets it apart from the model's other rows): runtime omlx · t1 · topP 0.95 · topK 64
- Config hash: `cb1b080b61f5` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `6805db5`
- Samples per item: 1; submitters: local
- Executed: 2026-10-27T06:03:55.798Z – 2026-10-27T06:08:35.033Z

## Score
- Pass rate: 74.0% ± 8.1 (125/169 items); core 86.6%, stretch 62.1%
- Rank 38 of 110, tier 4 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 38

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 22758 total, 135 per item
- Wall time: 235 s total, 1.4 s per item
- Generation speed: 96.8 tok/s
- Peak memory: 16.7 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 1021 | 11 | 89.6 | 16.2 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 357 | 5 | 68.0 | 16.2 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 18/35 | 51.4% ± 22.7 | 1239 | 19 | 64.8 | 16.2 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 20/26 | 76.9% ± 17.4 | 548 | 10 | 52.6 | 16.2 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 36 | 2 | 19.6 | 16.2 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 16/26 | 61.5% ± 28.9 | 9446 | 88 | 107.3 | 16.7 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 9/10 | 90.0% ± 22.6 | 556 | 7 | 79.5 | 16.7 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 9/13 | 69.2% ± 29.0 | 717 | 9 | 80.1 | 16.7 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 739 | 7 | 103.8 | 16.7 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 20/26 | 76.9% ± 19.3 | 8099 | 76 | 106.5 | 16.7 |
