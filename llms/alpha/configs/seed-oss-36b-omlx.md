# seed-oss-36b-omlx: Alpha challenge set

> Seed-OSS-36B-Instruct on omlx 4bit, Apple M5 Max 128GB. Pass rate 86.4% ± 5.6 (95% CI), rank 19 of 110, tier 2. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Seed-OSS-36B-Instruct (`lmstudio-community/Seed-OSS-36B-Instruct-MLX-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 1.1
- Variant (what sets it apart from the model's other rows): runtime omlx · t1.1
- Config hash: `fb7378d61e53` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `6805db5`
- Samples per item: 1; submitters: local
- Executed: 2026-10-27T15:21:38.907Z – 2026-10-27T19:16:17.111Z

## Score
- Pass rate: 86.4% ± 5.6 (146/169 items); core 85.4%, stretch 87.4%
- Rank 19 of 110, tier 2 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): length_cutoff 7, wrong 3, near_miss 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 317080 total, 1876 per item
- Wall time: 14396 s total, 85.2 s per item
- Generation speed: 22.0 tok/s
- Peak memory: 20.8 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 10/12 | 83.3% ± 24.7 | 19372 | 848 | 22.8 | 19.8 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 6/10 | 60.0% ± 36.9 | 6812 | 296 | 23.0 | 19.9 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 35/35 | 100.0% ± 0.0 | 38652 | 1680 | 23.0 | 19.9 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 20/26 | 76.9% ± 17.4 | 13393 | 577 | 23.2 | 20.1 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 1560 | 67 | 23.3 | 20.1 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 18/26 | 69.2% ± 26.4 | 134052 | 6220 | 21.6 | 20.6 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 4626 | 199 | 23.2 | 20.6 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 6485 | 278 | 23.4 | 20.6 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 3421 | 149 | 23.0 | 20.6 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 23/26 | 88.5% ± 11.8 | 88707 | 4082 | 21.7 | 20.8 |
