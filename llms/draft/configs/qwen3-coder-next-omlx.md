# qwen3-coder-next-omlx: Pre-release (draft)

> Qwen3-Coder-Next on omlx 4bit, Apple M5 Max 128GB. Pass rate 75.8% ± 6.0 (95% CI), rank 34 of 79, tier 7. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Qwen3-Coder-Next (`mlx-community/Qwen3-Coder-Next-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 1
- Variant (what sets it apart from the model's other rows): runtime omlx · t1 · topP 0.95 · topK 40 · weights 3b2bbfdca6c5
- Config hash: `397ceb33c21861f4deca2bb01d8951fcf4cab2febea056a7db4296b2df162fe8` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: `3b2bbfdca6c5` (prefix)
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `37f9f14`, `bfb5743`
- Samples per item: 1; submitters: local
- Executed: 2026-10-27T02:02:10.414Z – 2026-11-20T01:08:53.308Z

## Score
- Pass rate: 75.8% ± 6.0 (501/661 items); core 82.8%, stretch 48.1%
- Rank 34 of 79, tier 7 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 148, near_miss 9, no_answer 2, length_cutoff 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 148634 total, 225 per item
- Wall time: 1922 s total, 2.9 s per item
- Generation speed: 86.4 tok/s
- Peak memory: 42.8 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 5/13 | 38.5% | 9355 | 121 | 77.5 | 42.7 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 10/12 | 83.3% | 97 | 4 | 23.8 | 20.8 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 1163 | 14 | 83.9 | 34.4 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 10/12 | 83.3% | 2314 | 28 | 83.4 | 14.8 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 490 | 7 | 75.2 | 34.4 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 12/12 | 100.0% | 31241 | 322 | 98.1 | 42.7 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 19/35 | 54.3% ± 26.6 | 2987 | 38 | 79.2 | 34.4 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 15/26 | 57.7% ± 20.4 | 522 | 9 | 55.5 | 34.4 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 1179 | 16 | 75.0 | 42.6 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 36 | 1 | 24.5 | 34.4 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 12/26 | 46.2% ± 17.9 | 41814 | 430 | 97.2 | 41.0 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 15/36 | 41.7% | 3063 | 46 | 66.1 | 13.5 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 11/12 | 91.7% | 1454 | 18 | 81.7 | 42.6 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 502 | 7 | 75.1 | 34.4 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 6/8 | 75.0% | 32 | 95 | 0.3 | 42.8 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 10/13 | 76.9% ± 26.5 | 610 | 8 | 74.6 | 20.7 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 6/9 | 66.7% | 596 | 11 | 55.5 | 42.8 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 437 | 5 | 88.9 | 34.4 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 431 | 10 | 44.0 | 42.8 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 2/29 | 6.9% ± 19.0 | 1825 | 28 | 65.8 | 42.8 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 280/316 | 88.6% ± 5.8 | 16902 | 372 | 96.6 | 41.3 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 3/12 | 25.0% | 1307 | 22 | 59.5 | 42.8 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 23/26 | 88.5% ± 11.8 | 30277 | 311 | 97.7 | 41.3 |
