# lfm3-1.7b-q4km-llamacpp: Pre-release (draft)

> LFM3-1.7B on llamacpp Q4_K_M, Apple M5 Max 128GB. Pass rate 89.6% ± 3.5 (95% CI), rank 19 of 79, tier 4. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: LFM3-1.7B (`LiquidAI/LFM3-1.7B-GGUF`)
- Runtime: llamacpp; versions: llama.cpp b12359 (b1b770d90)
- Quant: Q4_K_M; temperature 0.1
- Variant (what sets it apart from the model's other rows): quant Q4_K_M · weights 3793e1e6e226
- Config hash: `b4003bfe4e817b5b76efd10e7063890e512c0c34ae8951b6476388d983397cac` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: `3793e1e6e226` (prefix)
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `e77223a`
- Samples per item: 1; submitters: local
- Executed: 2026-11-18T01:02:52.538Z – 2026-11-21T02:57:37.022Z

## Score
- Pass rate: 89.6% ± 3.5 (592/661 items); core 92.2%, stretch 78.9%
- Rank 19 of 79, tier 4 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 45, thinking_truncated 23, near_miss 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 2921233 total, 4419 per item
- Wall time: 16127 s total, 24.4 s per item
- Generation speed: 182.1 tok/s
- Peak memory: 11.5 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 9/13 | 69.2% | 160700 | 893 | 180.1 | 2.5 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 11138 | 59 | 191.4 | 2.8 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 19947 | 109 | 184.6 | 1.7 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 30288 | 159 | 192.0 | 3.0 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 12193 | 70 | 175.8 | 1.9 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 8/12 | 66.7% | 187309 | 1022 | 183.3 | 4.2 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 34/35 | 97.1% ± 6.0 | 156573 | 867 | 181.0 | 5.1 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 6/26 | 23.1% ± 17.4 | 125290 | 687 | 182.7 | 3.9 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 10/12 | 83.3% | 93028 | 509 | 183.1 | 5.7 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 837 | 5 | 183.9 | 5.7 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 17/26 | 65.4% ± 38.1 | 518258 | 2890 | 179.4 | 7.4 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 34/36 | 94.4% | 183928 | 972 | 189.9 | 9.0 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 12/12 | 100.0% | 25003 | 131 | 192.0 | 9.2 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 4804 | 26 | 191.6 | 9.3 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 6/8 | 75.0% | 106752 | 669 | 163.9 | 10.2 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 2936 | 16 | 191.7 | 10.6 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 7/9 | 77.8% | 144954 | 800 | 181.3 | 10.6 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 3/4 | 75.0% | 2235 | 12 | 187.9 | 10.6 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 23674 | 124 | 192.2 | 10.8 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 20/29 | 69.0% ± 52.2 | 547666 | 3020 | 181.5 | 11.1 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 307/316 | 97.2% ± 1.7 | 247825 | 1354 | 189.9 | 11.5 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 12/12 | 100.0% | 81634 | 435 | 188.1 | 11.5 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 22/26 | 84.6% ± 11.1 | 234261 | 1300 | 180.4 | 11.5 |
