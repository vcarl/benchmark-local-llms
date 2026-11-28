# qwen2.5-32b-mlx: Alpha challenge set

> Qwen2.5-32B-Instruct on mlx 4bit, Apple M5 Max 128GB. Pass rate 63.9% ± 9.7 (95% CI), rank 55 of 110, tier 5. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen2.5-32B-Instruct (`mlx-community/Qwen2.5-32B-Instruct-4bit`)
- Runtime: mlx; versions: unknown
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx · topP default · topK default · repetitionPenalty default
- Config hash: `ee0a7b3efae5` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-24T20:25:16.705Z – 2026-06-29T01:14:22.865Z

## Score
- Pass rate: 63.9% ± 9.7 (108/169 items); core 79.3%, stretch 49.4%
- Rank 55 of 110, tier 5 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 47

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 23953 total, 142 per item
- Wall time: 1100 s total, 6.5 s per item
- Generation speed: 21.8 tok/s
- Peak memory: 17.5 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 921 | 49 | 18.7 | 17.5 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 7/10 | 70.0% ± 34.6 | 370 | 21 | 17.6 | 17.5 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 18/35 | 51.4% ± 29.1 | 1224 | 66 | 18.4 | 17.5 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 15/26 | 57.7% ± 20.4 | 541 | 34 | 16.1 | 17.5 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 56 | 5 | 12.2 | 17.5 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 10/26 | 38.5% ± 32.8 | 9065 | 394 | 23.0 | 17.5 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 323 | 19 | 17.0 | 17.5 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 10/13 | 76.9% ± 26.5 | 625 | 34 | 18.2 | 17.5 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 517 | 26 | 19.6 | 17.5 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 15/26 | 57.7% ± 31.2 | 10311 | 452 | 22.8 | 17.5 |
