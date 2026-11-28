# qwen3.8-flash-next-llamacpp: Alpha challenge set

> Qwen3.8-Flash-Next on llamacpp UD-IQ4_XS, Apple M5 Max 128GB. Pass rate 93.5% ± 4.0 (95% CI), rank 3 of 110, tier 1. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3.8-Flash-Next (`unsloth/Qwen3.8-Flash-Next-GGUF`)
- Runtime: llamacpp; versions: llama.cpp b11829 (184f65360)
- Quant: UD-IQ4_XS; temperature 1
- Config hash: `1f769422ef9f` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `94de7a9`
- Samples per item: 1; submitters: local
- Executed: 2026-10-28T16:09:51.153Z – 2026-10-28T17:45:13.907Z

## Score
- Pass rate: 93.5% ± 4.0 (158/169 items); core 91.5%, stretch 95.4%
- Rank 3 of 110, tier 1 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 3, thinking_truncated 2

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 234892 total, 1390 per item
- Wall time: 5728 s total, 33.9 s per item
- Generation speed: 41.4 tok/s
- Peak memory: 77.3 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 4885 | 116 | 43.6 | 62.9 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 9/10 | 90.0% ± 22.6 | 3271 | 78 | 43.2 | 65.3 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 35/35 | 100.0% ± 0.0 | 9608 | 235 | 42.6 | 70.0 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 21/26 | 80.8% ± 16.2 | 46602 | 1131 | 41.4 | 73.2 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 541 | 14 | 44.4 | 73.3 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 24/26 | 92.3% ± 18.8 | 139662 | 3419 | 41.0 | 77.3 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 9/10 | 90.0% ± 22.6 | 931 | 24 | 44.4 | 77.3 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 1192 | 30 | 44.0 | 77.3 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 414 | 10 | 43.8 | 77.3 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 24/26 | 92.3% ± 11.2 | 27786 | 671 | 41.9 | 77.3 |
