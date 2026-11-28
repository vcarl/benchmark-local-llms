# qwen3.5-0.8b-mlx: Alpha challenge set

> Qwen3.5-0.8B on mlx 4bit, Apple M5 Max 128GB. Pass rate 3.0% ± 2.6 (95% CI), rank 110 of 110, tier 10. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3.5-0.8B (`mlx-community/Qwen3.5-0.8B-4bit`)
- Runtime: mlx; versions: unknown
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx · maxTokens 2048 · topP default · topK default · minP default · presencePenalty default
- Config hash: `29ef62abb1e7` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-21T00:54:58.358Z – 2026-08-27T01:20:46.712Z

## Score
- Pass rate: 3.0% ± 2.6 (5/169 items); core 4.9%, stretch 1.1%
- Rank 110 of 110, tier 10 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): no_answer 103, wrong 9

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 306329 total, 1813 per item
- Wall time: 679 s total, 4.0 s per item
- Generation speed: 461.4 tok/s
- Peak memory: 1.0 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 0/12 | 0.0% ± 0.0 | 21037 | 44 | 478.8 | 1.0 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 0/10 | 0.0% ± 0.0 | 20480 | 43 | 474.6 | 1.0 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 1/35 | 2.9% ± 5.8 | 71208 | 151 | 470.7 | 1.0 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 0/26 | 0.0% ± 0.0 | 47820 | 104 | 460.9 | 1.0 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 3/7 | 42.9% ± 49.4 | 8722 | 20 | 441.6 | 0.8 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 0/26 | 0.0% ± 0.0 | 53248 | 112 | 476.2 | 1.0 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 0/10 | 0.0% ± 0.0 | 16388 | 35 | 464.2 | 1.0 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 1/13 | 7.7% ± 16.8 | 12123 | 27 | 443.5 | 1.0 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 0/4 | 0.0% | 2055 | 27 | 169.9 | 0.8 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 0/26 | 0.0% ± 0.0 | 53248 | 115 | 461.0 | 1.0 |
