# gemma-4-e4b-omlx: Alpha challenge set

> gemma-4-e4b-it on omlx 4bit, Apple M5 Max 128GB. Pass rate 59.2% ± 8.8 (95% CI), rank 68 of 110, tier 6. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: gemma-4-e4b-it (`mlx-community/gemma-4-e4b-it-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 1
- Variant (what sets it apart from the model's other rows): runtime omlx · t1 · maxTokens 32768 · topP 0.95 · topK 64
- Config hash: `f76e557152af` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `7221ba3`
- Samples per item: 1; submitters: local
- Executed: 2026-10-23T12:28:32.445Z – 2026-10-23T12:37:01.664Z

## Score
- Pass rate: 59.2% ± 8.8 (100/169 items); core 68.3%, stretch 50.6%
- Rank 68 of 110, tier 6 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 49

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 59267 total, 351 per item
- Wall time: 517 s total, 3.1 s per item
- Generation speed: 114.6 tok/s
- Peak memory: 6.6 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 11/12 | 91.7% ± 18.3 | 1292 | 12 | 108.2 | 6.5 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 442 | 5 | 90.8 | 6.5 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 17/35 | 48.6% ± 24.7 | 6590 | 58 | 113.7 | 6.6 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 10/26 | 38.5% ± 20.0 | 576 | 8 | 69.5 | 6.6 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 41 | 1 | 30.6 | 6.6 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 10/26 | 38.5% ± 29.5 | 25399 | 216 | 117.8 | 6.6 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 9/10 | 90.0% ± 22.6 | 644 | 7 | 94.8 | 6.6 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 8/13 | 61.5% ± 30.6 | 1052 | 10 | 102.9 | 6.6 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 3/4 | 75.0% | 1036 | 9 | 114.7 | 6.6 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 17/26 | 65.4% ± 25.2 | 22195 | 191 | 116.0 | 6.6 |
