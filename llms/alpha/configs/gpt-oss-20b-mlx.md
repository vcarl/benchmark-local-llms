# gpt-oss-20b-mlx: Alpha challenge set

> gpt-oss-20b on mlx 4bit, Apple M5 Max 128GB. Pass rate 67.5% ± 8.9 (95% CI), rank 47 of 110, tier 5. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: gpt-oss-20b (`mlx-community/gpt-oss-20b-MXFP4-Q4`)
- Runtime: mlx; versions: unknown
- Quant: 4bit; temperature 0.6
- Variant (what sets it apart from the model's other rows): runtime mlx · t0.6 · maxTokens 8192
- Config hash: `1e10efb1e707` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-23T03:49:44.527Z – 2026-07-01T19:54:49.562Z

## Score
- Pass rate: 67.5% ± 8.9 (114/169 items); core 79.3%, stretch 56.3%
- Rank 47 of 110, tier 5 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 39, no_answer 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 549034 total, 3249 per item
- Wall time: 6578 s total, 38.9 s per item
- Generation speed: 83.5 tok/s
- Peak memory: 11.1 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 24095 | 209 | 115.1 | 11.0 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 9/10 | 90.0% ± 22.6 | 26416 | 228 | 115.7 | 11.0 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 23/35 | 65.7% ± 22.2 | 128786 | 1549 | 83.2 | 11.1 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 12/26 | 46.2% ± 20.5 | 18633 | 158 | 118.3 | 11.0 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 2128 | 18 | 117.1 | 11.0 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 13/26 | 50.0% ± 35.2 | 182359 | 2303 | 79.2 | 11.1 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 9/10 | 90.0% ± 22.6 | 8306 | 71 | 116.9 | 11.0 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 12/13 | 92.3% ± 16.8 | 2076 | 18 | 115.6 | 11.0 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 1304 | 11 | 120.4 | 11.0 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 13/26 | 50.0% ± 31.5 | 154931 | 2013 | 77.0 | 11.1 |
