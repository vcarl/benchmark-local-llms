# qwen2.5-32b-omlx: Alpha challenge set

> Qwen2.5-32B-Instruct on omlx 4bit, Apple M5 Max 128GB. Pass rate 63.9% ± 9.2 (95% CI), rank 53 of 110, tier 5. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen2.5-32B-Instruct (`mlx-community/Qwen2.5-32B-Instruct-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime omlx · topP 0.8 · topK 20 · repetitionPenalty 1.05
- Config hash: `7c7f74bb8e03` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `6805db5`
- Samples per item: 1; submitters: local
- Executed: 2026-10-27T05:29:52.982Z – 2026-10-27T05:46:03.329Z

## Score
- Pass rate: 63.9% ± 9.2 (108/169 items); core 75.6%, stretch 52.9%
- Rank 53 of 110, tier 5 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 43

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 23352 total, 138 per item
- Wall time: 945 s total, 5.6 s per item
- Generation speed: 24.7 tok/s
- Peak memory: 18.2 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 927 | 38 | 24.4 | 18.0 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 6/10 | 60.0% ± 36.9 | 391 | 17 | 23.1 | 18.0 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 17/35 | 48.6% ± 25.5 | 1172 | 56 | 21.1 | 18.1 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 12/26 | 46.2% ± 20.5 | 483 | 24 | 19.9 | 18.1 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 67 | 4 | 15.5 | 18.1 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 11/26 | 42.3% ± 28.6 | 9249 | 366 | 25.3 | 18.2 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 420 | 18 | 22.9 | 18.2 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 11/13 | 84.6% ± 22.7 | 537 | 23 | 22.9 | 18.2 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 542 | 21 | 25.7 | 18.2 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 18/26 | 69.2% ± 29.5 | 9564 | 377 | 25.4 | 18.2 |
