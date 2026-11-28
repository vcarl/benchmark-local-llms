# deepseek-coder-v2-lite-llamacpp: Alpha challenge set

> DeepSeek-Coder-V2-Lite-Instruct on llamacpp Q8_0, Apple M5 Max 128GB. Pass rate 55.0% ± 8.3 (95% CI), rank 73 of 110, tier 6. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: DeepSeek-Coder-V2-Lite-Instruct (`bartowski/DeepSeek-Coder-V2-Lite-Instruct-GGUF`)
- Runtime: llamacpp; versions: unknown
- Quant: Q8_0; temperature 0.7
- Config hash: `1f5c01369452` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-23T21:40:33.121Z – 2026-07-02T02:28:24.047Z

## Score
- Pass rate: 55.0% ± 8.3 (93/169 items); core 63.4%, stretch 47.1%
- Rank 73 of 110, tier 6 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 52, no_answer 3

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 47885 total, 283 per item
- Wall time: 465 s total, 2.8 s per item
- Generation speed: 105.8 tok/s
- Peak memory: 44.0 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 1220 | 10 | 132.7 | 37.8 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 6/10 | 60.0% ± 36.9 | 551 | 5 | 134.0 | 37.8 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 19/35 | 54.3% ± 23.0 | 10777 | 106 | 104.7 | 39.0 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 10/26 | 38.5% ± 20.0 | 1202 | 10 | 134.2 | 38.4 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 48 | 1 | 151.5 | 38.4 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 9/26 | 34.6% ± 23.7 | 15956 | 158 | 102.3 | 41.7 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 6/10 | 60.0% ± 36.9 | 1405 | 11 | 131.0 | 39.0 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 7/13 | 53.8% ± 31.4 | 1485 | 12 | 130.4 | 39.8 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 364 | 3 | 131.9 | 39.8 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 13/26 | 50.0% ± 24.8 | 14877 | 149 | 101.8 | 44.0 |
