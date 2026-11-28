# flint-llamacpp: Pre-release (draft)

> flint on llamacpp Q8_0, Apple M5 Max 128GB. Pass rate 94.3% ± 3.1 (95% CI), rank 9 of 79, tier 3. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: flint (`unsloth/flint-GGUF`)
- Runtime: llamacpp; versions: llama.cpp b12359 (b1b770d90)
- Quant: Q8_0; temperature 1
- Config hash: `f776d692ad930b2dc44d3f2301844d18862e07f84794589d498e855f731cf5ee` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `95a1a9e5ef4084611e6bd9939233f2b66d6e067c`
- Samples per item: 1; submitters: local
- Executed: 2026-11-22T16:33:18.287Z – 2026-11-22T19:12:03.421Z

## Score
- Pass rate: 94.3% ± 3.1 (623/661 items); core 95.6%, stretch 88.7%
- Rank 9 of 79, tier 3 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 35, thinking_truncated 2, near_miss 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 816170 total, 1235 per item
- Wall time: 9549 s total, 14.4 s per item
- Generation speed: 87.9 tok/s
- Peak memory: 51.3 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 11/13 | 84.6% | 66564 | 766 | 87.1 | 41.8 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 2345 | 28 | 89.0 | 42.0 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 4697 | 54 | 89.7 | 42.4 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 5059 | 59 | 89.1 | 42.8 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 5241 | 59 | 90.0 | 43.1 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 12/12 | 100.0% | 21381 | 236 | 91.3 | 43.7 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 31/35 | 88.6% ± 12.6 | 39855 | 448 | 89.8 | 44.9 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 17/26 | 65.4% ± 19.6 | 47698 | 534 | 89.7 | 46.1 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 10822 | 123 | 89.5 | 46.6 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 555 | 7 | 86.4 | 46.6 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 21/26 | 80.8% ± 30.0 | 87296 | 998 | 87.8 | 48.5 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 35/36 | 97.2% | 61297 | 695 | 89.1 | 49.6 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 12/12 | 100.0% | 8574 | 99 | 87.7 | 49.6 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 2974 | 35 | 87.7 | 49.6 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 6/8 | 75.0% | 21068 | 347 | 73.7 | 49.9 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 1342 | 17 | 86.4 | 50.0 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 9/9 | 100.0% | 11992 | 136 | 89.4 | 50.0 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 829 | 10 | 86.5 | 50.0 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 3764 | 44 | 88.4 | 50.0 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 26/29 | 89.7% ± 28.5 | 221890 | 2619 | 84.8 | 50.4 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 304/316 | 96.2% ± 5.0 | 134205 | 1606 | 92.2 | 51.3 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 12/12 | 100.0% | 18521 | 207 | 90.8 | 51.3 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 26/26 | 100.0% ± 0.0 | 38201 | 423 | 91.1 | 51.3 |
