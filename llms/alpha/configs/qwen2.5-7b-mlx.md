# qwen2.5-7b-mlx: Alpha challenge set

> Qwen2.5-7B-Instruct on mlx 4bit, Apple M5 Max 128GB. Pass rate 50.3% ± 8.8 (95% CI), rank 76 of 110, tier 6. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen2.5-7B-Instruct (`mlx-community/Qwen2.5-7B-Instruct-4bit`)
- Runtime: mlx; versions: unknown
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx · topP default · topK default · repetitionPenalty default
- Config hash: `86d55c7949a3` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-19T20:18:02.112Z – 2026-06-28T01:39:56.129Z

## Score
- Pass rate: 50.3% ± 8.8 (85/169 items); core 67.1%, stretch 34.5%
- Rank 76 of 110, tier 6 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 67

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 27249 total, 161 per item
- Wall time: 278 s total, 1.6 s per item
- Generation speed: 98.1 tok/s
- Peak memory: 4.3 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 931 | 10 | 94.8 | 0.0 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 285 | 4 | 68.9 | 0.0 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 14/35 | 40.0% ± 25.0 | 2690 | 28 | 95.5 | 4.3 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 9/26 | 34.6% ± 19.6 | 471 | 8 | 59.9 | 0.0 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 47 | 2 | 27.2 | 0.0 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 8/26 | 30.8% ± 23.2 | 9896 | 98 | 100.7 | 4.3 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 9/10 | 90.0% ± 22.6 | 522 | 6 | 85.1 | 0.0 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 7/13 | 53.8% ± 31.4 | 529 | 7 | 80.4 | 0.0 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 3/4 | 75.0% | 504 | 5 | 105.8 | 4.2 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 8/26 | 30.8% ± 16.6 | 11374 | 110 | 103.2 | 4.3 |
