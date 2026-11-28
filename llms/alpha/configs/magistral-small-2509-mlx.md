# magistral-small-2509-mlx: Alpha challenge set

> Magistral-Small-2509 on mlx 4bit, Apple M5 Max 128GB. Pass rate 60.4% ± 9.1 (95% CI), rank 65 of 110, tier 5. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Magistral-Small-2509 (`lmstudio-community/Magistral-Small-2509-MLX-4bit`)
- Runtime: mlx; versions: unknown
- Quant: 4bit; temperature 0.6
- Variant (what sets it apart from the model's other rows): runtime mlx · t0.6 · topP default
- Config hash: `65690aa15c27` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-24T08:33:37.405Z – 2026-07-02T01:45:01.842Z

## Score
- Pass rate: 60.4% ± 9.1 (102/169 items); core 73.2%, stretch 48.3%
- Rank 65 of 110, tier 5 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 45, execution_error 8

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 26173 total, 155 per item
- Wall time: 3340 s total, 19.8 s per item
- Generation speed: 28.2 tok/s
- Peak memory: 12.9 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 1040 | 32 | 32.4 | 12.8 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 498 | 16 | 31.2 | 12.8 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 15/35 | 42.9% ± 20.8 | 2096 | 79 | 26.6 | 12.8 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 14/26 | 53.8% ± 20.5 | 4336 | 132 | 32.8 | 12.8 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 5/7 | 71.4% ± 45.1 | 137 | 5 | 25.6 | 12.8 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 9/26 | 34.6% ± 23.7 | 9119 | 1225 | 28.5 | 12.9 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 8/10 | 80.0% ± 30.2 | 692 | 22 | 32.1 | 12.8 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 9/13 | 69.2% ± 29.0 | 763 | 24 | 31.6 | 12.8 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 524 | 16 | 33.7 | 12.8 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 18/26 | 69.2% ± 29.5 | 6968 | 1789 | 24.6 | 12.9 |
