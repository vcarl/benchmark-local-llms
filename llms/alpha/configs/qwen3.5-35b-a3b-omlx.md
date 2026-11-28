# qwen3.5-35b-a3b-omlx: Alpha challenge set

> Qwen3.5-35B-A3B on omlx 4bit, Apple M5 Max 128GB. Pass rate 76.9% ± 9.9 (95% CI), rank 33 of 110, tier 4. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3.5-35B-A3B (`mlx-community/Qwen3.5-35B-A3B-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 1
- Variant (what sets it apart from the model's other rows): runtime omlx · t1
- Config hash: `ab95d349b6a8` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `6805db5`
- Samples per item: 1; submitters: local
- Executed: 2026-10-27T02:50:13.911Z – 2026-10-27T03:58:09.979Z

## Score
- Pass rate: 76.9% ± 9.9 (130/169 items); core 89.0%, stretch 65.5%
- Rank 33 of 110, tier 4 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): thinking_truncated 29, wrong 9, length_cutoff 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 541427 total, 3204 per item
- Wall time: 4085 s total, 24.2 s per item
- Generation speed: 132.6 tok/s
- Peak memory: 9.1 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 45238 | 331 | 136.5 | 9.1 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 27629 | 206 | 134.0 | 9.1 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 31/35 | 88.6% ± 24.0 | 70819 | 530 | 133.5 | 9.1 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 17/26 | 65.4% ± 19.6 | 101094 | 758 | 133.4 | 9.1 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 2043 | 16 | 130.8 | 9.1 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 11/26 | 42.3% ± 45.7 | 162250 | 1240 | 130.9 | 9.1 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 6093 | 45 | 134.6 | 9.1 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 8916 | 66 | 135.7 | 9.1 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 1927 | 14 | 134.9 | 9.1 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 15/26 | 57.7% ± 31.7 | 115418 | 879 | 131.4 | 9.1 |
