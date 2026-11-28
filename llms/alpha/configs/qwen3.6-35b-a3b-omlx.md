# qwen3.6-35b-a3b-omlx: Alpha challenge set

> Qwen3.6-35B-A3B on omlx 4bit, Apple M5 Max 128GB. Pass rate 82.8% ± 6.4 (95% CI), rank 25 of 110, tier 3. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3.6-35B-A3B (`mlx-community/Qwen3.6-35B-A3B-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 1
- Variant (what sets it apart from the model's other rows): runtime omlx · t1
- Config hash: `d157024b2dba` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `6805db5`
- Samples per item: 1; submitters: local
- Executed: 2026-10-27T04:11:56.441Z – 2026-10-27T05:05:31.598Z

## Score
- Pass rate: 82.8% ± 6.4 (140/169 items); core 86.6%, stretch 79.3%
- Rank 25 of 110, tier 3 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): thinking_truncated 17, wrong 11

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 425367 total, 2517 per item
- Wall time: 3225 s total, 19.1 s per item
- Generation speed: 131.9 tok/s
- Peak memory: 9.0 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 11/12 | 91.7% ± 18.3 | 29569 | 218 | 135.7 | 9.0 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 14456 | 107 | 135.1 | 9.0 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 33/35 | 94.3% ± 12.0 | 78513 | 594 | 132.1 | 9.0 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 16/26 | 61.5% ± 20.0 | 54410 | 406 | 133.9 | 9.0 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 2917 | 22 | 131.3 | 9.0 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 16/26 | 61.5% ± 26.1 | 131430 | 1009 | 130.3 | 9.0 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 6771 | 51 | 132.9 | 9.0 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 9351 | 70 | 133.6 | 9.0 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 3006 | 22 | 134.2 | 9.0 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 20/26 | 76.9% ± 19.3 | 94944 | 725 | 130.9 | 9.0 |
