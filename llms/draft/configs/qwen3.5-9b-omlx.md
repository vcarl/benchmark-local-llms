# qwen3.5-9b-omlx: Pre-release (draft)

> Qwen3.5-9B on omlx 4bit, Apple M5 Max 128GB. Pass rate 88.4% ± 4.2 (95% CI), rank 21 of 79, tier 4. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Qwen3.5-9B (`mlx-community/Qwen3.5-9B-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 1
- Variant (what sets it apart from the model's other rows): runtime omlx · chatTemplateKwargs default · weights 48a191093b2f
- Config hash: `c278ce2a0f3f2cc5f4c383481d01f0a8797517295648a66b82a84e12492676b1` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: `48a191093b2f` (prefix)
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `6a9bf7cd7d1fee06dc674f5e76929ca2448d7436`, `6abaae7a35aa03b9005cbc89680d1e6ad87567c8`
- Samples per item: 1; submitters: local
- Executed: 2026-11-25T08:43:16.735Z – 2026-11-26T03:48:20.842Z

## Score
- Pass rate: 88.4% ± 4.2 (584/661 items); core 93.2%, stretch 69.2%
- Rank 21 of 79, tier 4 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): thinking_truncated 44, wrong 26, near_miss 5, loop 2

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 3820187 total, 5779 per item
- Wall time: 41555 s total, 62.9 s per item
- Generation speed: 93.9 tok/s
- Peak memory: 6.9 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 9/13 | 69.2% | 155142 | 1694 | 91.8 | 6.9 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 15867 | 163 | 99.4 | 6.9 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 86779 | 914 | 95.3 | 6.9 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 85264 | 890 | 96.3 | 6.9 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 55819 | 579 | 96.8 | 6.9 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 4/12 | 33.3% | 302683 | 3314 | 91.4 | 6.9 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 33/35 | 94.3% ± 7.9 | 260879 | 3138 | 94.2 | 6.9 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 15/26 | 57.7% ± 20.4 | 308088 | 3249 | 95.0 | 6.9 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 52881 | 544 | 97.9 | 6.9 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 3672 | 38 | 100.9 | 6.9 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 13/26 | 50.0% ± 36.7 | 634912 | 6942 | 91.6 | 6.9 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 34/36 | 94.4% | 186865 | 1936 | 97.2 | 6.9 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 12/12 | 100.0% | 71556 | 734 | 97.9 | 6.9 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 14939 | 151 | 100.4 | 6.9 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 5/8 | 62.5% | 35858 | 499 | 87.7 | 6.9 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 9587 | 98 | 101.6 | 6.9 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 6/9 | 66.7% | 130632 | 1404 | 93.2 | 6.9 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 4479 | 46 | 99.1 | 6.9 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 8/9 | 88.9% | 33461 | 463 | 98.1 | 6.9 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 14/29 | 48.3% ± 51.5 | 685791 | 7424 | 92.5 | 6.9 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 306/316 | 96.8% ± 2.1 | 269642 | 2914 | 100.1 | 6.9 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 12/12 | 100.0% | 61428 | 627 | 98.7 | 6.9 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 21/26 | 80.8% ± 21.3 | 353963 | 3793 | 93.5 | 6.9 |
