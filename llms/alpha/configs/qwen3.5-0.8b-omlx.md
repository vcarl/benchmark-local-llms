# qwen3.5-0.8b-omlx: Alpha challenge set

> Qwen3.5-0.8B on omlx 4bit, Apple M5 Max 128GB. Pass rate 23.7% ± 6.7 (95% CI), rank 99 of 110, tier 8. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3.5-0.8B (`mlx-community/Qwen3.5-0.8B-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime omlx · maxTokens 32768 · topP 0.8 · topK 20 · minP 0 · presencePenalty 1.5
- Config hash: `01b1e1ba8e47` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `7221ba3`
- Samples per item: 1; submitters: local
- Executed: 2026-10-23T06:46:18.657Z – 2026-10-23T06:50:39.045Z

## Score
- Pass rate: 23.7% ± 6.7 (40/169 items); core 19.5%, stretch 27.6%
- Rank 99 of 110, tier 8 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 76, loop 7, no_answer 3

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 23892 total, 141 per item
- Wall time: 262 s total, 1.5 s per item
- Generation speed: 326.2 tok/s
- Peak memory: 1.9 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 2/12 | 16.7% ± 24.7 | 1274 | 4 | 289.4 | 1.8 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 2/10 | 20.0% ± 30.2 | 372 | 2 | 181.9 | 1.8 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 10/35 | 28.6% ± 20.5 | 409 | 5 | 76.5 | 1.8 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 3/26 | 11.5% ± 13.2 | 506 | 4 | 117.6 | 1.8 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 3/7 | 42.9% ± 49.4 | 40 | 1 | 41.6 | 1.8 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 6/26 | 23.1% ± 14.2 | 15194 | 115 | 411.8 | 1.9 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 3/10 | 30.0% ± 34.6 | 427 | 2 | 200.8 | 1.9 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 1/13 | 7.7% ± 16.8 | 1546 | 5 | 306.7 | 1.9 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 2/4 | 50.0% | 364 | 1 | 276.2 | 1.9 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 8/26 | 30.8% ± 26.9 | 3760 | 121 | 348.1 | 1.9 |
