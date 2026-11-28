# lfm2.5-24b-a2b-4bit-omlx: Pre-release (draft)

> LFM2.5-24B-A2B on omlx 4bit, Apple M5 Max 128GB. Pass rate 76.7% ± 4.4 (95% CI), rank 32 of 79, tier 7. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: LFM2.5-24B-A2B (`LiquidAI/LFM2.5-24B-A2B-MLX-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 0.1
- Config hash: `75805ccc4494312a83363c455b8b4decf3d217e3093a72e7742466c852eff366` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `1d6ac256086344b69fafaffac3dc2af551040911`
- Samples per item: 1; submitters: local
- Executed: 2026-11-24T05:00:00.126Z – 2026-11-24T06:51:30.111Z

## Score
- Pass rate: 76.7% ± 4.4 (507/661 items); core 75.2%, stretch 82.7%
- Rank 32 of 79, tier 7 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): no_answer 83, wrong 65, near_miss 3, thinking_truncated 2, loop 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 1086846 total, 1644 per item
- Wall time: 6711 s total, 10.2 s per item
- Generation speed: 169.0 tok/s
- Peak memory: 13.6 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 10/13 | 76.9% | 83640 | 547 | 153.7 | 13.6 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 4515 | 28 | 182.7 | 13.6 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 10199 | 61 | 175.2 | 13.6 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 19758 | 118 | 172.2 | 13.6 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 8258 | 48 | 179.8 | 13.6 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 11/12 | 91.7% | 85161 | 516 | 166.1 | 13.6 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 35/35 | 100.0% ± 0.0 | 36763 | 212 | 180.2 | 13.6 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 7/26 | 26.9% ± 18.3 | 32882 | 187 | 180.7 | 13.6 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 11/12 | 91.7% | 12634 | 73 | 181.3 | 13.6 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 941 | 6 | 206.2 | 13.6 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 19/26 | 73.1% ± 25.0 | 146378 | 874 | 168.7 | 13.6 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 30/36 | 83.3% | 37977 | 225 | 176.8 | 13.6 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 11/12 | 91.7% | 14061 | 130 | 179.5 | 13.6 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 2415 | 15 | 191.6 | 13.6 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 5/8 | 62.5% | 22715 | 179 | 145.9 | 13.6 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 2442 | 15 | 197.1 | 13.6 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 8/9 | 88.9% | 28841 | 169 | 173.6 | 13.6 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 2201 | 13 | 182.9 | 13.6 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 9930 | 57 | 181.0 | 13.6 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 20/29 | 69.0% ± 50.6 | 270633 | 1650 | 164.7 | 13.6 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 217/316 | 68.7% ± 6.3 | 159810 | 1029 | 176.6 | 13.6 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 10/12 | 83.3% | 21211 | 124 | 175.4 | 13.6 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 24/26 | 92.3% ± 11.2 | 73481 | 433 | 172.4 | 13.6 |
