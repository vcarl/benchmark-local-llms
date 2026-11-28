# llama3.1-8b-omlx: Alpha challenge set

> Meta-Llama-3.1-8B-Instruct on omlx 4bit, Apple M5 Max 128GB. Pass rate 45.0% ± 8.4 (95% CI), rank 82 of 110, tier 7. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Meta-Llama-3.1-8B-Instruct (`mlx-community/Meta-Llama-3.1-8B-Instruct-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 0.6
- Variant (what sets it apart from the model's other rows): runtime omlx · t0.6 · topP 0.9
- Config hash: `fe60ba586661` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `6805db5`
- Samples per item: 1; submitters: local
- Executed: 2026-10-27T02:21:44.184Z – 2026-10-27T02:26:46.428Z

## Score
- Pass rate: 45.0% ± 8.4 (76/169 items); core 53.7%, stretch 36.8%
- Rank 82 of 110, tier 7 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 69, length_cutoff 3

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 24440 total, 145 per item
- Wall time: 258 s total, 1.5 s per item
- Generation speed: 97.6 tok/s
- Peak memory: 5.1 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 11/12 | 91.7% ± 18.3 | 903 | 9 | 95.1 | 5.0 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 557 | 13 | 92.6 | 5.1 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 13/35 | 37.1% ± 23.8 | 5113 | 53 | 96.8 | 5.1 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 8/26 | 30.8% ± 19.0 | 557 | 8 | 69.7 | 5.1 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 5/7 | 71.4% ± 45.1 | 53 | 1 | 41.1 | 5.1 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 8/26 | 30.8% ± 23.2 | 7918 | 79 | 100.7 | 5.1 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 5/10 | 50.0% ± 37.7 | 321 | 4 | 78.8 | 5.1 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 4/13 | 30.8% ± 29.0 | 540 | 6 | 85.5 | 5.1 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 3/4 | 75.0% | 454 | 4 | 101.0 | 5.1 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 11/26 | 42.3% ± 24.2 | 8024 | 79 | 101.3 | 5.1 |
