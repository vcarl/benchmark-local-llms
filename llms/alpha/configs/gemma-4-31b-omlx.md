# gemma-4-31b-omlx: Alpha challenge set

> gemma-4-31b-it on omlx 4bit, Apple M5 Max 128GB. Pass rate 75.7% ± 8.2 (95% CI), rank 36 of 110, tier 4. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: gemma-4-31b-it (`mlx-community/gemma-4-31b-it-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 1
- Variant (what sets it apart from the model's other rows): runtime omlx · t1 · topP 0.95 · topK 64
- Config hash: `765322c48895` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `6805db5`
- Samples per item: 1; submitters: local
- Executed: 2026-10-27T15:06:40.586Z – 2026-10-27T15:21:02.315Z

## Score
- Pass rate: 75.7% ± 8.2 (128/169 items); core 90.2%, stretch 62.1%
- Rank 36 of 110, tier 4 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 35

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 18349 total, 109 per item
- Wall time: 836 s total, 4.9 s per item
- Generation speed: 22.0 tok/s
- Peak memory: 19.8 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 1017 | 46 | 22.3 | 18.8 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 408 | 20 | 20.3 | 18.8 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 22/35 | 62.9% ± 23.1 | 373 | 30 | 12.3 | 18.8 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 20/26 | 76.9% ± 17.4 | 527 | 30 | 17.3 | 18.8 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 36 | 4 | 8.8 | 18.8 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 14/26 | 53.8% ± 23.6 | 7741 | 339 | 22.9 | 19.8 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 400 | 20 | 19.6 | 19.8 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 11/13 | 84.6% ± 22.7 | 560 | 28 | 20.1 | 19.8 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 555 | 24 | 23.1 | 19.8 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 18/26 | 69.2% ± 32.6 | 6732 | 294 | 22.9 | 19.8 |
