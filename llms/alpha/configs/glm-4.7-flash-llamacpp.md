# glm-4.7-flash-llamacpp: Alpha challenge set

> GLM-4.7-Flash on llamacpp Q8_0, Apple M5 Max 128GB. Pass rate 83.4% ± 6.4 (95% CI), rank 22 of 110, tier 3. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: GLM-4.7-Flash (`unsloth/GLM-4.7-Flash-GGUF`)
- Runtime: llamacpp; versions: unknown
- Quant: Q8_0; temperature 0.6
- Config hash: `17b6c3a69613` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-25T06:28:17.902Z – 2026-07-01T21:03:54.971Z

## Score
- Pass rate: 83.4% ± 6.4 (141/169 items); core 82.9%, stretch 83.9%
- Rank 22 of 110, tier 3 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): no_answer 10, wrong 5

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 288839 total, 1709 per item
- Wall time: 6181 s total, 36.6 s per item
- Generation speed: 46.9 tok/s
- Peak memory: 39.8 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 11/12 | 91.7% ± 18.3 | 15579 | 265 | 59.2 | 27.0 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 7/10 | 70.0% ± 34.6 | 23367 | 490 | 47.7 | 27.5 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 34/35 | 97.1% ± 6.0 | 41389 | 791 | 52.6 | 35.7 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 17/26 | 65.4% ± 19.6 | 17295 | 297 | 58.7 | 28.3 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 1566 | 26 | 62.5 | 28.4 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 18/26 | 69.2% ± 30.1 | 101582 | 2508 | 40.6 | 37.8 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 3918 | 66 | 60.0 | 29.0 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 12/13 | 92.3% ± 16.8 | 13695 | 276 | 49.8 | 29.5 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 1733 | 29 | 60.6 | 29.5 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 21/26 | 80.8% ± 21.3 | 68715 | 1433 | 48.1 | 39.8 |
