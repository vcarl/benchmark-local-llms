# lfm2.5-1.2b-instruct-bf16-llamacpp: Pre-release (draft)

> LFM2.5-1.2B-Instruct on llamacpp BF16, Apple M5 Max 128GB. Pass rate 37.8% ± 6.4 (95% CI), rank 66 of 79, tier 13. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: LFM2.5-1.2B-Instruct (`LiquidAI/LFM2.5-1.2B-Instruct-GGUF`)
- Runtime: llamacpp; versions: llama.cpp b12359 (b1b770d90)
- Quant: BF16; temperature 0.1
- Variant (what sets it apart from the model's other rows): quant BF16 · weights 3d80914b903c
- Config hash: `295223476e2f1e73b6354dda55cb5b9f5f3be66f715757621cd7c3bdd37d6d46` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: `3d80914b903c` (prefix)
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `e77223a`
- Samples per item: 1; submitters: local
- Executed: 2026-11-20T23:02:12.916Z – 2026-11-20T23:14:24.256Z

## Score
- Pass rate: 37.8% ± 6.4 (250/661 items); core 43.0%, stretch 17.3%
- Rank 66 of 79, tier 13 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 347, near_miss 45, no_answer 14, length_cutoff 5

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 81791 total, 124 per item
- Wall time: 478 s total, 0.7 s per item
- Generation speed: 191.6 tok/s
- Peak memory: 6.6 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 0/13 | 0.0% | 1844 | 10 | 190.9 | 3.0 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 4/12 | 33.3% | 480 | 3 | 191.4 | 3.0 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 8/12 | 66.7% ± 31.3 | 1006 | 6 | 190.9 | 3.1 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 8/12 | 66.7% | 1095 | 6 | 191.2 | 3.1 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 7/10 | 70.0% ± 34.6 | 355 | 2 | 190.8 | 3.1 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 1/12 | 8.3% | 14620 | 76 | 192.3 | 3.2 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 6/35 | 17.1% ± 14.0 | 2553 | 14 | 191.8 | 3.3 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 5/26 | 19.2% ± 16.2 | 495 | 3 | 189.9 | 3.3 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 6/12 | 50.0% | 1143 | 6 | 191.5 | 3.3 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 6/7 | 85.7% ± 35.0 | 40 | 0 | 186.8 | 3.3 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 6/26 | 23.1% ± 21.4 | 15163 | 80 | 192.1 | 3.4 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 3/36 | 8.3% | 2503 | 14 | 191.9 | 3.5 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 8/12 | 66.7% | 885 | 5 | 191.3 | 3.5 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 4/10 | 40.0% ± 36.9 | 643 | 4 | 191.3 | 3.5 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 4/8 | 50.0% | 31 | 13 | 167.5 | 3.6 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 5/13 | 38.5% ± 30.6 | 509 | 3 | 190.7 | 3.6 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 1/9 | 11.1% | 303 | 2 | 190.4 | 3.6 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 3/4 | 75.0% | 351 | 2 | 191.3 | 4.5 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 2/9 | 22.2% | 424 | 3 | 188.5 | 4.5 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 0/29 | 0.0% ± 0.0 | 161 | 2 | 188.1 | 4.5 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 152/316 | 48.1% ± 9.8 | 20818 | 137 | 190.8 | 6.5 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 1/12 | 8.3% | 784 | 4 | 192.2 | 6.5 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 10/26 | 38.5% ± 24.2 | 15585 | 82 | 191.9 | 6.6 |
