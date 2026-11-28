# qwen3-coder-30b-a3b-omlx: Alpha challenge set

> Qwen3-Coder-30B-A3B-Instruct on omlx 4bit, Apple M5 Max 128GB. Pass rate 66.3% ± 7.8 (95% CI), rank 48 of 110, tier 5. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3-Coder-30B-A3B-Instruct (`mlx-community/Qwen3-Coder-30B-A3B-Instruct-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime omlx
- Config hash: `8c05e2f2c02d` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `6805db5`
- Samples per item: 1; submitters: local
- Executed: 2026-10-27T01:37:50.527Z – 2026-10-27T02:01:31.428Z

## Score
- Pass rate: 66.3% ± 7.8 (112/169 items); core 72.0%, stretch 60.9%
- Rank 48 of 110, tier 5 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 33, length_cutoff 6, loop 2, near_miss 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 148753 total, 880 per item
- Wall time: 1396 s total, 8.3 s per item
- Generation speed: 115.4 tok/s
- Peak memory: 16.9 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 9/12 | 75.0% ± 28.7 | 1119 | 10 | 107.4 | 16.8 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 570 | 6 | 99.3 | 16.8 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 26/35 | 74.3% ± 10.5 | 48983 | 484 | 116.0 | 16.9 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 16/26 | 61.5% ± 20.0 | 603 | 9 | 70.5 | 16.9 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 5/7 | 71.4% ± 45.1 | 141 | 2 | 66.6 | 16.9 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 11/26 | 42.3% ± 21.4 | 58936 | 560 | 114.6 | 16.9 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 9/10 | 90.0% ± 22.6 | 1171 | 10 | 114.8 | 16.9 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 9/13 | 69.2% ± 29.0 | 785 | 8 | 101.0 | 16.9 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 3/4 | 75.0% | 693 | 6 | 123.0 | 16.9 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 16/26 | 61.5% ± 35.2 | 35752 | 302 | 118.4 | 16.9 |
