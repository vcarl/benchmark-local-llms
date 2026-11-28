# lfm2.5-1.2b-instruct-q4km-llamacpp: Pre-release (draft)

> LFM2.5-1.2B-Instruct on llamacpp Q4_K_M, Apple M5 Max 128GB. Pass rate 35.2% ± 6.3 (95% CI), rank 69 of 79, tier 13. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: LFM2.5-1.2B-Instruct (`LiquidAI/LFM2.5-1.2B-Instruct-GGUF`)
- Runtime: llamacpp; versions: llama.cpp b12359 (b1b770d90)
- Quant: Q4_K_M; temperature 0.1
- Variant (what sets it apart from the model's other rows): quant Q4_K_M · weights b1b3de114215
- Config hash: `543109608b3f64a6f08f26e83ef2fb9bd90a4a6ddad9927d5d28bf34809520ba` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: `b1b3de114215` (prefix)
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `e77223a`
- Samples per item: 1; submitters: local
- Executed: 2026-11-20T22:52:48.064Z – 2026-11-20T23:02:05.270Z

## Score
- Pass rate: 35.2% ± 6.3 (233/661 items); core 40.0%, stretch 16.5%
- Rank 69 of 79, tier 13 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 361, near_miss 44, length_cutoff 13, no_answer 10

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 99479 total, 150 per item
- Wall time: 302 s total, 0.5 s per item
- Generation speed: 400.5 tok/s
- Peak memory: 5.2 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 0/13 | 0.0% | 1941 | 5 | 398.0 | 1.6 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 5/12 | 41.7% | 1138 | 3 | 402.3 | 1.6 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 8/12 | 66.7% ± 31.3 | 1071 | 3 | 401.7 | 1.6 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 4/12 | 33.3% | 1054 | 3 | 400.4 | 1.6 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 6/10 | 60.0% ± 36.9 | 340 | 1 | 399.0 | 1.6 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 0/12 | 0.0% | 15534 | 39 | 401.3 | 1.7 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 7/35 | 20.0% ± 17.6 | 2685 | 8 | 399.4 | 1.8 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 3/26 | 11.5% ± 13.2 | 541 | 2 | 394.9 | 1.8 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 6/12 | 50.0% | 1197 | 3 | 402.4 | 1.8 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 6/7 | 85.7% ± 35.0 | 41 | 0 | 379.6 | 1.8 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 6/26 | 23.1% ± 21.4 | 23777 | 60 | 401.2 | 2.0 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 4/36 | 11.1% | 2380 | 7 | 404.4 | 2.1 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 9/12 | 75.0% | 824 | 2 | 401.4 | 2.1 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 2/10 | 20.0% ± 30.2 | 667 | 2 | 400.4 | 2.1 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 3/8 | 37.5% | 36 | 13 | 199.0 | 2.2 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 6/13 | 46.2% ± 31.4 | 609 | 2 | 400.9 | 2.2 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 1/9 | 11.1% | 375 | 1 | 401.0 | 2.2 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 398 | 1 | 399.1 | 2.2 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 6/9 | 66.7% | 410 | 1 | 400.3 | 3.1 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 1/29 | 3.4% ± 9.5 | 134 | 1 | 377.5 | 3.1 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 139/316 | 44.0% ± 9.9 | 23318 | 88 | 399.2 | 5.1 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 0/12 | 0.0% | 937 | 3 | 404.6 | 5.1 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 7/26 | 26.9% ± 22.3 | 20072 | 51 | 401.0 | 5.2 |
