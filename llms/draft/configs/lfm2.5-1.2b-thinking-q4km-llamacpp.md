# lfm2.5-1.2b-thinking-q4km-llamacpp: Pre-release (draft)

> LFM2.5-1.2B-Thinking on llamacpp Q4_K_M, Apple M5 Max 128GB. Pass rate 53.1% ± 5.8 (95% CI), rank 60 of 79, tier 11. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: LFM2.5-1.2B-Thinking (`LiquidAI/LFM2.5-1.2B-Thinking-GGUF`)
- Runtime: llamacpp; versions: llama.cpp b12359 (b1b770d90)
- Quant: Q4_K_M; temperature 0.05
- Variant (what sets it apart from the model's other rows): quant Q4_K_M · weights 4a1e1824f710
- Config hash: `b3ad9f3229cee3e1bfea035559abfbf66dbca62b932cc55e33c02cfee427ed45` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: `4a1e1824f710` (prefix)
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `78755c7ec5b1e2341d11a1dec7bbbf86a65946e6`
- Samples per item: 1; submitters: local
- Executed: 2026-11-26T14:33:15.712Z – 2026-11-26T15:35:52.047Z

## Score
- Pass rate: 53.1% ± 5.8 (351/661 items); core 56.1%, stretch 41.4%
- Rank 60 of 79, tier 11 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 254, no_answer 40, near_miss 14, loop 2

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 1446203 total, 2188 per item
- Wall time: 3757 s total, 5.7 s per item
- Generation speed: 393.7 tok/s
- Peak memory: 10.5 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 3/13 | 23.1% | 50492 | 129 | 393.4 | 1.3 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 7/12 | 58.3% | 19063 | 47 | 404.5 | 1.4 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 8/12 | 66.7% ± 31.3 | 15980 | 40 | 400.5 | 1.5 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 7/12 | 58.3% | 59148 | 153 | 389.3 | 1.9 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 16425 | 41 | 399.8 | 2.0 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 1/12 | 8.3% | 72303 | 185 | 392.3 | 2.4 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 20/35 | 57.1% ± 13.3 | 105601 | 266 | 398.0 | 3.1 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 2/26 | 7.7% ± 11.0 | 25926 | 65 | 403.0 | 3.4 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 2/12 | 16.7% | 21647 | 54 | 401.3 | 3.5 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 6/7 | 85.7% ± 35.0 | 8730 | 22 | 398.1 | 3.5 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 16/26 | 61.5% ± 30.5 | 154521 | 399 | 387.6 | 4.5 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 10/36 | 27.8% | 131839 | 363 | 394.7 | 5.5 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 11/12 | 91.7% | 19766 | 49 | 401.3 | 5.7 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 5/10 | 50.0% ± 37.7 | 23965 | 60 | 399.8 | 5.8 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 0/8 | 0.0% | 14173 | 55 | 336.7 | 6.5 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 7565 | 19 | 404.9 | 6.9 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 0/9 | 0.0% | 36078 | 92 | 395.1 | 7.1 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 3804 | 10 | 402.2 | 7.1 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 0/9 | 0.0% | 11397 | 29 | 400.3 | 7.2 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 0/29 | 0.0% ± 0.0 | 168451 | 432 | 390.6 | 8.3 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 211/316 | 66.8% ± 8.3 | 315500 | 829 | 397.2 | 10.3 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 1/12 | 8.3% | 64914 | 166 | 391.7 | 10.3 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 16/26 | 61.5% ± 29.9 | 98915 | 252 | 393.0 | 10.5 |
