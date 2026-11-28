# qwen3.8-27b-mlx: Alpha challenge set

> Qwen3.8-27B on mlx 4bit, Apple M5 Max 128GB. Pass rate 83.4% ± 6.8 (95% CI), rank 23 of 110, tier 3. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3.8-27B (`mlx-community/Qwen3.8-27B-4bit`)
- Runtime: mlx; versions: unknown
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx · t0.7
- Config hash: `9c06749c4a05` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-08-27T01:52:09.337Z – 2026-08-27T05:34:59.453Z

## Score
- Pass rate: 83.4% ± 6.8 (141/169 items); core 81.7%, stretch 85.1%
- Rank 23 of 110, tier 3 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): thinking_truncated 10, loop 2, wrong 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 162208 total, 960 per item
- Wall time: 7767 s total, 46.0 s per item
- Generation speed: 23.3 tok/s
- Peak memory: 15.5 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 11/12 | 91.7% ± 18.3 | 6206 | 285 | 21.8 | 14.5 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 9/10 | 90.0% ± 22.6 | 1531 | 87 | 22.2 | 14.5 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 35/35 | 100.0% ± 0.0 | 10957 | 460 | 23.8 | 14.5 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 13/26 | 50.0% ± 20.6 | 15087 | 1386 | 19.6 | 14.5 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 545 | 23 | 23.5 | 14.5 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 15/26 | 57.7% ± 33.2 | 93849 | 3932 | 24.9 | 15.5 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 1085 | 56 | 19.5 | 14.5 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 1219 | 144 | 8.4 | 14.6 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 545 | 39 | 14.0 | 14.6 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 24/26 | 92.3% ± 11.2 | 31184 | 1356 | 23.3 | 14.6 |
