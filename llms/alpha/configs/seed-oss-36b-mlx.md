# seed-oss-36b-mlx: Alpha challenge set

> Seed-OSS-36B-Instruct on mlx 4bit, Apple M5 Max 128GB. Pass rate 62.1% ± 12.5 (95% CI), rank 63 of 110, tier 5. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Seed-OSS-36B-Instruct (`lmstudio-community/Seed-OSS-36B-Instruct-MLX-4bit`)
- Runtime: mlx; versions: unknown
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx · t0.7
- Config hash: `89f237ab2a9e` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-23T21:42:47.100Z – 2026-07-02T09:19:20.366Z

## Score
- Pass rate: 62.1% ± 12.5 (105/169 items); core 85.4%, stretch 40.2%
- Rank 63 of 110, tier 5 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: partial; challenges 8/10, items 117/169
- Failures (sample lines): none

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 92840 total, 794 per item
- Wall time: 4531 s total, 38.7 s per item
- Generation speed: 20.5 tok/s
- Peak memory: 19.4 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 10/12 | 83.3% ± 24.7 | 19464 | 904 | 21.5 | 19.4 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 5/10 | 50.0% ± 37.7 | 3775 | 173 | 21.8 | 19.4 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 35/35 | 100.0% ± 0.0 | 40711 | 2135 | 19.1 | 19.4 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 21/26 | 80.8% ± 16.2 | 11555 | 516 | 22.4 | 19.4 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 1477 | 66 | 22.5 | 19.4 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | interrupted | 0/26 | 0.0% ± 0.0 | — | — | — | — |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 5094 | 234 | 21.8 | 19.4 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 6897 | 319 | 21.6 | 19.4 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 3867 | 184 | 21.0 | 19.4 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | stale_hash | 0/26 | 0.0% ± 0.0 | — | — | — | — |
