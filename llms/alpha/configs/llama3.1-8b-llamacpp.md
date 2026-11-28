# llama3.1-8b-llamacpp: Alpha challenge set

> Meta-Llama-3.1-8B-Instruct on llamacpp Q8_0, Apple M5 Max 128GB. Pass rate 41.4% ± 9.3 (95% CI), rank 83 of 110, tier 7. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Meta-Llama-3.1-8B-Instruct (`bartowski/Meta-Llama-3.1-8B-Instruct-GGUF`)
- Runtime: llamacpp; versions: unknown
- Quant: Q8_0; temperature 0.7
- Config hash: `cf64acdfea28` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-24T02:48:46.030Z – 2026-06-28T21:45:03.070Z

## Score
- Pass rate: 41.4% ± 9.3 (70/169 items); core 56.1%, stretch 27.6%
- Rank 83 of 110, tier 7 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 77

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 26624 total, 158 per item
- Wall time: 544 s total, 3.2 s per item
- Generation speed: 50.2 tok/s
- Peak memory: 18.2 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 10/12 | 83.3% ± 24.7 | 775 | 14 | 58.2 | 16.4 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 7/10 | 70.0% ± 34.6 | 649 | 12 | 56.1 | 16.6 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 7/35 | 20.0% ± 21.0 | 3806 | 80 | 49.3 | 16.8 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 9/26 | 34.6% ± 19.6 | 609 | 12 | 59.8 | 16.6 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 6/7 | 85.7% ± 35.0 | 133 | 3 | 59.0 | 16.6 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 10/26 | 38.5% ± 25.7 | 9269 | 192 | 49.0 | 17.4 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 5/10 | 50.0% ± 37.7 | 529 | 10 | 57.9 | 16.9 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 5/13 | 38.5% ± 30.6 | 542 | 10 | 57.1 | 16.9 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 554 | 10 | 55.5 | 17.0 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 7/26 | 26.9% ± 29.9 | 9758 | 201 | 49.3 | 18.2 |
