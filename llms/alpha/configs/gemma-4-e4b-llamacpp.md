# gemma-4-e4b-llamacpp: Alpha challenge set

> gemma-4-E4B-it on llamacpp Q8_0, Apple M5 Max 128GB. Pass rate 77.5% ± 8.4 (95% CI), rank 30 of 110, tier 4. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: gemma-4-E4B-it (`unsloth/gemma-4-E4B-it-GGUF`)
- Runtime: llamacpp; versions: unknown
- Quant: Q8_0; temperature 0.7
- Config hash: `4abcf5db8e40` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-25T16:41:06.457Z – 2026-06-30T08:59:12.632Z

## Score
- Pass rate: 77.5% ± 8.4 (131/169 items); core 80.5%, stretch 74.7%
- Rank 30 of 110, tier 4 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 15, no_answer 7

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 110104 total, 652 per item
- Wall time: 2090 s total, 12.4 s per item
- Generation speed: 53.2 tok/s
- Peak memory: 10.4 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 11/12 | 91.7% ± 18.3 | 1215 | 20 | 66.2 | 8.9 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 9/10 | 90.0% ± 22.6 | 1883 | 29 | 67.5 | 9.0 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 33/35 | 94.3% ± 12.0 | 25292 | 426 | 59.9 | 9.3 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 12/26 | 46.2% ± 20.5 | 9397 | 153 | 62.5 | 9.6 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 43 | 1 | 78.0 | 9.6 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 16/26 | 61.5% ± 34.9 | 33296 | 575 | 58.2 | 9.9 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 2839 | 267 | 10.7 | 10.1 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 3673 | 57 | 65.8 | 10.3 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 2275 | 37 | 62.2 | 10.3 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 16/26 | 61.5% ± 35.2 | 30191 | 524 | 58.0 | 10.4 |
