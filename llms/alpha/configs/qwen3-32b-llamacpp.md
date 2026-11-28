# qwen3-32b-llamacpp: Alpha challenge set

> Qwen3-32B on llamacpp Q6_K, Apple M5 Max 128GB. Pass rate 72.2% ± 7.9 (95% CI), rank 42 of 110, tier 4. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3-32B (`Qwen/Qwen3-32B-GGUF`)
- Runtime: llamacpp; versions: unknown
- Quant: Q6_K; temperature 0.7
- Config hash: `21dc2a4cde2b` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-21T06:40:06.803Z – 2026-06-28T04:57:09.642Z

## Score
- Pass rate: 72.2% ± 7.9 (122/169 items); core 73.2%, stretch 71.3%
- Rank 42 of 110, tier 4 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: partial; challenges 9/10, items 157/169
- Failures (sample lines): execution_error 23, wrong 2

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 124032 total, 790 per item
- Wall time: 15923 s total, 101.4 s per item
- Generation speed: 13.9 tok/s
- Peak memory: 40.3 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | interrupted | 0/12 | 0.0% ± 0.0 | — | — | — | — |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 9/10 | 90.0% ± 22.6 | 7153 | 509 | 14.1 | 33.6 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 33/35 | 94.3% ± 6.9 | 38555 | 3487 | 13.4 | 35.2 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 17/26 | 65.4% ± 19.6 | 11284 | 770 | 14.8 | 36.4 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 2153 | 144 | 15.1 | 36.8 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 12/26 | 46.2% ± 35.7 | 21114 | 5512 | 13.3 | 39.7 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 6750 | 481 | 14.1 | 38.5 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 9375 | 613 | 15.4 | 39.4 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 3781 | 242 | 15.7 | 39.6 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 17/26 | 65.4% ± 22.5 | 23867 | 4165 | 13.7 | 40.3 |
