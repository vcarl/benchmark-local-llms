# qwen3.5-2b-mlx: Alpha challenge set

> Qwen3.5-2B on mlx 4bit, Apple M5 Max 128GB. Pass rate 14.2% ± 5.9 (95% CI), rank 107 of 110, tier 9. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3.5-2B (`mlx-community/Qwen3.5-2B-4bit`)
- Runtime: mlx; versions: unknown
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx · maxTokens 2048 · topP default · topK default · minP default · presencePenalty default
- Config hash: `7bbac1710704` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-21T00:59:57.741Z – 2026-06-28T10:19:38.155Z

## Score
- Pass rate: 14.2% ± 5.9 (24/169 items); core 25.6%, stretch 3.4%
- Rank 107 of 110, tier 9 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): no_answer 98

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 314133 total, 1859 per item
- Wall time: 1105 s total, 6.5 s per item
- Generation speed: 284.2 tok/s
- Peak memory: 1.7 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 3/12 | 25.0% ± 28.7 | 19187 | 68 | 283.8 | 1.6 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 0/10 | 0.0% ± 0.0 | 20480 | 71 | 289.6 | 1.6 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 0/35 | 0.0% ± 0.0 | 71680 | 255 | 281.3 | 1.6 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 2/26 | 7.7% ± 11.0 | 47306 | 165 | 287.4 | 1.6 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 4/7 | 57.1% ± 49.4 | 8070 | 29 | 281.9 | 1.6 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 1/26 | 3.8% ± 9.0 | 52939 | 185 | 286.8 | 1.6 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 2/10 | 20.0% ± 30.2 | 19718 | 69 | 287.7 | 1.7 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 9/13 | 69.2% ± 29.0 | 16019 | 58 | 275.7 | 1.7 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 1/4 | 25.0% | 6405 | 22 | 284.7 | 1.6 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 2/26 | 7.7% ± 18.5 | 52329 | 185 | 282.2 | 1.6 |
