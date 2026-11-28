# mistral-small-3.2-24b-mlx: Pre-release (draft)

> Mistral-Small-3.2-24B-Instruct-2506 on mlx 4bit, Apple M5 Max 128GB. Pass rate 71.4% ± 5.7 (95% CI), rank 47 of 79, tier 8. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Mistral-Small-3.2-24B-Instruct-2506 (`mlx-community/Mistral-Small-3.2-24B-Instruct-2506-4bit`)
- Runtime: mlx; versions: mlx-lm 0.31.3
- Quant: 4bit; temperature 0.15
- Variant (what sets it apart from the model's other rows): runtime mlx · t0.15 · weights c42dc21c568f
- Config hash: `091a1365d512d903f56ce1250390d2ab0a030f9105583823c8cf3ab3f454da9d` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: `c42dc21c568f` (prefix)
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `1ac5f98`
- Samples per item: 1; submitters: local
- Executed: 2026-11-20T15:10:15.212Z – 2026-11-20T15:51:54.074Z

## Score
- Pass rate: 71.4% ± 5.7 (472/661 items); core 78.2%, stretch 44.4%
- Rank 47 of 79, tier 8 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 180, near_miss 9

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 67957 total, 103 per item
- Wall time: 2255 s total, 3.4 s per item
- Generation speed: 38.8 tok/s
- Peak memory: 12.9 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 3/13 | 23.1% | 2175 | 57 | 40.7 | 12.8 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 402 | 12 | 42.2 | 12.8 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 1002 | 27 | 41.5 | 12.8 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 893 | 26 | 41.4 | 12.8 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 558 | 15 | 41.8 | 12.8 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 6/12 | 50.0% | 4931 | 123 | 40.9 | 12.8 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 19/35 | 54.3% ± 15.6 | 5053 | 130 | 40.8 | 12.8 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 13/26 | 50.0% ± 20.6 | 581 | 18 | 43.1 | 12.8 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 1263 | 34 | 41.2 | 12.8 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 5/7 | 71.4% ± 45.1 | 60 | 3 | 48.1 | 12.8 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 11/26 | 42.3% ± 24.0 | 10500 | 264 | 40.5 | 12.8 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 20/36 | 55.6% | 2200 | 65 | 41.3 | 12.8 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 9/12 | 75.0% | 1834 | 47 | 41.2 | 12.8 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 9/10 | 90.0% ± 22.6 | 523 | 14 | 40.2 | 12.8 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 6/8 | 75.0% | 40 | 178 | 0.9 | 12.9 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 7/13 | 53.8% ± 31.4 | 727 | 22 | 41.8 | 12.9 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 2/9 | 22.2% | 491 | 15 | 41.6 | 12.9 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 3/4 | 75.0% | 518 | 13 | 41.3 | 12.9 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 388 | 14 | 41.6 | 12.9 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 5/29 | 17.2% ± 20.5 | 2767 | 74 | 41.0 | 12.9 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 269/316 | 85.1% ± 5.8 | 19919 | 816 | 37.4 | 12.9 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 2/12 | 16.7% | 786 | 25 | 41.1 | 12.9 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 18/26 | 69.2% ± 29.5 | 10346 | 260 | 40.6 | 12.9 |
