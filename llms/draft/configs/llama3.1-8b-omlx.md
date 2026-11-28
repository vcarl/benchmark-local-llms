# llama3.1-8b-omlx: Pre-release (draft)

> Meta-Llama-3.1-8B-Instruct on omlx 4bit, Apple M5 Max 128GB. Pass rate 40.2% ± 5.3 (95% CI), rank 65 of 79, tier 13. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Meta-Llama-3.1-8B-Instruct (`mlx-community/Meta-Llama-3.1-8B-Instruct-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 0.6
- Variant (what sets it apart from the model's other rows): runtime omlx · t0.6 · topP 0.9
- Config hash: `de7ef30b02c3226a6af9669d910930633054e7923afe8848625d4c45481ade23` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `37f9f14`, `bfb5743`
- Samples per item: 1; submitters: local
- Executed: 2026-10-27T02:21:44.184Z – 2026-11-20T00:58:12.397Z

## Score
- Pass rate: 40.2% ± 5.3 (266/661 items); core 43.8%, stretch 26.3%
- Rank 65 of 79, tier 13 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 319, near_miss 67, length_cutoff 6, no_answer 2, loop 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 99634 total, 151 per item
- Wall time: 1223 s total, 1.9 s per item
- Generation speed: 94.9 tok/s
- Peak memory: 5.3 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 2/13 | 15.4% | 1218 | 15 | 82.8 | 5.0 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 8/12 | 66.7% | 112 | 3 | 52.3 | 5.0 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 11/12 | 91.7% ± 18.3 | 903 | 9 | 95.1 | 5.0 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 10/12 | 83.3% | 904 | 10 | 130.5 | 5.1 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 557 | 13 | 92.6 | 5.1 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 2/12 | 16.7% | 6120 | 56 | 113.4 | 5.1 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 11/35 | 31.4% ± 20.9 | 5107 | 53 | 97.0 | 5.1 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 8/26 | 30.8% ± 19.0 | 557 | 8 | 69.7 | 5.1 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 7/12 | 58.3% | 947 | 14 | 68.6 | 5.1 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 6/7 | 85.7% ± 35.0 | 76 | 2 | 60.0 | 5.1 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 7/26 | 26.9% ± 18.6 | 9535 | 93 | 102.4 | 5.1 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 7/36 | 19.4% | 6621 | 66 | 116.2 | 5.1 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 8/12 | 66.7% | 2199 | 27 | 80.3 | 5.1 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 6/10 | 60.0% ± 36.9 | 464 | 5 | 105.3 | 5.1 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 6/8 | 75.0% | 38 | 86 | 0.4 | 5.1 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 6/13 | 46.2% ± 31.4 | 438 | 5 | 102.0 | 5.1 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 3/9 | 33.3% | 325 | 6 | 50.5 | 5.1 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 454 | 5 | 100.3 | 5.1 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 8/9 | 88.9% | 399 | 8 | 52.6 | 5.1 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 2/29 | 6.9% ± 19.0 | 7189 | 71 | 104.9 | 5.1 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 124/316 | 39.2% ± 7.9 | 40922 | 509 | 112.3 | 5.3 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 1/12 | 8.3% | 6195 | 77 | 80.6 | 5.1 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 11/26 | 42.3% ± 24.2 | 8354 | 82 | 103.1 | 5.3 |
