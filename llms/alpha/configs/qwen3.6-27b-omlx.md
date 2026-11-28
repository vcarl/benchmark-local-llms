# qwen3.6-27b-omlx: Alpha challenge set

> Qwen3.6-27B on omlx 4bit, Apple M5 Max 128GB. Pass rate 84.6% ± 6.9 (95% CI), rank 21 of 110, tier 3. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3.6-27B (`mlx-community/Qwen3.6-27B-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 1
- Variant (what sets it apart from the model's other rows): runtime omlx · t1
- Config hash: `14c4e3564e04` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `6805db5`
- Samples per item: 1; submitters: local
- Executed: 2026-10-27T11:35:38.130Z – 2026-10-27T15:01:56.184Z

## Score
- Pass rate: 84.6% ± 6.9 (143/169 items); core 89.0%, stretch 80.5%
- Rank 21 of 110, tier 3 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): thinking_truncated 16, wrong 9, length_cutoff 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 386883 total, 2289 per item
- Wall time: 12585 s total, 74.5 s per item
- Generation speed: 30.7 tok/s
- Peak memory: 16.5 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 11/12 | 91.7% ± 18.3 | 27501 | 879 | 31.3 | 16.4 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 21434 | 687 | 31.2 | 16.4 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 34/35 | 97.1% ± 6.0 | 55065 | 1764 | 31.2 | 16.4 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 18/26 | 69.2% ± 19.0 | 55462 | 1780 | 31.2 | 16.4 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 2119 | 69 | 30.8 | 16.4 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 15/26 | 57.7% ± 36.2 | 128301 | 4211 | 30.5 | 16.5 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 8443 | 275 | 30.7 | 16.5 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 8383 | 273 | 30.7 | 16.5 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 4201 | 137 | 30.8 | 16.5 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 21/26 | 80.8% ± 21.3 | 75974 | 2510 | 30.3 | 16.5 |
