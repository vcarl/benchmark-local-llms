# qwen3.6-35b-a3b-omlx: Pre-release (draft)

> Qwen3.6-35B-A3B on omlx 4bit, Apple M5 Max 128GB. Pass rate 92.6% ± 2.8 (95% CI), rank 12 of 79, tier 3. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Qwen3.6-35B-A3B (`mlx-community/Qwen3.6-35B-A3B-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 1
- Variant (what sets it apart from the model's other rows): runtime omlx · t1 · maxTokens 32768 · topP 0.95 · topK 20 · minP 0 · presencePenalty 1.5 · chatTemplateKwargs default · weights 8d52271ea750
- Config hash: `e0989fcf6aee7306f2321316dc9556f71fee95fe1cd70ed6d922b1765766eac0` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: `8d52271ea750` (prefix)
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `24293fca8cc099ba678d026f6de5800e0ee59c73`
- Samples per item: 1; submitters: local
- Executed: 2026-11-23T16:05:18.795Z – 2026-11-23T19:11:05.133Z

## Score
- Pass rate: 92.6% ± 2.8 (612/661 items); core 94.7%, stretch 84.2%
- Rank 12 of 79, tier 3 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 37, loop 10, thinking_truncated 2

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 1336975 total, 2023 per item
- Wall time: 11266 s total, 17.0 s per item
- Generation speed: 132.9 tok/s
- Peak memory: 9.2 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 11/13 | 84.6% | 30226 | 227 | 135.3 | 9.1 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 8171 | 61 | 142.3 | 9.1 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 30986 | 227 | 138.7 | 9.1 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 11/12 | 91.7% | 67617 | 646 | 134.4 | 9.1 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 18069 | 133 | 139.0 | 9.1 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 12/12 | 100.0% | 56663 | 417 | 137.0 | 9.1 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 35/35 | 100.0% ± 0.0 | 71456 | 532 | 136.9 | 9.1 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 20/26 | 76.9% ± 17.4 | 37226 | 273 | 140.1 | 9.1 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 21296 | 157 | 139.3 | 9.1 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 1601 | 13 | 147.7 | 9.1 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 20/26 | 76.9% ± 22.5 | 230143 | 1815 | 127.4 | 9.1 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 31/36 | 86.1% | 56213 | 540 | 132.2 | 9.1 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 11/12 | 91.7% | 19064 | 143 | 137.0 | 9.1 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 6676 | 50 | 141.3 | 9.1 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 6/8 | 75.0% | 4466 | 80 | 119.1 | 9.2 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 9120 | 70 | 137.6 | 9.2 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 8/9 | 88.9% | 61107 | 699 | 130.4 | 9.2 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 9065 | 67 | 136.7 | 9.2 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 4/9 | 44.4% | 21946 | 446 | 132.9 | 9.2 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 18/29 | 62.1% ± 38.2 | 212741 | 1660 | 128.7 | 9.2 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 308/316 | 97.5% ± 2.2 | 173253 | 1562 | 139.3 | 9.2 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 12/12 | 100.0% | 54887 | 415 | 133.8 | 9.2 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 25/26 | 96.2% ± 8.9 | 134983 | 1035 | 131.5 | 9.2 |
