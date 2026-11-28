# qwen2.5-7b-omlx: Alpha challenge set

> Qwen2.5-7B-Instruct on omlx 4bit, Apple M5 Max 128GB. Pass rate 48.5% ± 8.9 (95% CI), rank 78 of 110, tier 6. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen2.5-7B-Instruct (`mlx-community/Qwen2.5-7B-Instruct-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime omlx · topP 0.8 · topK 20 · repetitionPenalty 1.05
- Config hash: `629dccbef9e8` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `6805db5`
- Samples per item: 1; submitters: local
- Executed: 2026-10-27T02:16:34.234Z – 2026-10-27T02:21:30.470Z

## Score
- Pass rate: 48.5% ± 8.9 (82/169 items); core 64.6%, stretch 33.3%
- Rank 78 of 110, tier 6 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 66

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 25306 total, 150 per item
- Wall time: 253 s total, 1.5 s per item
- Generation speed: 100.0 tok/s
- Peak memory: 4.9 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 972 | 10 | 98.2 | 4.8 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 7/10 | 70.0% ± 34.6 | 301 | 4 | 76.8 | 4.8 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 11/35 | 31.4% ± 21.4 | 2446 | 26 | 93.2 | 4.8 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 8/26 | 30.8% ± 19.0 | 477 | 7 | 66.3 | 4.8 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 47 | 1 | 37.9 | 4.8 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 7/26 | 26.9% ± 18.6 | 9367 | 90 | 103.8 | 4.8 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 9/10 | 90.0% ± 22.6 | 582 | 6 | 91.7 | 4.8 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 7/13 | 53.8% ± 31.4 | 506 | 6 | 86.0 | 4.8 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 3/4 | 75.0% | 455 | 4 | 105.0 | 4.8 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 11/26 | 42.3% ± 26.9 | 10153 | 98 | 103.9 | 4.9 |
