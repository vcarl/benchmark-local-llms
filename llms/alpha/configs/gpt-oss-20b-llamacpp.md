# gpt-oss-20b-llamacpp: Alpha challenge set

> gpt-oss-20b on llamacpp Q8_0, Apple M5 Max 128GB. Pass rate 87.9% ± 6.1 (95% CI), rank 18 of 110, tier 2. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: gpt-oss-20b (`unsloth/gpt-oss-20b-GGUF`)
- Runtime: llamacpp; versions: llama.cpp b11669 (620d2225c), unknown
- Quant: Q8_0; temperature 0.6
- Config hash: `1d6952d3fa87` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `4ba5dd0`, `unknown`
- Samples per item: 1–5; submitters: local
- Executed: 2026-06-25T06:22:28.850Z – 2026-11-17T04:42:45.401Z

## Score
- Pass rate: 87.9% ± 6.1 (148.6/169 items); core 89.0%, stretch 86.9%
- Rank 18 of 110, tier 2 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): no_answer 7, wrong 7

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 130280 total, 771 per item
- Wall time: 1220 s total, 7.2 s per item
- Generation speed: 109.7 tok/s
- Peak memory: 15.3 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 3757 | 31 | 125.7 | 11.7 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 4493 | 38 | 120.6 | 11.8 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 33.6/35 | 96.0% ± 7.1 | 12663 | 105 | 127.9 | 15.0 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 18/26 | 69.2% ± 19.0 | 11074 | 94 | 120.4 | 12.4 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 442 | 4 | 131.2 | 12.4 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 20/26 | 76.9% ± 35.8 | 56130 | 541 | 104.8 | 15.1 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 9/10 | 90.0% ± 22.6 | 2474 | 21 | 124.1 | 15.1 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 1598 | 13 | 128.3 | 15.1 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 928 | 8 | 122.5 | 12.7 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 22/26 | 84.6% ± 17.7 | 36721 | 365 | 104.7 | 15.3 |
