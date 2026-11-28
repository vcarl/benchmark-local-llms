# qwen3.5-9b-mlx: Pre-release (draft)

> Qwen3.5-9B on mlx 4bit, Apple M5 Max 128GB. Pass rate 55.2% ± 7.5 (95% CI), rank 56 of 79, tier 10. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Qwen3.5-9B (`mlx-community/Qwen3.5-9B-4bit`)
- Runtime: mlx; versions: mlx-lm 0.31.3
- Quant: 4bit; temperature 1
- Variant (what sets it apart from the model's other rows): runtime mlx · chatTemplateKwargs {"enable_thinking":true} · weights 48a191093b2f
- Config hash: `f5a2250719265b087cf402741e5b3b82f7125feed8a110fea6dfac4e707e63f4` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: `48a191093b2f` (prefix)
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `a2dd98c1b74d6395abf3a4ae45d4ab238aacbfff`
- Samples per item: 1; submitters: local
- Executed: 2026-11-25T00:18:05.210Z – 2026-11-25T08:37:00.684Z

## Score
- Pass rate: 55.2% ± 7.5 (365/661 items); core 64.6%, stretch 18.0%
- Rank 56 of 79, tier 10 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): loop 260, thinking_truncated 25, wrong 11

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 1146967 total, 1735 per item
- Wall time: 30278 s total, 45.8 s per item
- Generation speed: 91.7 tok/s
- Peak memory: 5.2 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 7/13 | 53.8% | 44784 | 858 | 90.8 | 5.1 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 11/12 | 91.7% | 13428 | 201 | 97.9 | 5.1 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 2/12 | 16.7% ± 24.7 | 34219 | 855 | 90.2 | 5.1 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 1/12 | 8.3% | 3626 | 667 | 97.2 | 5.1 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 5/10 | 50.0% ± 37.7 | 9889 | 473 | 96.5 | 5.1 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 0/12 | 0.0% | 98304 | 1645 | 89.4 | 5.1 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 9/35 | 25.7% ± 18.1 | 11586 | 1621 | 96.2 | 5.1 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 1/26 | 3.8% ± 7.9 | 127 | 724 | 97.4 | 5.1 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 4/12 | 33.3% | 10950 | 900 | 96.9 | 5.1 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 6/7 | 85.7% ± 35.0 | 3030 | 32 | 98.6 | 5.1 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 1/26 | 3.8% ± 9.4 | 138155 | 3170 | 89.0 | 5.2 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 7/36 | 19.4% | 83453 | 3317 | 89.6 | 5.2 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 1/12 | 8.3% | 2220 | 737 | 98.8 | 5.2 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 9/10 | 90.0% ± 22.6 | 14536 | 231 | 98.0 | 5.2 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 3/8 | 37.5% | 1153 | 575 | 87.4 | 5.2 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 12470 | 133 | 97.7 | 5.2 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 0/9 | 0.0% | 131072 | 1616 | 90.3 | 5.2 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 3/4 | 75.0% | 4539 | 106 | 98.2 | 5.2 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 0/9 | 0.0% | 65536 | 1213 | 89.9 | 5.2 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 0/29 | 0.0% ± 0.0 | 164766 | 3330 | 89.3 | 5.2 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 276/316 | 87.3% ± 4.9 | 190931 | 4055 | 98.3 | 5.2 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 1/12 | 8.3% | 7140 | 1527 | 97.3 | 5.2 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 5/26 | 19.2% ± 28.7 | 101053 | 2294 | 90.9 | 5.2 |
