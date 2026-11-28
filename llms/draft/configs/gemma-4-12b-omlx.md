# gemma-4-12b-omlx: Pre-release (draft)

> gemma-4-12B-it on omlx 4bit, Apple M5 Max 128GB. Pass rate 92.1% ± 3.5 (95% CI), rank 15 of 79, tier 3. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: gemma-4-12B-it (`lmstudio-community/gemma-4-12B-it-MLX-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 1
- Config hash: `944415eb41833c4b7ee468d0d2ca8a591d29a6498586c97c3aa00d07222b554f` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `202a47057293316973f92bb38f36eba91d203de5`, `5653c862687d7fcb57406a72dd5cc3d3e715eccb`
- Samples per item: 1; submitters: local
- Executed: 2026-11-24T11:07:02.601Z – 2026-11-24T21:11:21.185Z

## Score
- Pass rate: 92.1% ± 3.5 (609/661 items); core 96.0%, stretch 76.7%
- Rank 15 of 79, tier 3 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 34, thinking_truncated 11, loop 7

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 1700891 total, 2573 per item
- Wall time: 31233 s total, 47.3 s per item
- Generation speed: 59.8 tok/s
- Peak memory: 11.1 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 10/13 | 76.9% | 86327 | 1470 | 59.0 | 8.2 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 4275 | 71 | 64.4 | 8.2 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 35353 | 586 | 60.9 | 8.2 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 36205 | 603 | 60.6 | 8.3 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 18611 | 308 | 61.2 | 8.3 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 11/12 | 91.7% | 167971 | 2850 | 59.2 | 8.6 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 34/35 | 97.1% ± 6.0 | 64756 | 1416 | 61.5 | 8.9 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 18/26 | 69.2% ± 19.0 | 73175 | 1319 | 60.4 | 9.7 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 10900 | 179 | 62.7 | 9.7 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 1025 | 17 | 67.7 | 9.7 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 17/26 | 65.4% ± 33.4 | 260053 | 4798 | 59.3 | 11.1 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 35/36 | 97.2% | 79863 | 1333 | 61.2 | 11.1 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 12/12 | 100.0% | 42626 | 696 | 61.8 | 11.1 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 2948 | 48 | 65.6 | 11.1 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 6/8 | 75.0% | 45389 | 913 | 56.7 | 11.1 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 7014 | 113 | 64.3 | 11.1 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 7/9 | 77.8% | 38148 | 1050 | 60.8 | 8.3 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 1989 | 33 | 62.6 | 11.1 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 19248 | 319 | 61.2 | 11.1 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 17/29 | 58.6% ± 54.4 | 394577 | 7592 | 58.8 | 11.1 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 309/316 | 97.8% ± 2.6 | 135182 | 2595 | 60.9 | 11.1 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 11/12 | 91.7% | 33702 | 558 | 61.4 | 11.1 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 21/26 | 80.8% ± 21.3 | 141554 | 2364 | 60.3 | 11.1 |
