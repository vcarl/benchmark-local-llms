# nemotron-nano-8b-llamacpp: Alpha challenge set

> Llama-3.1-Nemotron-Nano-8B-v1 on llamacpp Q8_0, Apple M5 Max 128GB. Pass rate 48.5% ± 7.7 (95% CI), rank 79 of 110, tier 6. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Llama-3.1-Nemotron-Nano-8B-v1 (`bartowski/nvidia_Llama-3.1-Nemotron-Nano-8B-v1-GGUF`)
- Runtime: llamacpp; versions: llama.cpp b12359 (b1b770d90)
- Quant: Q8_0; temperature 0.6
- Variant (what sets it apart from the model's other rows): chatTemplate nemotron-nano-8b-v1
- Config hash: `b1713775bfb0` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `2720d72`
- Samples per item: 1; submitters: local
- Executed: 2026-11-20T21:12:29.160Z – 2026-11-20T22:29:16.717Z

## Score
- Pass rate: 48.5% ± 7.7 (82/169 items); core 45.1%, stretch 51.7%
- Rank 79 of 110, tier 6 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 73, thinking_truncated 8, length_cutoff 4, loop 2

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 252501 total, 1494 per item
- Wall time: 4703 s total, 27.8 s per item
- Generation speed: 56.4 tok/s
- Peak memory: 27.0 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 10899 | 187 | 58.6 | 17.2 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 7/10 | 70.0% ± 34.6 | 1254 | 21 | 60.8 | 17.3 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 17/35 | 48.6% ± 20.3 | 82771 | 1536 | 57.4 | 22.9 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 3/26 | 11.5% ± 13.2 | 1213 | 147 | 61.2 | 24.0 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 3/7 | 42.9% ± 49.4 | 47 | 1 | 59.8 | 24.0 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 9/26 | 34.6% ± 21.9 | 78884 | 1429 | 55.3 | 26.3 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 4/10 | 40.0% ± 36.9 | 1073 | 19 | 59.5 | 26.3 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 5/13 | 38.5% ± 30.6 | 106 | 2 | 59.8 | 26.3 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 3/4 | 75.0% | 1092 | 19 | 58.1 | 26.5 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 19/26 | 73.1% ± 13.1 | 75162 | 1341 | 56.1 | 27.0 |
