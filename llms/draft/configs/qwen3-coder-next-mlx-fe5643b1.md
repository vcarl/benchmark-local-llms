# qwen3-coder-next-mlx: Pre-release (draft)

> Qwen3-Coder-Next on mlx 4bit, Apple M5 Max 128GB. Pass rate 76.2% ± 6.0 (95% CI), rank 33 of 79, tier 7. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Qwen3-Coder-Next (`mlx-community/Qwen3-Coder-Next-4bit`)
- Runtime: mlx; versions: mlx-lm 0.31.3
- Quant: 4bit; temperature 1
- Variant (what sets it apart from the model's other rows): runtime mlx · t1 · topP 0.95 · topK 40 · weights 3b2bbfdca6c5
- Config hash: `fe5643b1158b0a081c46102ff5d4efe04257baafe3d919d5425524346d4014e6` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: `3b2bbfdca6c5` (prefix)
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `1ac5f98`
- Samples per item: 1; submitters: local
- Executed: 2026-11-20T14:38:06.012Z – 2026-11-20T15:08:44.730Z

## Score
- Pass rate: 76.2% ± 6.0 (504/661 items); core 83.1%, stretch 48.9%
- Rank 33 of 79, tier 7 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 146, near_miss 5, length_cutoff 2, loop 2, no_answer 2

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 117370 total, 178 per item
- Wall time: 1667 s total, 2.5 s per item
- Generation speed: 93.8 tok/s
- Peak memory: 42.1 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 5/13 | 38.5% | 2903 | 37 | 97.5 | 42.0 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 9/12 | 75.0% | 121 | 4 | 109.6 | 42.0 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 1259 | 15 | 98.5 | 42.0 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 10/12 | 83.3% | 3520 | 40 | 97.9 | 42.0 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 495 | 7 | 100.4 | 42.0 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 12/12 | 100.0% | 24642 | 258 | 96.4 | 42.0 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 22/35 | 62.9% ± 27.2 | 2635 | 34 | 98.3 | 42.0 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 14/26 | 53.8% ± 20.5 | 510 | 9 | 104.2 | 42.0 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 1139 | 15 | 98.4 | 42.0 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 43 | 1 | 122.5 | 42.0 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 12/26 | 46.2% ± 17.4 | 21941 | 361 | 95.4 | 42.0 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 16/36 | 44.4% | 2903 | 42 | 98.4 | 42.0 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 9/12 | 75.0% | 1328 | 16 | 98.5 | 42.0 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 392 | 6 | 83.3 | 42.0 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 5/8 | 62.5% | 72 | 60 | 4.6 | 42.1 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 10/13 | 76.9% ± 26.5 | 358 | 8 | 102.8 | 42.1 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 6/9 | 66.7% | 541 | 8 | 98.6 | 42.1 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 483 | 5 | 98.7 | 42.1 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 451 | 8 | 98.2 | 42.1 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 1/29 | 3.4% ± 9.5 | 1755 | 26 | 95.7 | 42.1 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 284/316 | 89.9% ± 5.3 | 16652 | 351 | 86.5 | 42.1 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 5/12 | 41.7% | 1949 | 24 | 97.9 | 42.1 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 22/26 | 84.6% ± 17.7 | 31278 | 331 | 96.4 | 42.1 |
