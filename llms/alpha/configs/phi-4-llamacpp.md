# phi-4-llamacpp: Alpha challenge set

> phi-4 on llamacpp Q8_0, Apple M5 Max 128GB. Pass rate 65.7% ± 7.9 (95% CI), rank 49 of 110, tier 5. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: phi-4 (`unsloth/phi-4-GGUF`)
- Runtime: llamacpp; versions: unknown
- Quant: Q8_0; temperature 0.7
- Config hash: `a952631c00f0` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-25T06:18:29.623Z – 2026-07-01T17:36:46.917Z

## Score
- Pass rate: 65.7% ± 7.9 (111/169 items); core 72.0%, stretch 59.8%
- Rank 49 of 110, tier 5 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 39, near_miss 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 33681 total, 199 per item
- Wall time: 1194 s total, 7.1 s per item
- Generation speed: 28.8 tok/s
- Peak memory: 19.5 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 944 | 30 | 32.8 | 16.2 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 7/10 | 70.0% ± 34.6 | 630 | 20 | 32.3 | 16.2 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 20/35 | 57.1% ± 23.5 | 5991 | 216 | 28.4 | 16.7 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 11/26 | 42.3% ± 20.4 | 830 | 27 | 33.2 | 16.6 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 53 | 2 | 38.9 | 16.6 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 12/26 | 46.2% ± 17.4 | 11870 | 428 | 28.1 | 18.0 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 518 | 17 | 32.2 | 16.8 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 9/13 | 69.2% ± 29.0 | 798 | 26 | 32.1 | 17.1 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 3/4 | 75.0% | 643 | 21 | 31.7 | 17.2 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 20/26 | 76.9% ± 19.3 | 11404 | 407 | 28.4 | 19.5 |
