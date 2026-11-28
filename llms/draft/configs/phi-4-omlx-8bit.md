# phi-4-omlx-8bit: Pre-release (draft)

> phi-4 on omlx 8bit, Apple M5 Max 128GB. Pass rate 76.9% ± 5.6 (95% CI), rank 30 of 79, tier 7. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: phi-4 (`mlx-community/phi-4-8bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 8bit; temperature 0
- Variant (what sets it apart from the model's other rows): runtime omlx · t0
- Config hash: `9c7f731676afc6c5552b4daab6e79c1948fa45f617c10a0970927e4572bee4ac` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `3118b7b44ba9ef5056f99339e4d1bd2628bd791d`, `37f9f14`, `bfb5743`
- Samples per item: 1; submitters: local
- Executed: 2026-10-27T05:46:37.998Z – 2026-11-27T07:04:08.504Z

## Score
- Pass rate: 76.9% ± 5.6 (508/661 items); core 85.0%, stretch 44.4%
- Rank 30 of 79, tier 7 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 147, context_exceeded 4, near_miss 2

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 89696 total, 136 per item
- Wall time: 3050 s total, 4.6 s per item
- Generation speed: 32.4 tok/s
- Peak memory: 15.5 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 4/13 | 30.8% | 1588 | 63 | 25.2 | 15.2 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 674 | 22 | 36.9 | 15.2 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 958 | 30 | 32.4 | 15.2 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 873 | 29 | 36.2 | 15.2 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 9/10 | 90.0% ± 22.6 | 606 | 19 | 32.0 | 15.2 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 8/12 | 66.7% | 4282 | 125 | 35.3 | 15.3 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 18/35 | 51.4% ± 19.9 | 5169 | 156 | 33.5 | 15.3 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 10/26 | 38.5% ± 20.0 | 733 | 25 | 29.0 | 15.3 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 11/12 | 91.7% | 1129 | 54 | 21.1 | 15.3 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 46 | 3 | 21.0 | 15.3 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 11/26 | 42.3% ± 15.9 | 11560 | 345 | 33.6 | 15.3 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 21/36 | 58.3% | 6638 | 202 | 35.1 | 15.4 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 8/12 | 66.7% | 2406 | 93 | 25.8 | 15.3 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 527 | 17 | 33.6 | 15.4 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 3/8 | 37.5% | 89 | 22 | 5.3 | 15.2 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 9/13 | 69.2% ± 29.0 | 733 | 23 | 33.7 | 15.4 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 9/9 | 100.0% | 596 | 27 | 21.9 | 15.3 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 3/4 | 75.0% | 697 | 21 | 33.6 | 15.4 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 390 | 21 | 18.8 | 15.3 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 5/29 | 17.2% ± 20.5 | 6188 | 186 | 33.8 | 15.4 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 288/316 | 91.1% ± 5.1 | 26147 | 980 | 35.6 | 15.5 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 8/12 | 66.7% | 6534 | 257 | 25.4 | 15.3 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 21/26 | 80.8% ± 21.3 | 11133 | 333 | 33.6 | 15.5 |
