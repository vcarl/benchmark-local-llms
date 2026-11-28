# mistral-small-4-119b-omlx: Pre-release (draft)

> Mistral-Small-4-119B-2603 on omlx 4bit, Apple M5 Max 128GB. Pass rate 91.5% ± 3.0 (95% CI), rank 17 of 79, tier 4. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Mistral-Small-4-119B-2603 (`mlx-community/Mistral-Small-4-119B-2603-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 0.7
- Config hash: `0875bcbc64794d92f39ce9b1636e3f16b0d6fb0eda64ea74c0f504fff460891a` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `f423a936dbf47fbd8483dbba9d46d3f9e05e6b24`
- Samples per item: 1; submitters: local
- Executed: 2026-11-26T17:39:41.417Z – 2026-11-26T22:21:07.213Z

## Score
- Pass rate: 91.5% ± 3.0 (605/661 items); core 94.1%, stretch 81.2%
- Rank 17 of 79, tier 4 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 51, thinking_truncated 3, near_miss 2

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 873395 total, 1321 per item
- Wall time: 16930 s total, 25.6 s per item
- Generation speed: 54.6 tok/s
- Peak memory: 10.5 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 10/13 | 76.9% | 48183 | 933 | 53.0 | 10.5 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 2275 | 30 | 98.6 | 10.5 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 22594 | 266 | 86.8 | 10.5 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 27070 | 347 | 80.4 | 10.5 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 6740 | 77 | 91.9 | 10.5 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 11/12 | 91.7% | 33275 | 416 | 81.9 | 10.5 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 35/35 | 100.0% ± 0.0 | 47150 | 617 | 79.1 | 10.5 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 17/26 | 65.4% ± 19.6 | 10288 | 141 | 79.2 | 10.5 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 11/12 | 91.7% | 5571 | 87 | 72.1 | 10.5 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 1075 | 16 | 81.2 | 10.5 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 23/26 | 88.5% ± 28.2 | 187854 | 5086 | 37.5 | 10.5 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 31/36 | 86.1% | 40574 | 564 | 78.0 | 10.5 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 9/12 | 75.0% | 12158 | 152 | 83.8 | 10.5 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 3736 | 47 | 88.5 | 10.5 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 6/8 | 75.0% | 2641 | 216 | 30.6 | 10.5 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 5029 | 146 | 82.5 | 10.5 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 9/9 | 100.0% | 49465 | 874 | 57.4 | 10.5 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 2214 | 31 | 82.6 | 10.5 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 13141 | 183 | 75.5 | 10.5 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 14/29 | 48.3% ± 44.3 | 172230 | 3810 | 45.9 | 10.5 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 305/316 | 96.5% ± 1.9 | 100403 | 1712 | 74.4 | 10.5 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 12/12 | 100.0% | 23070 | 330 | 72.9 | 10.5 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 23/26 | 88.5% ± 18.1 | 56659 | 849 | 68.8 | 10.5 |
