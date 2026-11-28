# flint-llamacpp: Alpha challenge set

> flint on llamacpp Q8_0, Apple M5 Max 128GB. Pass rate 93.5% ± 4.2 (95% CI), rank 5 of 110, tier 1. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: flint (`unsloth/flint-GGUF`)
- Runtime: llamacpp; versions: llama.cpp b11829 (184f65360)
- Quant: Q8_0; temperature 1
- Config hash: `50de7f6737b8` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `7221ba3`
- Samples per item: 1; submitters: local
- Executed: 2026-10-23T05:19:57.902Z – 2026-10-23T06:11:54.449Z

## Score
- Pass rate: 93.5% ± 4.2 (158/169 items); core 93.9%, stretch 93.1%
- Rank 5 of 110, tier 1 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 7

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 260421 total, 1541 per item
- Wall time: 3242 s total, 19.2 s per item
- Generation speed: 80.9 tok/s
- Peak memory: 47.1 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 4400 | 50 | 91.1 | 40.6 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 3897 | 44 | 91.4 | 40.9 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 33/35 | 94.3% ± 12.0 | 32100 | 393 | 82.7 | 42.1 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 22/26 | 84.6% ± 14.9 | 40754 | 499 | 82.1 | 43.1 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 6/7 | 85.7% ± 35.0 | 638 | 8 | 84.1 | 43.1 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 23/26 | 88.5% ± 18.4 | 128472 | 1630 | 79.0 | 45.5 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 2208 | 28 | 82.8 | 45.8 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 1209 | 16 | 82.8 | 45.9 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 830 | 10 | 83.5 | 45.9 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 25/26 | 96.2% ± 8.9 | 45913 | 564 | 82.0 | 47.1 |
