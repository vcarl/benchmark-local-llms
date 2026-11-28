# lfm2.5-1.2b-instruct-4bit-mlx: Pre-release (draft)

> LFM2.5-1.2B-Instruct on mlx 4bit, Apple M5 Max 128GB. Pass rate 30.1% ± 5.7 (95% CI), rank 71 of 79, tier 14. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: LFM2.5-1.2B-Instruct (`LiquidAI/LFM2.5-1.2B-Instruct-MLX-4bit`)
- Runtime: mlx; versions: mlx-lm 0.31.3
- Quant: 4bit; temperature 0.1
- Config hash: `8917ffad9505d4ebca4633de08f4fbf548eafa4aabe2d909c6e57abf7779749f` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `e77223a`
- Samples per item: 1; submitters: local
- Executed: 2026-11-20T22:32:11.055Z – 2026-11-20T22:40:21.124Z

## Score
- Pass rate: 30.1% ± 5.7 (199/661 items); core 33.1%, stretch 18.0%
- Rank 71 of 79, tier 14 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 394, near_miss 49, length_cutoff 12, no_answer 7

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 98153 total, 148 per item
- Wall time: 231 s total, 0.3 s per item
- Generation speed: 530.1 tok/s
- Peak memory: 0.8 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 0/13 | 0.0% | 2231 | 5 | 506.2 | 0.8 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 6/12 | 50.0% | 636 | 1 | 576.4 | 0.8 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 9/12 | 75.0% ± 28.7 | 941 | 2 | 575.3 | 0.8 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 6/12 | 50.0% | 2894 | 6 | 560.2 | 0.8 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 7/10 | 70.0% ± 34.6 | 374 | 1 | 586.4 | 0.8 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 0/12 | 0.0% | 18890 | 35 | 543.3 | 0.8 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 6/35 | 17.1% ± 15.9 | 3545 | 8 | 513.3 | 0.8 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 3/26 | 11.5% ± 13.2 | 530 | 2 | 600.6 | 0.8 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 0/12 | 0.0% | 1249 | 3 | 566.7 | 0.8 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 6/7 | 85.7% ± 35.0 | 96 | 0 | 462.8 | 0.8 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 7/26 | 26.9% ± 22.7 | 16419 | 31 | 543.4 | 0.8 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 0/36 | 0.0% | 2816 | 7 | 560.5 | 0.8 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 8/12 | 66.7% | 977 | 2 | 573.4 | 0.8 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 4/10 | 40.0% ± 36.9 | 656 | 1 | 500.8 | 0.8 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 3/8 | 37.5% | 34 | 10 | 16.4 | 0.8 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 4/13 | 30.8% ± 29.0 | 502 | 3 | 177.3 | 0.8 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 0/9 | 0.0% | 227 | 1 | 592.6 | 0.8 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 3/4 | 75.0% | 472 | 1 | 569.6 | 0.8 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 4/9 | 44.4% | 382 | 1 | 572.1 | 0.8 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 0/29 | 0.0% ± 0.0 | 195 | 1 | 336.2 | 0.8 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 112/316 | 35.4% ± 8.7 | 27729 | 81 | 535.0 | 0.8 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 1/12 | 8.3% | 597 | 2 | 571.6 | 0.8 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 10/26 | 38.5% ± 24.2 | 15761 | 30 | 548.2 | 0.8 |
