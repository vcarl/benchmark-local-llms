# qwen3-32b-mlx-8bit: Alpha challenge set

> Qwen3-32B on mlx 8bit, Apple M5 Max 128GB. Pass rate 76.9% ± 8.4 (95% CI), rank 32 of 110, tier 4. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3-32B (`mlx-community/Qwen3-32B-8bit`)
- Runtime: mlx; versions: unknown
- Quant: 8bit; temperature 0.7
- Config hash: `97cf4e76da87` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-22T05:09:45.675Z – 2026-06-28T10:00:39.345Z

## Score
- Pass rate: 76.9% ± 8.4 (130/169 items); core 82.9%, stretch 71.3%
- Rank 32 of 110, tier 4 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): execution_error 21, no_answer 3, wrong 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 158322 total, 937 per item
- Wall time: 18174 s total, 107.5 s per item
- Generation speed: 13.7 tok/s
- Peak memory: 32.8 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 10/12 | 83.3% ± 24.7 | 16724 | 1517 | 13.8 | 32.8 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 9/10 | 90.0% ± 22.6 | 5090 | 367 | 13.9 | 32.8 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 34/35 | 97.1% ± 6.0 | 43757 | 3540 | 13.5 | 32.8 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 15/26 | 57.7% ± 20.4 | 14207 | 1064 | 13.4 | 32.8 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 2444 | 173 | 14.1 | 32.8 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 11/26 | 42.3% ± 35.5 | 28997 | 5730 | 13.7 | 32.8 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 5180 | 353 | 14.7 | 32.8 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 9942 | 676 | 14.7 | 32.8 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 5124 | 360 | 14.2 | 32.8 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 17/26 | 65.4% ± 29.7 | 26857 | 4394 | 13.5 | 32.8 |
