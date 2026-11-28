# magistral-small-2509-mlx: Pre-release (draft)

> Magistral-Small-2509 on mlx 4bit, Apple M5 Max 128GB. Pass rate 73.5% ± 6.2 (95% CI), rank 40 of 79, tier 8. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Magistral-Small-2509 (`lmstudio-community/Magistral-Small-2509-MLX-4bit`)
- Runtime: mlx; versions: mlx-lm 0.31.3
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx
- Config hash: `162a26d87ab0377daa1b5226de45278a7bd04ceeeb274cc720491a89dc5b1c49` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `a2dd98c1b74d6395abf3a4ae45d4ab238aacbfff`
- Samples per item: 1; submitters: local
- Executed: 2026-11-24T23:23:12.333Z – 2026-11-25T00:16:59.374Z

## Score
- Pass rate: 73.5% ± 6.2 (486/661 items); core 81.3%, stretch 42.9%
- Rank 40 of 79, tier 8 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 163, no_answer 5, near_miss 4, length_cutoff 2, loop 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 100904 total, 153 per item
- Wall time: 3274 s total, 5.0 s per item
- Generation speed: 38.2 tok/s
- Peak memory: 12.8 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 3/13 | 23.1% | 1794 | 47 | 40.7 | 12.7 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 63 | 4 | 53.9 | 12.7 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 935 | 25 | 41.3 | 12.7 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 979 | 28 | 41.1 | 12.7 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 499 | 14 | 41.7 | 12.7 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 4/12 | 33.3% | 5109 | 128 | 40.7 | 12.7 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 19/35 | 54.3% ± 19.7 | 6711 | 172 | 40.4 | 12.7 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 11/26 | 42.3% ± 20.4 | 8719 | 228 | 39.0 | 12.7 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 11/12 | 91.7% | 1261 | 34 | 41.0 | 12.7 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 43 | 2 | 51.8 | 12.7 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 11/26 | 42.3% ± 31.5 | 20802 | 533 | 39.4 | 12.7 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 16/36 | 44.4% | 2273 | 67 | 41.0 | 12.7 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 8/12 | 66.7% | 1373 | 36 | 41.1 | 12.7 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 8/10 | 80.0% ± 30.2 | 719 | 19 | 40.1 | 12.7 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 6/8 | 75.0% | 40 | 175 | 0.9 | 12.8 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 9/13 | 69.2% ± 29.0 | 706 | 22 | 41.7 | 12.8 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 7/9 | 77.8% | 517 | 16 | 41.4 | 12.8 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 404 | 11 | 41.2 | 12.8 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 395 | 14 | 41.4 | 12.8 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 4/29 | 13.8% ± 17.2 | 3646 | 224 | 40.5 | 12.8 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 287/316 | 90.8% ± 5.5 | 20783 | 850 | 37.2 | 12.8 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 1/12 | 8.3% | 768 | 25 | 40.9 | 12.8 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 17/26 | 65.4% ± 22.5 | 22365 | 599 | 37.6 | 12.8 |
