# magistral-small-2509-omlx: Pre-release (draft)

> Magistral-Small-2509 on omlx 4bit, Apple M5 Max 128GB. Pass rate 72.6% ± 5.8 (95% CI), rank 45 of 79, tier 8. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Magistral-Small-2509 (`lmstudio-community/Magistral-Small-2509-MLX-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime omlx
- Config hash: `2f77a85eae1dd2e18216de0efbdd97a15d5128a96c888d273fc089989eaa93fd` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `37f9f14`, `bfb5743`
- Samples per item: 1; submitters: local
- Executed: 2026-10-27T06:58:18.964Z – 2026-11-20T01:13:04.342Z

## Score
- Pass rate: 72.6% ± 5.8 (480/661 items); core 79.2%, stretch 46.6%
- Rank 45 of 79, tier 8 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 170, near_miss 10, no_answer 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 83102 total, 126 per item
- Wall time: 2917 s total, 4.4 s per item
- Generation speed: 32.8 tok/s
- Peak memory: 14.3 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 4/13 | 30.8% | 1722 | 62 | 27.8 | 14.1 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 11/12 | 91.7% | 408 | 14 | 42.5 | 14.1 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 941 | 27 | 35.2 | 14.1 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 11/12 | 91.7% | 951 | 29 | 42.9 | 14.1 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 9/10 | 90.0% ± 22.6 | 467 | 14 | 34.2 | 14.1 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 5/12 | 41.7% | 5925 | 149 | 40.8 | 14.2 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 21/35 | 60.0% ± 11.6 | 5950 | 158 | 38.8 | 14.1 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 12/26 | 46.2% ± 20.5 | 583 | 20 | 29.7 | 14.1 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 1251 | 58 | 21.7 | 14.2 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 6/7 | 85.7% ± 35.0 | 114 | 4 | 29.4 | 14.1 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 11/26 | 42.3% ± 24.0 | 17718 | 476 | 37.4 | 14.2 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 15/36 | 41.7% | 2180 | 69 | 43.3 | 14.1 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 8/12 | 66.7% | 1507 | 57 | 26.6 | 14.2 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 9/10 | 90.0% ± 22.6 | 760 | 21 | 38.2 | 14.2 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 6/8 | 75.0% | 47 | 287 | 0.2 | 14.3 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 9/13 | 69.2% ± 29.0 | 687 | 20 | 39.5 | 14.2 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 6/9 | 66.7% | 533 | 25 | 21.1 | 14.3 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 487 | 13 | 36.6 | 14.2 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 383 | 21 | 17.9 | 14.3 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 5/29 | 17.2% ± 20.5 | 7694 | 206 | 38.4 | 14.3 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 276/316 | 87.3% ± 5.6 | 20779 | 853 | 40.0 | 14.2 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 1/12 | 8.3% | 758 | 37 | 20.4 | 14.3 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 18/26 | 69.2% ± 29.5 | 11257 | 300 | 37.7 | 14.2 |
