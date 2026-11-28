# magistral-small-2509-omlx: Alpha challenge set

> Magistral-Small-2509 on omlx 4bit, Apple M5 Max 128GB. Pass rate 63.3% ± 8.3 (95% CI), rank 58 of 110, tier 5. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Magistral-Small-2509 (`lmstudio-community/Magistral-Small-2509-MLX-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime omlx · t0.7 · topP 0.95
- Config hash: `c9ef4314702a` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `6805db5`
- Samples per item: 1; submitters: local
- Executed: 2026-10-27T06:58:18.964Z – 2026-10-27T07:17:07.605Z

## Score
- Pass rate: 63.3% ± 8.3 (107/169 items); core 73.2%, stretch 54.0%
- Rank 58 of 110, tier 5 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 47

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 39733 total, 235 per item
- Wall time: 1092 s total, 6.5 s per item
- Generation speed: 36.4 tok/s
- Peak memory: 14.2 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 941 | 27 | 35.2 | 14.1 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 9/10 | 90.0% ± 22.6 | 467 | 14 | 34.2 | 14.1 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 18/35 | 51.4% ± 18.7 | 4449 | 124 | 36.0 | 14.1 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 12/26 | 46.2% ± 20.5 | 583 | 20 | 29.7 | 14.1 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 36 | 2 | 15.6 | 14.1 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 12/26 | 46.2% ± 28.8 | 18168 | 492 | 36.9 | 14.2 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 7/10 | 70.0% ± 34.6 | 476 | 14 | 33.0 | 14.2 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 9/13 | 69.2% ± 29.0 | 775 | 22 | 34.9 | 14.2 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 487 | 13 | 36.8 | 14.2 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 17/26 | 65.4% ± 29.7 | 13351 | 363 | 36.7 | 14.2 |
