# gpt-oss-20b-omlx: Alpha challenge set

> gpt-oss-20b on omlx 4bit, Apple M5 Max 128GB. Pass rate 80.5% ± 7.7 (95% CI), rank 28 of 110, tier 3. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: gpt-oss-20b (`mlx-community/gpt-oss-20b-MXFP4-Q4`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 1
- Variant (what sets it apart from the model's other rows): runtime omlx · t1 · maxTokens 32768
- Config hash: `e99d89d7263b` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `7221ba3`
- Samples per item: 1; submitters: local
- Executed: 2026-10-23T14:40:54.920Z – 2026-10-23T15:19:22.984Z

## Score
- Pass rate: 80.5% ± 7.7 (136/169 items); core 80.5%, stretch 80.5%
- Rank 28 of 110, tier 3 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 18, no_answer 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 313045 total, 1852 per item
- Wall time: 2437 s total, 14.4 s per item
- Generation speed: 128.5 tok/s
- Peak memory: 11.5 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 11/12 | 91.7% ± 18.3 | 8786 | 63 | 140.0 | 11.5 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 13351 | 96 | 138.4 | 11.5 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 31/35 | 88.6% ± 18.2 | 31194 | 230 | 135.4 | 11.5 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 13/26 | 50.0% ± 20.6 | 15646 | 118 | 133.1 | 11.5 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 6/7 | 85.7% ± 35.0 | 3771 | 29 | 128.8 | 11.5 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 18/26 | 69.2% ± 39.5 | 157979 | 1264 | 125.0 | 11.5 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 9/10 | 90.0% ± 22.6 | 4134 | 31 | 134.4 | 11.5 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 3758 | 29 | 130.1 | 11.5 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 1449 | 11 | 130.4 | 11.5 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 21/26 | 80.8% ± 21.3 | 72977 | 566 | 129.0 | 11.5 |
