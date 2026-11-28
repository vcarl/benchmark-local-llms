# hunyuan-a13b-mlx: Alpha challenge set

> Hunyuan-A13B-Instruct on mlx 4bit, Apple M5 Max 128GB. Pass rate 23.7% ± 7.8 (95% CI), rank 100 of 110, tier 8. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Hunyuan-A13B-Instruct (`mlx-community/Hunyuan-A13B-Instruct-4bit`)
- Runtime: mlx; versions: unknown
- Quant: 4bit; temperature 0.7
- Config hash: `d6f74b5e4585` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-25T19:37:33.521Z – 2026-07-02T08:45:42.061Z

## Score
- Pass rate: 23.7% ± 7.8 (40/169 items); core 39.0%, stretch 9.2%
- Rank 100 of 110, tier 8 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: partial; challenges 9/10, items 159/169
- Failures (sample lines): execution_error 67, wrong 26

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 4305 total, 27 per item
- Wall time: 22989 s total, 144.6 s per item
- Generation speed: 40.2 tok/s
- Peak memory: 42.3 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 7/12 | 58.3% ± 32.7 | 1594 | 31 | 50.8 | 42.3 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | interrupted | 0/10 | 0.0% ± 0.0 | — | — | — | — |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 4/35 | 11.4% ± 13.4 | 98 | 8839 | 18.0 | 42.3 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 5/26 | 19.2% ± 16.2 | 780 | 22 | 35.9 | 42.3 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 6/7 | 85.7% ± 35.0 | 82 | 4 | 21.9 | 42.3 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 1/26 | 3.8% ± 10.2 | 39 | 8020 | 18.5 | 42.3 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 7/10 | 70.0% ± 34.6 | 581 | 14 | 40.9 | 42.3 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 3/13 | 23.1% ± 26.5 | 485 | 13 | 36.6 | 42.3 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 581 | 12 | 50.3 | 42.3 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 3/26 | 11.5% ± 20.9 | 65 | 6034 | 17.5 | 42.3 |
