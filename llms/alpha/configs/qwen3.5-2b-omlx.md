# qwen3.5-2b-omlx: Alpha challenge set

> Qwen3.5-2B on omlx 4bit, Apple M5 Max 128GB. Pass rate 37.3% ± 7.8 (95% CI), rank 90 of 110, tier 7. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3.5-2B (`mlx-community/Qwen3.5-2B-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime omlx · maxTokens 32768 · topP 0.8 · topK 20 · minP 0 · presencePenalty 1.5
- Config hash: `97d84a61b5e2` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `7221ba3`
- Samples per item: 1; submitters: local
- Executed: 2026-10-23T06:50:47.747Z – 2026-10-23T07:01:46.182Z

## Score
- Pass rate: 37.3% ± 7.8 (63/169 items); core 43.9%, stretch 31.0%
- Rank 90 of 110, tier 7 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 64, loop 10, no_answer 3

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 45752 total, 271 per item
- Wall time: 661 s total, 3.9 s per item
- Generation speed: 248.7 tok/s
- Peak memory: 2.9 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 6/12 | 50.0% ± 33.2 | 984 | 5 | 206.1 | 2.8 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 596 | 3 | 189.3 | 2.8 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 11/35 | 31.4% ± 21.5 | 2046 | 57 | 184.6 | 2.9 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 5/26 | 19.2% ± 16.2 | 793 | 6 | 140.6 | 2.9 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 5/7 | 71.4% ± 45.1 | 39 | 1 | 41.8 | 2.9 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 5/26 | 19.2% ± 21.1 | 30259 | 311 | 263.7 | 2.9 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 5/10 | 50.0% ± 37.7 | 636 | 3 | 189.9 | 2.9 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 3/13 | 23.1% ± 26.5 | 276 | 2 | 114.6 | 2.9 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 581 | 2 | 243.9 | 2.9 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 11/26 | 42.3% ± 15.4 | 9542 | 270 | 268.6 | 2.9 |
