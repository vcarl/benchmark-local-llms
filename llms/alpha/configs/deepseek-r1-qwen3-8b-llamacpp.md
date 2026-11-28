# deepseek-r1-qwen3-8b-llamacpp: Alpha challenge set

> DeepSeek-R1-0528-Qwen3-8B on llamacpp Q8_0, Apple M5 Max 128GB. Pass rate 59.8% ± 10.2 (95% CI), rank 66 of 110, tier 6. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: DeepSeek-R1-0528-Qwen3-8B (`unsloth/DeepSeek-R1-0528-Qwen3-8B-GGUF`)
- Runtime: llamacpp; versions: unknown
- Quant: Q8_0; temperature 0.6
- Config hash: `2e182f778254` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-24T17:58:21.943Z – 2026-06-29T00:56:22.221Z

## Score
- Pass rate: 59.8% ± 10.2 (101/169 items); core 69.5%, stretch 50.6%
- Rank 66 of 110, tier 6 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): no_answer 32, execution_error 12, wrong 2

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 512653 total, 3033 per item
- Wall time: 20380 s total, 120.6 s per item
- Generation speed: 42.6 tok/s
- Peak memory: 28.0 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 11/12 | 91.7% ± 18.3 | 20215 | 430 | 47.2 | 18.9 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 7/10 | 70.0% ± 34.6 | 5849 | 119 | 49.4 | 19.3 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 30/35 | 85.7% ± 13.7 | 121628 | 2763 | 44.1 | 24.4 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 9/26 | 34.6% ± 19.6 | 55837 | 1292 | 43.3 | 25.0 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 3541 | 70 | 50.6 | 25.2 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 2/26 | 7.7% ± 18.8 | 180714 | 6258 | 41.4 | 27.7 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 6/10 | 60.0% ± 36.9 | 9726 | 3949 | 46.2 | 27.3 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 18822 | 400 | 47.2 | 27.7 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 2360 | 55 | 43.4 | 27.7 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 12/26 | 46.2% ± 29.1 | 93961 | 5046 | 40.2 | 28.0 |
