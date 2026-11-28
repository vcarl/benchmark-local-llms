# deepseek-r1-distill-qwen-7b-mlx: Alpha challenge set

> DeepSeek-R1-Distill-Qwen-7B on mlx 4bit, Apple M5 Max 128GB. Pass rate 63.3% ± 8.3 (95% CI), rank 57 of 110, tier 5. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: DeepSeek-R1-Distill-Qwen-7B (`mlx-community/DeepSeek-R1-Distill-Qwen-7B-4bit`)
- Runtime: mlx; versions: unknown
- Quant: 4bit; temperature 0.6
- Variant (what sets it apart from the model's other rows): runtime mlx
- Config hash: `a1a644a233c4` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-20T23:24:01.565Z – 2026-06-28T01:46:43.324Z

## Score
- Pass rate: 63.3% ± 8.3 (107/169 items); core 54.9%, stretch 71.3%
- Rank 57 of 110, tier 5 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 21, no_answer 10, near_miss 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 255950 total, 1514 per item
- Wall time: 2832 s total, 16.8 s per item
- Generation speed: 90.4 tok/s
- Peak memory: 4.4 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 10/12 | 83.3% ± 24.7 | 24568 | 239 | 103.0 | 4.4 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 5/10 | 50.0% ± 37.7 | 3426 | 33 | 104.1 | 4.4 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 28/35 | 80.0% ± 19.3 | 38662 | 415 | 93.1 | 4.4 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 3/26 | 11.5% ± 13.2 | 11304 | 109 | 103.4 | 4.4 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 6/7 | 85.7% ± 35.0 | 5655 | 58 | 98.0 | 4.4 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 13/26 | 50.0% ± 28.8 | 103955 | 1204 | 86.3 | 4.4 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 7/10 | 70.0% ± 34.6 | 3616 | 36 | 101.0 | 4.4 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 10/13 | 76.9% ± 26.5 | 4518 | 45 | 101.1 | 4.4 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 3396 | 33 | 104.4 | 4.4 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 21/26 | 80.8% ± 16.2 | 56850 | 661 | 86.0 | 4.4 |
