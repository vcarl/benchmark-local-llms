# mistral-small-3.2-24b-mlx: Pre-release (draft)

> Mistral-Small-3.2-24B-Instruct-2506 on mlx 4bit, Apple M5 Max 128GB. Pass rate 68.5% ± 6.1 (95% CI), rank 49 of 79, tier 9. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Mistral-Small-3.2-24B-Instruct-2506 (`mlx-community/Mistral-Small-3.2-24B-Instruct-2506-4bit`)
- Runtime: mlx; versions: mlx-lm 0.31.3
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx · t0.7 · weights unknown
- Config hash: `fdc38ade1409fcbff485f120fa19b9a762f152f6d91925304a753952b760f8b0` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: `unknown` (prefix)
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `37f9f14`, `bfb5743`
- Samples per item: 1; submitters: local
- Executed: 2026-06-23T05:13:56.455Z – 2026-11-20T01:22:14.985Z

## Score
- Pass rate: 68.5% ± 6.1 (453/661 items); core 75.2%, stretch 42.1%
- Rank 49 of 79, tier 9 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 192, near_miss 14, loop 1, no_answer 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 66724 total, 101 per item
- Wall time: 2795 s total, 4.2 s per item
- Generation speed: 28.7 tok/s
- Peak memory: 12.9 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 3/13 | 23.1% | 2165 | 81 | 26.8 | 12.8 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 426 | 14 | 42.1 | 0.8 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 973 | 32 | 30.4 | 12.9 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 11/12 | 91.7% | 910 | 26 | 41.3 | 12.8 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 9/10 | 90.0% ± 22.6 | 564 | 19 | 30.0 | 12.9 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 7/12 | 58.3% | 5031 | 127 | 40.9 | 12.9 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 18/35 | 51.4% ± 24.5 | 4241 | 146 | 29.9 | 12.9 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 10/26 | 38.5% ± 20.0 | 546 | 21 | 26.2 | 12.9 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 1263 | 39 | 32.4 | 12.8 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 5/7 | 71.4% ± 45.1 | 72 | 3 | 28.2 | 12.9 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 10/26 | 38.5% ± 22.1 | 10493 | 376 | 28.1 | 12.9 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 18/36 | 50.0% | 2206 | 65 | 41.2 | 12.8 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 7/12 | 58.3% | 2109 | 77 | 27.3 | 12.8 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 9/10 | 90.0% ± 22.6 | 556 | 16 | 37.2 | 12.9 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 6/8 | 75.0% | 40 | 283 | 0.1 | 12.9 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 5/13 | 38.5% ± 30.6 | 562 | 16 | 42.2 | 12.8 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 2/9 | 22.2% | 572 | 26 | 22.2 | 12.9 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 3/4 | 75.0% | 525 | 16 | 33.0 | 12.9 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 392 | 22 | 17.9 | 12.9 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 4/29 | 13.8% ± 22.9 | 2399 | 69 | 38.4 | 12.9 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 261/316 | 82.6% ± 6.3 | 20009 | 887 | 38.2 | 12.9 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 2/12 | 16.7% | 712 | 101 | 20.9 | 12.9 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 18/26 | 69.2% ± 37.9 | 9958 | 333 | 30.0 | 12.9 |
