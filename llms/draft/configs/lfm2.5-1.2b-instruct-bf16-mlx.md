# lfm2.5-1.2b-instruct-bf16-mlx: Pre-release (draft)

> LFM2.5-1.2B-Instruct-bf16 on mlx bf16, Apple M5 Max 128GB. Pass rate 36.6% ± 6.4 (95% CI), rank 67 of 79, tier 13. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: LFM2.5-1.2B-Instruct-bf16 (`LiquidAI/LFM2.5-1.2B-Instruct-MLX-bf16`)
- Runtime: mlx; versions: mlx-lm 0.31.3
- Quant: bf16; temperature 0.1
- Config hash: `1d56afe04cf32c0a7eac6c6316151d1e0a2fcc6744b61d06116a3ed6d53a1b80` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `e77223a`
- Samples per item: 1; submitters: local
- Executed: 2026-11-20T22:40:25.597Z – 2026-11-20T22:52:35.819Z

## Score
- Pass rate: 36.6% ± 6.4 (242/661 items); core 41.7%, stretch 16.5%
- Rank 67 of 79, tier 13 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 349, near_miss 47, no_answer 12, length_cutoff 11

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 88223 total, 133 per item
- Wall time: 479 s total, 0.7 s per item
- Generation speed: 204.2 tok/s
- Peak memory: 2.4 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 0/13 | 0.0% | 4024 | 20 | 200.8 | 2.4 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 5/12 | 41.7% | 386 | 2 | 213.8 | 2.4 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 9/12 | 75.0% ± 28.7 | 995 | 5 | 209.3 | 2.4 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 8/12 | 66.7% | 1099 | 6 | 209.0 | 2.4 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 7/10 | 70.0% ± 34.6 | 367 | 2 | 212.8 | 2.4 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 1/12 | 8.3% | 14877 | 73 | 206.3 | 2.4 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 6/35 | 17.1% ± 14.0 | 2908 | 15 | 200.7 | 2.4 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 4/26 | 15.4% ± 14.9 | 529 | 3 | 218.3 | 2.4 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 6/12 | 50.0% | 1132 | 6 | 208.4 | 2.4 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 6/7 | 85.7% ± 35.0 | 40 | 0 | 187.8 | 2.4 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 5/26 | 19.2% ± 17.8 | 19581 | 97 | 204.4 | 2.4 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 2/36 | 5.6% | 2335 | 13 | 209.7 | 2.4 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 6/12 | 50.0% | 863 | 5 | 209.8 | 2.4 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 4/10 | 40.0% ± 36.9 | 659 | 3 | 197.2 | 2.4 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 4/8 | 50.0% | 31 | 9 | 15.8 | 2.4 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 5/13 | 38.5% ± 30.6 | 580 | 5 | 124.0 | 2.4 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 1/9 | 11.1% | 290 | 2 | 214.7 | 2.4 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 3/4 | 75.0% | 450 | 2 | 208.1 | 2.4 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 3/9 | 33.3% | 415 | 2 | 208.9 | 2.4 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 0/29 | 0.0% ± 0.0 | 157 | 2 | 168.6 | 2.4 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 147/316 | 46.5% ± 10.0 | 20697 | 128 | 207.7 | 2.4 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 0/12 | 0.0% | 714 | 4 | 209.5 | 2.4 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 10/26 | 38.5% ± 24.2 | 15094 | 74 | 206.0 | 2.4 |
