# lfm3-1.7b-bf16-llamacpp: Pre-release (draft)

> LFM3-1.7B on llamacpp BF16, Apple M5 Max 128GB. Pass rate 92.1% ± 2.7 (95% CI), rank 14 of 79, tier 3. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: LFM3-1.7B (`LiquidAI/LFM3-1.7B-GGUF`)
- Runtime: llamacpp; versions: llama.cpp b12359 (b1b770d90)
- Quant: BF16; temperature 0.1
- Variant (what sets it apart from the model's other rows): quant BF16 · weights 39158a79f56e
- Config hash: `94269590f0ec0237119e0a8afa19a39c3f55fdf60589ae64c2b66e78014c74d1` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: `39158a79f56e` (prefix)
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `7ff51f2`
- Samples per item: 1; submitters: local
- Executed: 2026-11-18T02:44:26.240Z – 2026-11-21T08:23:14.916Z

## Score
- Pass rate: 92.1% ± 2.7 (609/661 items); core 93.9%, stretch 85.0%
- Rank 14 of 79, tier 3 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 47, thinking_truncated 4, no_answer 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 2248005 total, 3401 per item
- Wall time: 20885 s total, 31.6 s per item
- Generation speed: 108.1 tok/s
- Peak memory: 13.7 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 11/13 | 84.6% | 112548 | 1045 | 107.8 | 4.5 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 5992 | 55 | 109.6 | 4.6 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 19016 | 175 | 109.2 | 3.9 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 26474 | 241 | 110.1 | 4.9 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 18082 | 167 | 108.5 | 4.0 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 11/12 | 91.7% | 131806 | 1214 | 108.7 | 5.7 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 31/35 | 88.6% ± 13.3 | 113705 | 1049 | 108.6 | 6.4 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 5/26 | 19.2% ± 16.2 | 106108 | 960 | 110.6 | 6.0 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 11/12 | 91.7% | 54081 | 495 | 109.4 | 6.8 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 936 | 9 | 111.1 | 6.8 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 21/26 | 80.8% ± 22.7 | 383808 | 3565 | 107.7 | 9.2 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 36/36 | 100.0% | 149175 | 1356 | 110.3 | 10.5 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 12/12 | 100.0% | 31900 | 290 | 110.2 | 10.8 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 4592 | 42 | 110.2 | 10.8 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 7/8 | 87.5% | 54496 | 542 | 103.7 | 11.9 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 2635 | 25 | 109.9 | 12.2 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 7/9 | 77.8% | 109674 | 1018 | 107.8 | 12.3 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 1778 | 16 | 109.5 | 12.5 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 26771 | 242 | 110.7 | 12.6 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 22/29 | 75.9% ± 46.1 | 450338 | 4180 | 107.8 | 13.3 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 309/316 | 97.8% ± 1.7 | 205447 | 1960 | 107.4 | 13.6 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 12/12 | 100.0% | 64359 | 600 | 107.4 | 13.6 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 25/26 | 96.2% ± 8.9 | 174284 | 1637 | 106.5 | 13.7 |
