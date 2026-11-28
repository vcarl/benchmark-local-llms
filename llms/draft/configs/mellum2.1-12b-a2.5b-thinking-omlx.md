# mellum2.1-12b-a2.5b-thinking-omlx: Pre-release (draft)

> Mellum2.1-12B-A2.5B-Thinking on omlx mxfp4, Apple M5 Max 128GB. Pass rate 90.5% ± 3.2 (95% CI), rank 18 of 79, tier 4. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Mellum2.1-12B-A2.5B-Thinking (`randmaru/Mellum2.1-12B-A2.5B-Thinking-mlx-mxfp4`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: mxfp4; temperature 0.6
- Config hash: `449ef26cc3638fd71ae5261652d93df33d3115f3c91feb216948772641ee6d21` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `23246a31fcdbe3c2858108764c1789d2b4393254`
- Samples per item: 1; submitters: local
- Executed: 2026-11-24T03:16:58.884Z – 2026-11-24T04:59:10.989Z

## Score
- Pass rate: 90.5% ± 3.2 (598/661 items); core 92.2%, stretch 83.5%
- Rank 18 of 79, tier 4 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 56, loop 4, no_answer 2, thinking_truncated 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 1006654 total, 1523 per item
- Wall time: 6155 s total, 9.3 s per item
- Generation speed: 182.9 tok/s
- Peak memory: 7.2 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 9/13 | 69.2% | 79845 | 458 | 175.6 | 7.0 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 3078 | 17 | 208.9 | 7.0 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 11/12 | 91.7% ± 18.3 | 4857 | 26 | 202.6 | 7.0 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 16267 | 88 | 190.7 | 7.0 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 7517 | 40 | 195.7 | 7.0 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 12/12 | 100.0% | 71305 | 394 | 182.4 | 7.0 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 33/35 | 94.3% ± 12.0 | 37759 | 204 | 192.2 | 7.0 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 14/26 | 53.8% ± 20.5 | 24693 | 132 | 194.2 | 7.0 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 11/12 | 91.7% | 9016 | 49 | 194.0 | 7.0 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 6/7 | 85.7% ± 35.0 | 780 | 5 | 235.9 | 7.0 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 22/26 | 84.6% ± 27.7 | 129412 | 883 | 181.3 | 7.0 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 32/36 | 88.9% | 61099 | 359 | 188.4 | 7.0 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 10/12 | 83.3% | 20826 | 112 | 190.4 | 7.0 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 2114 | 12 | 213.8 | 7.0 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 4/8 | 50.0% | 47829 | 575 | 150.6 | 7.0 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 2819 | 16 | 211.8 | 7.0 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 7/9 | 77.8% | 41593 | 229 | 182.9 | 7.0 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 1101 | 6 | 207.7 | 7.0 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 3237 | 19 | 197.7 | 7.0 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 19/29 | 65.5% ± 53.2 | 194851 | 1086 | 180.8 | 7.1 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 302/316 | 95.6% ± 2.6 | 152319 | 924 | 191.4 | 7.1 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 10/12 | 83.3% | 19783 | 109 | 187.5 | 7.1 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 26/26 | 100.0% ± 0.0 | 74554 | 412 | 183.7 | 7.2 |
