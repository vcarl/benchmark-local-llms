# qwen3-coder-next-mlx: Alpha challenge set

> Qwen3-Coder-Next on mlx 4bit, Apple M5 Max 128GB. Pass rate 70.4% ± 8.0 (95% CI), rank 43 of 110, tier 4. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3-Coder-Next (`mlx-community/Qwen3-Coder-Next-4bit`)
- Runtime: mlx; versions: mlx-lm 0.31.3, unknown
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx · t0.7 · topP default · topK default
- Config hash: `ce2a58e9e575` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `2212237`, `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-24T02:50:27.327Z – 2026-11-17T10:32:36.553Z

## Score
- Pass rate: 70.4% ± 8.0 (119/169 items); core 80.5%, stretch 60.9%
- Rank 43 of 110, tier 4 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 35, length_cutoff 2

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 83195 total, 492 per item
- Wall time: 906 s total, 5.4 s per item
- Generation speed: 91.8 tok/s
- Peak memory: 42.2 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 1111 | 19 | 58.6 | 42.1 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 495 | 7 | 72.9 | 42.2 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 18/35 | 51.4% ± 24.5 | 2216 | 36 | 61.6 | 42.2 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 15/26 | 57.7% ± 20.4 | 504 | 10 | 53.0 | 42.2 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 36 | 1 | 24.8 | 42.2 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 14/26 | 53.8% ± 13.3 | 36646 | 386 | 95.0 | 42.2 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 393 | 6 | 67.5 | 42.2 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 10/13 | 76.9% ± 26.5 | 622 | 9 | 72.7 | 42.2 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 506 | 6 | 86.3 | 42.2 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 21/26 | 80.8% ± 16.2 | 40666 | 427 | 95.2 | 42.2 |
