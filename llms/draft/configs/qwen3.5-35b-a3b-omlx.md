# qwen3.5-35b-a3b-omlx: Pre-release (draft)

> Qwen3.5-35B-A3B on omlx 4bit, Apple M5 Max 128GB. Pass rate 94.3% ± 2.6 (95% CI), rank 8 of 79, tier 3. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Qwen3.5-35B-A3B (`mlx-community/Qwen3.5-35B-A3B-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 1
- Variant (what sets it apart from the model's other rows): runtime omlx · chatTemplateKwargs default
- Config hash: `d7e9c087bb7eda9189a44328f573c0546a2f43ee7a5bbe3c345b58ff09e50021` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `8f6814c6c5887b2106b9c81cc9408b84f6556ae4`
- Samples per item: 1; submitters: local
- Executed: 2026-11-23T23:10:31.587Z – 2026-11-24T03:14:40.585Z

## Score
- Pass rate: 94.3% ± 2.6 (623/661 items); core 96.2%, stretch 86.5%
- Rank 8 of 79, tier 3 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 28, thinking_truncated 7, loop 2, length_cutoff 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 1848964 total, 2797 per item
- Wall time: 14767 s total, 22.3 s per item
- Generation speed: 131.3 tok/s
- Peak memory: 9.1 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 11/13 | 84.6% | 42530 | 316 | 136.3 | 9.0 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 11341 | 82 | 144.2 | 9.0 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 47073 | 342 | 139.1 | 9.0 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 40390 | 296 | 138.4 | 9.0 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 29207 | 210 | 141.2 | 9.0 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 12/12 | 100.0% | 120312 | 919 | 131.5 | 9.0 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 35/35 | 100.0% ± 0.0 | 110299 | 821 | 136.0 | 9.0 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 17/26 | 65.4% ± 19.6 | 89998 | 651 | 139.7 | 9.0 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 41693 | 300 | 140.9 | 9.0 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 2253 | 17 | 149.0 | 9.0 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 20/26 | 76.9% ± 28.4 | 384623 | 3106 | 124.2 | 9.0 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 36/36 | 100.0% | 127960 | 974 | 133.3 | 9.0 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 11/12 | 91.7% | 38471 | 377 | 133.0 | 9.0 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 5776 | 45 | 137.1 | 9.0 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 8/8 | 100.0% | 8630 | 117 | 116.6 | 9.1 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 8274 | 61 | 143.5 | 9.1 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 7/9 | 77.8% | 52970 | 409 | 130.4 | 9.1 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 2411 | 18 | 144.7 | 9.1 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 31041 | 229 | 137.6 | 9.1 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 20/29 | 69.0% ± 52.8 | 349708 | 3046 | 126.3 | 9.1 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 308/316 | 97.5% ± 1.7 | 93400 | 825 | 144.5 | 9.1 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 12/12 | 100.0% | 35726 | 263 | 138.4 | 9.1 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 25/26 | 96.2% ± 8.9 | 174878 | 1343 | 131.1 | 9.1 |
