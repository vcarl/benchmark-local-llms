# phi-4-omlx-8bit: Alpha challenge set

> phi-4 on omlx 8bit, Apple M5 Max 128GB. Pass rate 65.1% ± 8.1 (95% CI), rank 50 of 110, tier 5. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: phi-4 (`mlx-community/phi-4-8bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 8bit; temperature 0
- Variant (what sets it apart from the model's other rows): runtime omlx · t0
- Config hash: `15fc6b362d57` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `6805db5`
- Samples per item: 1; submitters: local
- Executed: 2026-10-27T05:46:37.998Z – 2026-10-27T06:03:24.711Z

## Score
- Pass rate: 65.1% ± 8.1 (110/169 items); core 73.2%, stretch 57.5%
- Rank 50 of 110, tier 5 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 42

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 32162 total, 190 per item
- Wall time: 975 s total, 5.8 s per item
- Generation speed: 33.0 tok/s
- Peak memory: 15.3 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 958 | 30 | 32.4 | 15.2 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 9/10 | 90.0% ± 22.6 | 606 | 19 | 32.0 | 15.2 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 18/35 | 51.4% ± 19.9 | 5169 | 156 | 33.1 | 15.3 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 10/26 | 38.5% ± 20.0 | 733 | 25 | 29.0 | 15.3 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 46 | 2 | 18.7 | 15.3 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 11/26 | 42.3% ± 15.9 | 11560 | 347 | 33.3 | 15.3 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 527 | 17 | 31.1 | 15.3 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 9/13 | 69.2% ± 29.0 | 733 | 23 | 31.6 | 15.3 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 3/4 | 75.0% | 697 | 21 | 33.7 | 15.3 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 21/26 | 80.8% ± 21.3 | 11133 | 335 | 33.2 | 15.3 |
