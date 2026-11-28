# devstral-small-2-24b-mlx: Pre-release (draft)

> Devstral-Small-2-24B-Instruct-2512 on mlx 4bit, Apple M5 Max 128GB. Pass rate 74.4% ± 6.0 (95% CI), rank 38 of 79, tier 7. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Devstral-Small-2-24B-Instruct-2512 (`mlx-community/Devstral-Small-2-24B-Instruct-2512-4bit`)
- Runtime: mlx; versions: mlx-lm 0.31.3
- Quant: 4bit; temperature 0.15
- Variant (what sets it apart from the model's other rows): runtime mlx · t0.15 · weights 005c35b95c4f
- Config hash: `4fbadf019052f50c5c1f6be43eba20bda6a3cf15663b399f8356189fdd193e3d` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: `005c35b95c4f` (prefix)
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `1ac5f98`
- Samples per item: 1; submitters: local
- Executed: 2026-11-20T15:52:11.604Z – 2026-11-20T16:44:37.198Z

## Score
- Pass rate: 74.4% ± 6.0 (492/661 items); core 82.0%, stretch 44.4%
- Rank 38 of 79, tier 7 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 160, near_miss 7, length_cutoff 1, no_answer 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 87859 total, 133 per item
- Wall time: 2941 s total, 4.4 s per item
- Generation speed: 36.1 tok/s
- Peak memory: 13.8 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 6/13 | 46.2% | 2468 | 70 | 37.4 | 13.8 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 11/12 | 91.7% | 403 | 13 | 39.1 | 13.8 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 1002 | 29 | 38.4 | 13.8 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 913 | 28 | 38.2 | 13.8 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 425 | 13 | 38.9 | 13.8 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 5/12 | 41.7% | 5270 | 142 | 37.8 | 13.8 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 16/35 | 45.7% ± 26.1 | 2531 | 73 | 37.7 | 13.8 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 15/26 | 57.7% ± 20.4 | 668 | 22 | 39.7 | 13.8 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 1262 | 37 | 38.0 | 13.8 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 43 | 2 | 48.2 | 13.8 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 11/26 | 42.3% ± 32.0 | 23044 | 635 | 36.6 | 13.8 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 18/36 | 50.0% | 2213 | 69 | 38.1 | 13.8 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 8/12 | 66.7% | 1751 | 48 | 38.1 | 13.8 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 351 | 11 | 34.5 | 13.8 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 6/8 | 75.0% | 40 | 177 | 0.9 | 13.8 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 8/13 | 61.5% ± 30.6 | 518 | 18 | 39.1 | 13.8 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 8/9 | 88.9% | 590 | 18 | 38.4 | 13.8 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 467 | 13 | 38.2 | 13.8 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 378 | 15 | 38.5 | 13.8 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 5/29 | 17.2% ± 29.7 | 4070 | 115 | 37.8 | 13.8 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 281/316 | 88.9% ± 5.6 | 19716 | 852 | 34.9 | 13.8 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 2/12 | 16.7% | 775 | 27 | 38.1 | 13.8 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 18/26 | 69.2% ± 29.5 | 18961 | 513 | 37.3 | 13.8 |
