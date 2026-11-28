# gpt-oss-20b-llamacpp: Pre-release (draft)

> gpt-oss-20b on llamacpp Q8_0, Apple M5 Max 128GB. Pass rate 93.3% ± 2.9 (95% CI), rank 10 of 79, tier 3. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: gpt-oss-20b (`unsloth/gpt-oss-20b-GGUF`)
- Runtime: llamacpp; versions: llama.cpp b12359 (b1b770d90)
- Quant: Q8_0; temperature 0.6
- Config hash: `4803f96ef98d892db3b15bca4a2f33919039e365bfee38e1ef28816f9851834d` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `1ac5f98`
- Samples per item: 1; submitters: local
- Executed: 2026-11-20T13:03:28.529Z – 2026-11-20T13:55:39.803Z

## Score
- Pass rate: 93.3% ± 2.9 (617/661 items); core 95.3%, stretch 85.7%
- Rank 10 of 79, tier 3 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 31, thinking_truncated 9, no_answer 3, near_miss 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 395970 total, 599 per item
- Wall time: 3160 s total, 4.8 s per item
- Generation speed: 133.4 tok/s
- Peak memory: 22.2 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 11/13 | 84.6% | 24806 | 186 | 134.2 | 13.3 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 1535 | 12 | 137.4 | 13.3 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 3734 | 28 | 138.4 | 13.4 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 5881 | 44 | 138.7 | 13.7 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 5311 | 39 | 139.0 | 13.8 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 10/12 | 83.3% | 25468 | 187 | 136.7 | 14.1 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 34/35 | 97.1% ± 6.0 | 13582 | 100 | 138.9 | 14.6 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 18/26 | 69.2% ± 19.0 | 9603 | 71 | 138.8 | 14.8 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 3856 | 29 | 138.7 | 14.9 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 474 | 4 | 138.6 | 14.9 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 20/26 | 76.9% ± 31.1 | 57401 | 430 | 134.0 | 15.8 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 34/36 | 94.4% | 21315 | 158 | 138.6 | 16.5 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 12/12 | 100.0% | 11072 | 81 | 138.9 | 16.7 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 1829 | 14 | 138.9 | 16.8 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 5/8 | 62.5% | 21665 | 272 | 98.9 | 18.3 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 1556 | 12 | 137.4 | 18.3 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 9/9 | 100.0% | 4632 | 34 | 138.5 | 18.8 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 993 | 7 | 138.1 | 18.9 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 2074 | 16 | 138.4 | 18.9 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 23/29 | 79.3% ± 57.0 | 72124 | 536 | 135.1 | 20.1 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 305/316 | 96.5% ± 2.4 | 67219 | 608 | 135.8 | 22.2 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 11/12 | 91.7% | 11506 | 85 | 138.4 | 22.2 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 24/26 | 92.3% ± 11.2 | 28334 | 208 | 137.4 | 22.2 |
