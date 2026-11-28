# nemotron-nano-8b-llamacpp: Alpha challenge set

> Llama-3.1-Nemotron-Nano-8B-v1 on llamacpp Q8_0, Apple M5 Max 128GB. Pass rate 30.8% ± 7.1 (95% CI), rank 95 of 110, tier 8. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Llama-3.1-Nemotron-Nano-8B-v1 (`bartowski/nvidia_Llama-3.1-Nemotron-Nano-8B-v1-GGUF`)
- Runtime: llamacpp; versions: llama.cpp b11669 (620d2225c), unknown
- Quant: Q8_0; temperature 0.6
- Variant (what sets it apart from the model's other rows): chatTemplate default
- Config hash: `3d7773627ea5` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `2212237`, `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-20T23:33:08.077Z – 2026-11-17T11:19:56.897Z

## Score
- Pass rate: 30.8% ± 7.1 (52/169 items); core 34.1%, stretch 27.6%
- Rank 95 of 110, tier 8 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: partial; challenges 9/10, items 159/169
- Failures (sample lines): wrong 73, no_answer 5, thinking_truncated 3, length_cutoff 2, loop 2

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 72541 total, 456 per item
- Wall time: 1853 s total, 11.7 s per item
- Generation speed: 45.0 tok/s
- Peak memory: 13.8 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 4156 | 78 | 54.1 | 8.7 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | interrupted | 0/10 | 0.0% ± 0.0 | — | — | — | — |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 11/35 | 31.4% ± 16.7 | 24424 | 713 | 43.5 | 10.4 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 4/26 | 15.4% ± 14.9 | 939 | 18 | 57.6 | 8.6 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 3/7 | 42.9% ± 49.4 | 40 | 1 | 73.7 | 8.6 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 4/26 | 15.4% ± 17.0 | 22992 | 602 | 44.3 | 12.1 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 2/10 | 20.0% ± 30.2 | 293 | 5 | 62.3 | 8.6 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 4/13 | 30.8% ± 29.0 | 502 | 10 | 56.4 | 8.6 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 3/4 | 75.0% | 1077 | 20 | 55.3 | 8.6 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 9/26 | 34.6% ± 25.5 | 18118 | 408 | 44.7 | 13.8 |
