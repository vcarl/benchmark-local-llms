# phi-4-mlx-8bit: Pre-release (draft)

> phi-4 on mlx 8bit, Apple M5 Max 128GB. Pass rate 73.5% ± 6.1 (95% CI), rank 41 of 79, tier 8. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: phi-4 (`mlx-community/phi-4-8bit`)
- Runtime: mlx; versions: mlx-lm 0.31.3
- Quant: 8bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx · t0.7
- Config hash: `d64665749bbe999a4defc3daf7ffa440d4066cf01276d080dc024998cc2f60b7` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `37f9f14`, `bfb5743`
- Samples per item: 1; submitters: local
- Executed: 2026-06-24T08:23:13.713Z – 2026-11-20T01:28:16.689Z

## Score
- Pass rate: 73.5% ± 6.1 (486/661 items); core 81.3%, stretch 42.9%
- Rank 41 of 79, tier 8 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 163, near_miss 6, no_answer 6

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 93071 total, 141 per item
- Wall time: 3425 s total, 5.2 s per item
- Generation speed: 29.6 tok/s
- Peak memory: 14.8 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 4/13 | 30.8% | 1508 | 57 | 26.5 | 14.8 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 627 | 21 | 35.6 | 14.8 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 1182 | 38 | 30.7 | 14.8 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 11/12 | 91.7% | 942 | 30 | 35.2 | 14.8 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 590 | 20 | 30.0 | 14.8 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 7/12 | 58.3% | 4934 | 144 | 35.0 | 14.8 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 16/35 | 45.7% ± 30.2 | 5170 | 177 | 29.4 | 14.8 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 8/26 | 30.8% ± 19.0 | 824 | 29 | 28.0 | 14.8 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 11/12 | 91.7% | 1141 | 46 | 25.0 | 14.8 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 49 | 3 | 20.9 | 14.8 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 12/26 | 46.2% ± 17.4 | 12278 | 419 | 29.4 | 14.8 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 21/36 | 58.3% | 6354 | 196 | 33.9 | 14.8 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 6/12 | 50.0% | 2374 | 89 | 26.7 | 14.8 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 629 | 20 | 33.4 | 14.8 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 5/8 | 62.5% | 149 | 175 | 0.9 | 14.8 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 9/13 | 69.2% ± 29.0 | 785 | 25 | 33.5 | 14.8 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 8/9 | 88.9% | 691 | 29 | 23.7 | 14.8 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 3/4 | 75.0% | 591 | 18 | 32.3 | 14.8 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 408 | 20 | 20.5 | 14.8 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 2/29 | 6.9% ± 11.5 | 6830 | 206 | 33.9 | 14.8 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 276/316 | 87.3% ± 6.2 | 27206 | 1039 | 34.7 | 14.8 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 6/12 | 50.0% | 6208 | 237 | 26.2 | 14.8 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 21/26 | 80.8% ± 21.3 | 11601 | 388 | 30.0 | 14.8 |
