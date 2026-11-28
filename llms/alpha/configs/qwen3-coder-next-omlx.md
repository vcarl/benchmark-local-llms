# qwen3-coder-next-omlx: Alpha challenge set

> Qwen3-Coder-Next on omlx 4bit, Apple M5 Max 128GB. Pass rate 70.4% ± 8.3 (95% CI), rank 44 of 110, tier 4. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3-Coder-Next (`mlx-community/Qwen3-Coder-Next-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 1
- Variant (what sets it apart from the model's other rows): runtime omlx · t1 · topP 0.95 · topK 40
- Config hash: `e619d4c2e595` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `6805db5`
- Samples per item: 1; submitters: local
- Executed: 2026-10-27T02:02:10.414Z – 2026-10-27T02:15:32.455Z

## Score
- Pass rate: 70.4% ± 8.3 (119/169 items); core 80.5%, stretch 60.9%
- Rank 44 of 110, tier 4 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 36, length_cutoff 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 76737 total, 454 per item
- Wall time: 806 s total, 4.8 s per item
- Generation speed: 95.2 tok/s
- Peak memory: 34.4 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 1163 | 14 | 83.9 | 34.4 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 490 | 7 | 75.2 | 34.4 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 19/35 | 54.3% ± 25.9 | 2985 | 37 | 80.6 | 34.4 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 15/26 | 57.7% ± 20.4 | 522 | 9 | 55.5 | 34.4 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 36 | 1 | 24.2 | 34.4 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 12/26 | 46.2% ± 17.9 | 41814 | 429 | 97.4 | 34.4 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 445 | 6 | 71.9 | 34.4 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 10/13 | 76.9% ± 26.5 | 459 | 7 | 68.7 | 34.4 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 437 | 5 | 89.1 | 34.4 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 22/26 | 84.6% ± 11.1 | 28386 | 291 | 97.7 | 34.4 |
