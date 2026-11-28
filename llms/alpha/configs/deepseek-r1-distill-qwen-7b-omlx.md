# deepseek-r1-distill-qwen-7b-omlx: Alpha challenge set

> DeepSeek-R1-Distill-Qwen-7B on omlx 4bit, Apple M5 Max 128GB. Pass rate 68.6% ± 8.0 (95% CI), rank 46 of 110, tier 5. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: DeepSeek-R1-Distill-Qwen-7B (`mlx-community/DeepSeek-R1-Distill-Qwen-7B-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 0.6
- Variant (what sets it apart from the model's other rows): runtime omlx
- Config hash: `6ba0f2e9b070` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `6805db5`
- Samples per item: 1; submitters: local
- Executed: 2026-10-27T06:08:49.559Z – 2026-10-27T06:57:33.729Z

## Score
- Pass rate: 68.6% ± 8.0 (116/169 items); core 62.2%, stretch 74.7%
- Rank 46 of 110, tier 5 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 13, thinking_truncated 10, no_answer 3, loop 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 289837 total, 1715 per item
- Wall time: 2901 s total, 17.2 s per item
- Generation speed: 102.1 tok/s
- Peak memory: 4.8 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 22839 | 216 | 105.7 | 4.8 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 6/10 | 60.0% ± 36.9 | 3937 | 37 | 107.0 | 4.8 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 31/35 | 88.6% ± 12.2 | 50997 | 492 | 103.6 | 4.8 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 4/26 | 15.4% ± 14.9 | 10896 | 103 | 106.3 | 4.8 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 5/7 | 71.4% ± 45.1 | 2084 | 20 | 106.3 | 4.8 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 13/26 | 50.0% ± 35.2 | 114240 | 1205 | 99.9 | 4.8 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 9/10 | 90.0% ± 22.6 | 3610 | 34 | 106.3 | 4.8 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 11/13 | 84.6% ± 22.7 | 4505 | 42 | 106.2 | 4.8 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 2913 | 28 | 105.6 | 4.8 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 21/26 | 80.8% ± 16.2 | 73816 | 725 | 101.8 | 4.8 |
