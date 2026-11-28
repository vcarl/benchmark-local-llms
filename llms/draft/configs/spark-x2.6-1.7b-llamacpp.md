# spark-x2.6-1.7b-llamacpp: Pre-release (draft)

> Spark-X2.6-1.7B on llamacpp Q8_0, Apple M5 Max 128GB. Pass rate 71.0% ± 5.1 (95% CI), rank 48 of 79, tier 8. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Spark-X2.6-1.7B (`XHToken/Spark-X2.6-1.7B-GGUF`)
- Runtime: llamacpp; versions: llama.cpp b12359 (b1b770d90)
- Quant: Q8_0; temperature 1
- Config hash: `5c7debcec40af2d5a5796781c8781d7666b99e2c23d2b0bee7bf55ea6f6df8ba` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `80326c1e6ec206b9a7eeda92fc921c6a4dc8c587`
- Samples per item: 1; submitters: local
- Executed: 2026-11-22T20:51:10.371Z – 2026-11-23T00:51:08.993Z

## Score
- Pass rate: 71.0% ± 5.1 (469/661 items); core 73.5%, stretch 60.9%
- Rank 48 of 79, tier 8 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 144, thinking_truncated 27, near_miss 12, no_answer 7, loop 2

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 2071817 total, 3134 per item
- Wall time: 14491 s total, 21.9 s per item
- Generation speed: 147.3 tok/s
- Peak memory: 21.2 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 5/13 | 38.5% | 187939 | 1298 | 144.8 | 10.8 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 2943 | 20 | 148.9 | 10.8 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 9/12 | 75.0% ± 28.7 | 15322 | 101 | 152.2 | 11.6 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 31841 | 210 | 152.6 | 12.1 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 20812 | 139 | 150.4 | 12.4 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 7/12 | 58.3% | 131649 | 894 | 147.4 | 13.4 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 23/35 | 65.7% ± 18.7 | 168115 | 1129 | 149.0 | 15.1 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 8/26 | 30.8% ± 19.0 | 63384 | 419 | 151.5 | 16.3 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 6/12 | 50.0% | 14907 | 98 | 152.4 | 16.5 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 5/7 | 71.4% ± 45.1 | 555 | 4 | 148.5 | 16.5 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 19/26 | 73.1% ± 36.1 | 282187 | 1916 | 147.4 | 17.9 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 22/36 | 61.1% | 55517 | 364 | 153.4 | 18.7 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 11/12 | 91.7% | 44030 | 289 | 152.7 | 18.9 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 7/10 | 70.0% ± 34.6 | 19830 | 131 | 151.4 | 18.9 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 6/8 | 75.0% | 6818 | 71 | 146.4 | 18.9 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 1620 | 11 | 149.7 | 18.9 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 3/9 | 33.3% | 62173 | 560 | 147.5 | 19.1 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 2/4 | 50.0% | 34109 | 237 | 144.3 | 19.2 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 7/9 | 77.8% | 13088 | 86 | 154.1 | 19.3 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 10/29 | 34.5% ± 48.7 | 572311 | 4142 | 145.0 | 19.5 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 245/316 | 77.5% ± 6.9 | 128910 | 908 | 150.4 | 21.2 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 6/12 | 50.0% | 19588 | 129 | 152.6 | 21.2 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 21/26 | 80.8% ± 21.3 | 194169 | 1333 | 145.8 | 21.2 |
