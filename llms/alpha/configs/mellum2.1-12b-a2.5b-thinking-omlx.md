# mellum2.1-12b-a2.5b-thinking-omlx: Alpha challenge set

> Mellum2.1-12B-A2.5B-Thinking on omlx mxfp4, Apple M5 Max 128GB. Pass rate 88.2% ± 5.8 (95% CI), rank 17 of 110, tier 2. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Mellum2.1-12B-A2.5B-Thinking (`randmaru/Mellum2.1-12B-A2.5B-Thinking-mlx-mxfp4`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: mxfp4; temperature 0.6
- Config hash: `36ccdbc20900` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `94de7a9`
- Samples per item: 1; submitters: local
- Executed: 2026-10-28T14:25:02.406Z – 2026-10-28T15:00:32.585Z

## Score
- Pass rate: 88.2% ± 5.8 (149/169 items); core 84.1%, stretch 92.0%
- Rank 17 of 110, tier 2 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 5, loop 2, thinking_truncated 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 330150 total, 1954 per item
- Wall time: 2123 s total, 12.6 s per item
- Generation speed: 176.7 tok/s
- Peak memory: 7.2 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 11/12 | 91.7% ± 18.3 | 5916 | 32 | 185.8 | 6.7 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 7407 | 40 | 186.4 | 6.8 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 33/35 | 94.3% ± 12.0 | 42076 | 227 | 185.6 | 6.9 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 15/26 | 57.7% ± 20.4 | 23139 | 123 | 187.5 | 7.1 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 6/7 | 85.7% ± 35.0 | 656 | 4 | 159.3 | 7.1 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 22/26 | 84.6% ± 27.7 | 142721 | 1078 | 173.5 | 7.1 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 2314 | 13 | 177.9 | 7.2 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 1792 | 11 | 170.4 | 7.2 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 1184 | 7 | 180.7 | 7.2 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 25/26 | 96.2% ± 8.9 | 102945 | 590 | 174.6 | 7.2 |
