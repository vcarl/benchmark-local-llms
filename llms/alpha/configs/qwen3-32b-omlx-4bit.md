# qwen3-32b-omlx-4bit: Alpha challenge set

> Qwen3-32B on omlx 4bit, Apple M5 Max 128GB. Pass rate 76.3% ± 8.2 (95% CI), rank 35 of 110, tier 4. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3-32B (`mlx-community/Qwen3-32B-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 0.6
- Variant (what sets it apart from the model's other rows): runtime omlx · t0.6
- Config hash: `fa59465fd061` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `6805db5`
- Samples per item: 1; submitters: local
- Executed: 2026-10-27T21:43:09.247Z – 2026-10-28T01:46:32.483Z

## Score
- Pass rate: 76.3% ± 8.2 (129/169 items); core 75.6%, stretch 77.0%
- Rank 35 of 110, tier 4 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): thinking_truncated 14, loop 7, length_cutoff 2, wrong 2, no_answer 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 342076 total, 2024 per item
- Wall time: 14883 s total, 88.1 s per item
- Generation speed: 24.3 tok/s
- Peak memory: 18.8 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 16691 | 657 | 25.4 | 18.1 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 9/10 | 90.0% ± 22.6 | 6539 | 257 | 25.5 | 18.1 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 33/35 | 94.3% ± 8.2 | 64242 | 2711 | 24.8 | 18.2 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 14/26 | 53.8% ± 20.5 | 9266 | 360 | 25.7 | 18.2 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 5/7 | 71.4% ± 45.1 | 1828 | 113 | 25.7 | 18.2 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 15/26 | 57.7% ± 36.6 | 126535 | 5663 | 23.8 | 18.8 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 8/10 | 80.0% ± 30.2 | 5139 | 294 | 25.6 | 18.8 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 11/13 | 84.6% ± 22.7 | 12368 | 708 | 25.0 | 18.8 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 3/4 | 75.0% | 8236 | 331 | 24.9 | 18.8 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 19/26 | 73.1% ± 31.9 | 91232 | 3790 | 24.1 | 18.8 |
