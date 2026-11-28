# ling-3.0-flash-llamacpp: Alpha challenge set

> Ling-3.0-flash on llamacpp Q4_K_M, Apple M5 Max 128GB. Pass rate 93.5% ± 4.6 (95% CI), rank 6 of 110, tier 1. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Ling-3.0-flash (`inclusionAI/Ling-3.0-flash-GGUF`)
- Runtime: llamacpp; versions: llama.cpp b11829 (184f65360)
- Quant: Q4_K_M; temperature 0.6
- Config hash: `b4270931b3d8` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `9a85704`
- Samples per item: 1; submitters: local
- Executed: 2026-10-29T00:45:42.264Z – 2026-10-29T02:20:45.014Z

## Score
- Pass rate: 93.5% ± 4.6 (158/169 items); core 92.7%, stretch 94.3%
- Rank 6 of 110, tier 1 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): thinking_truncated 3, wrong 2

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 286601 total, 1696 per item
- Wall time: 5818 s total, 34.4 s per item
- Generation speed: 50.7 tok/s
- Peak memory: 79.0 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 3429 | 49 | 73.4 | 71.9 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 9/10 | 90.0% ± 22.6 | 7421 | 113 | 66.6 | 75.2 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 34/35 | 97.1% ± 6.0 | 14477 | 230 | 64.9 | 78.0 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 21/26 | 80.8% ± 16.2 | 7595 | 247 | 66.3 | 78.9 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 502 | 8 | 70.7 | 78.9 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 23/26 | 88.5% ± 28.2 | 194738 | 4156 | 46.9 | 78.9 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 1148 | 19 | 67.3 | 78.9 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 1125 | 19 | 67.7 | 78.9 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 731 | 11 | 66.5 | 78.9 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 25/26 | 96.2% ± 8.9 | 55435 | 965 | 57.8 | 79.0 |
