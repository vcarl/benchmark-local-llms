# gemma-4-e4b-mlx: Alpha challenge set

> gemma-4-e4b-it on mlx 4bit, Apple M5 Max 128GB. Pass rate 48.5% ± 11.8 (95% CI), rank 80 of 110, tier 6. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: gemma-4-e4b-it (`mlx-community/gemma-4-e4b-it-4bit`)
- Runtime: mlx; versions: unknown
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx · t0.7 · maxTokens 2048 · topP default · topK default
- Config hash: `d784c8a4561b` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-25T06:10:06.159Z – 2026-06-30T14:32:08.633Z

## Score
- Pass rate: 48.5% ± 11.8 (82/169 items); core 78.0%, stretch 20.7%
- Rank 80 of 110, tier 6 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): execution_error 67, no_answer 2, wrong 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 56425 total, 334 per item
- Wall time: 20681 s total, 122.4 s per item
- Generation speed: 117.6 tok/s
- Peak memory: 5.3 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 10/12 | 83.3% ± 24.7 | 10552 | 90 | 117.4 | 5.3 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 4325 | 37 | 118.0 | 5.3 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 11/35 | 31.4% ± 27.7 | 5384 | 7282 | 117.7 | 5.3 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 13/26 | 50.0% ± 20.6 | 15218 | 129 | 118.3 | 5.3 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 439 | 4 | 98.3 | 5.3 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 1/26 | 3.8% ± 10.2 | 5682 | 6982 | 119.2 | 5.3 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 4295 | 37 | 116.8 | 5.3 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 12/13 | 92.3% ± 16.8 | 4917 | 42 | 116.7 | 5.3 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 2094 | 18 | 117.5 | 5.3 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 6/26 | 23.1% ± 34.4 | 3519 | 6060 | 117.1 | 5.3 |
