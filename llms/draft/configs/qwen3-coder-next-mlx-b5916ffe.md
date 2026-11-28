# qwen3-coder-next-mlx: Pre-release (draft)

> Qwen3-Coder-Next on mlx 4bit, Apple M5 Max 128GB. Pass rate 76.9% ± 6.0 (95% CI), rank 31 of 79, tier 7. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Qwen3-Coder-Next (`mlx-community/Qwen3-Coder-Next-4bit`)
- Runtime: mlx; versions: mlx-lm 0.31.3
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx · t0.7 · topP default · topK default · weights unknown
- Config hash: `b5916ffe972506d4bcec0efa28ca04d6674819876969ba56dc62a7a9ec923099` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: `unknown` (prefix)
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `37f9f14`, `bfb5743`
- Samples per item: 1; submitters: local
- Executed: 2026-06-24T02:50:27.327Z – 2026-11-20T01:03:19.283Z

## Score
- Pass rate: 76.9% ± 6.0 (508/661 items); core 84.1%, stretch 48.1%
- Rank 31 of 79, tier 7 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 141, near_miss 6, no_answer 4, length_cutoff 2

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 152865 total, 231 per item
- Wall time: 1978 s total, 3.0 s per item
- Generation speed: 85.3 tok/s
- Peak memory: 42.2 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 6/13 | 46.2% | 7127 | 122 | 58.6 | 8.9 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 8/12 | 66.7% | 213 | 5 | 41.1 | 8.9 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 1111 | 19 | 58.6 | 42.1 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 927 | 14 | 68.0 | 8.9 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 495 | 7 | 72.9 | 42.2 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 12/12 | 100.0% | 29095 | 304 | 97.7 | 42.0 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 18/35 | 51.4% ± 24.5 | 2238 | 39 | 68.1 | 42.2 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 15/26 | 57.7% ± 20.4 | 504 | 10 | 53.0 | 42.2 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 1199 | 16 | 74.5 | 1.2 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 39 | 2 | 40.1 | 42.2 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 13/26 | 50.0% ± 14.4 | 36647 | 386 | 95.6 | 42.2 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 14/36 | 38.9% | 2149 | 35 | 62.0 | 8.9 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 11/12 | 91.7% | 1486 | 18 | 84.6 | 42.0 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 384 | 6 | 76.4 | 42.2 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 6/8 | 75.0% | 40 | 62 | 0.6 | 42.1 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 10/13 | 76.9% ± 26.5 | 428 | 7 | 101.2 | 42.0 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 7/9 | 77.8% | 522 | 8 | 65.4 | 42.1 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 507 | 6 | 88.6 | 42.2 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 461 | 9 | 53.8 | 42.1 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 2/29 | 6.9% ± 11.5 | 3225 | 42 | 76.4 | 42.1 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 285/316 | 90.2% ± 5.0 | 17052 | 364 | 85.2 | 42.0 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 5/12 | 41.7% | 1961 | 25 | 79.8 | 42.1 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 22/26 | 84.6% ± 17.7 | 45055 | 474 | 95.3 | 42.2 |
