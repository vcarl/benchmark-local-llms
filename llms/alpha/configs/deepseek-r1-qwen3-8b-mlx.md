# deepseek-r1-qwen3-8b-mlx: Alpha challenge set

> DeepSeek-R1-0528-Qwen3-8B on mlx 4bit, Apple M5 Max 128GB. Pass rate 58.6% ± 9.4 (95% CI), rank 69 of 110, tier 6. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: DeepSeek-R1-0528-Qwen3-8B (`mlx-community/DeepSeek-R1-0528-Qwen3-8B-4bit`)
- Runtime: mlx; versions: unknown
- Quant: 4bit; temperature 0.6
- Variant (what sets it apart from the model's other rows): runtime mlx · maxTokens 8192
- Config hash: `5f1753a7fb23` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-20T22:50:29.702Z – 2026-06-28T01:44:58.027Z

## Score
- Pass rate: 58.6% ± 9.4 (99/169 items); core 72.0%, stretch 46.0%
- Rank 69 of 110, tier 6 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): no_answer 44, wrong 4

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 624002 total, 3692 per item
- Wall time: 7932 s total, 46.9 s per item
- Generation speed: 78.7 tok/s
- Peak memory: 4.7 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 10/12 | 83.3% ± 24.7 | 18532 | 210 | 88.4 | 4.7 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 7/10 | 70.0% ± 34.6 | 5209 | 56 | 93.0 | 4.7 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 26/35 | 74.3% ± 15.3 | 155354 | 1949 | 79.7 | 4.7 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 9/26 | 34.6% ± 19.6 | 43229 | 493 | 87.8 | 4.7 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 5061 | 58 | 86.8 | 4.7 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 3/26 | 11.5% ± 19.0 | 199918 | 2631 | 76.0 | 4.7 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 9/10 | 90.0% ± 22.6 | 24638 | 292 | 84.5 | 4.7 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 21115 | 239 | 88.2 | 4.7 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 4428 | 46 | 95.5 | 4.7 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 11/26 | 42.3% ± 24.2 | 146518 | 1958 | 74.8 | 4.7 |
