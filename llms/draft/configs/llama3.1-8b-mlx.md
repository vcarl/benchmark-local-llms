# llama3.1-8b-mlx: Pre-release (draft)

> Meta-Llama-3.1-8B-Instruct on mlx 4bit, Apple M5 Max 128GB. Pass rate 40.7% ± 5.9 (95% CI), rank 64 of 79, tier 12. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Meta-Llama-3.1-8B-Instruct (`mlx-community/Meta-Llama-3.1-8B-Instruct-4bit`)
- Runtime: mlx; versions: mlx-lm 0.31.3
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx · t0.7 · topP default
- Config hash: `d40db8c949d25b4dc1e33a21e772caaeed54c557d820510b6221d49fa388b98d` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `37f9f14`, `bfb5743`
- Samples per item: 1; submitters: local
- Executed: 2026-06-20T22:16:46.195Z – 2026-11-20T00:49:45.141Z

## Score
- Pass rate: 40.7% ± 5.9 (269/661 items); core 44.3%, stretch 26.3%
- Rank 64 of 79, tier 12 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 325, near_miss 49, loop 10, length_cutoff 6, no_answer 2

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 85846 total, 130 per item
- Wall time: 1148 s total, 1.7 s per item
- Generation speed: 94.0 tok/s
- Peak memory: 4.6 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 2/13 | 15.4% | 298 | 11 | 67.8 | 4.4 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 7/12 | 58.3% | 102 | 3 | 36.1 | 1.4 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 827 | 9 | 87.9 | 4.5 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 10/12 | 83.3% | 962 | 11 | 87.9 | 1.6 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 7/10 | 70.0% ± 34.6 | 557 | 7 | 83.2 | 4.5 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 1/12 | 8.3% | 6786 | 81 | 110.3 | 4.6 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 12/35 | 34.3% ± 22.0 | 3819 | 42 | 90.6 | 4.6 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 7/26 | 26.9% ± 18.3 | 572 | 9 | 64.8 | 4.5 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 6/12 | 50.0% | 969 | 10 | 95.2 | 4.6 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 6/7 | 85.7% ± 35.0 | 45 | 2 | 25.2 | 4.5 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 8/26 | 30.8% ± 23.2 | 8775 | 92 | 95.6 | 4.6 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 6/36 | 16.7% | 5101 | 51 | 99.7 | 4.6 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 9/12 | 75.0% | 2189 | 21 | 105.2 | 4.6 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 6/10 | 60.0% ± 36.9 | 501 | 6 | 83.1 | 4.5 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 7/8 | 87.5% | 108 | 62 | 1.7 | 4.6 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 6/13 | 46.2% ± 31.4 | 587 | 7 | 83.4 | 1.7 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 2/9 | 22.2% | 651 | 7 | 95.1 | 4.6 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 620 | 7 | 93.6 | 4.5 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 370 | 5 | 67.4 | 4.6 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 0/29 | 0.0% ± 0.0 | 5332 | 85 | 97.5 | 4.6 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 129/316 | 40.8% ± 9.2 | 31807 | 451 | 108.6 | 4.6 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 3/12 | 25.0% | 5828 | 68 | 104.3 | 4.6 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 10/26 | 38.5% ± 27.6 | 9040 | 101 | 97.6 | 4.6 |
