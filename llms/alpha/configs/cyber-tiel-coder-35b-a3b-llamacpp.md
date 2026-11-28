# cyber-tiel-coder-35b-a3b-llamacpp: Alpha challenge set

> Cyber-Tiel-Coder-35B-A3B on llamacpp UD-Q8_K_XL, Apple M5 Max 128GB. Pass rate 92.3% ± 4.0 (95% CI), rank 9 of 110, tier 1. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Cyber-Tiel-Coder-35B-A3B (`peculiar-ragdoll/Cyber-Tiel-Coder-35B-A3B-GGUF`)
- Runtime: llamacpp; versions: llama.cpp b11669 (620d2225c), llama.cpp b11829 (184f65360)
- Quant: UD-Q8_K_XL; temperature 0.6
- Config hash: `94cc0808a88c` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `4ba5dd0`, `7221ba3`
- Samples per item: 1–5; submitters: local
- Executed: 2026-10-23T06:14:08.279Z – 2026-11-17T05:35:55.630Z

## Score
- Pass rate: 92.3% ± 4.0 (156/169 items); core 89.0%, stretch 95.4%
- Rank 9 of 110, tier 1 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 4

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 160637 total, 951 per item
- Wall time: 1918 s total, 11.3 s per item
- Generation speed: 84.9 tok/s
- Peak memory: 45.8 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 11/12 | 91.7% ± 18.3 | 2396 | 28 | 91.4 | 37.4 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 2301 | 27 | 87.3 | 38.2 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 35/35 | 100.0% ± 0.0 | 9768 | 112 | 92.3 | 41.0 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 18/26 | 69.2% ± 19.0 | 9202 | 108 | 86.9 | 44.0 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 284 | 4 | 87.1 | 44.0 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 24/26 | 92.3% ± 11.5 | 111410 | 1342 | 83.3 | 45.8 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 717 | 9 | 88.1 | 45.8 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 772 | 10 | 88.1 | 45.8 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 418 | 5 | 87.3 | 45.8 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 24/26 | 92.3% ± 11.2 | 23369 | 272 | 87.8 | 45.8 |
