# deepseek-r1-qwen3-8b-omlx: Alpha challenge set

> DeepSeek-R1-0528-Qwen3-8B on omlx 4bit, Apple M5 Max 128GB. Pass rate 73.4% ± 8.3 (95% CI), rank 39 of 110, tier 4. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: DeepSeek-R1-0528-Qwen3-8B (`mlx-community/DeepSeek-R1-0528-Qwen3-8B-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 0.6
- Variant (what sets it apart from the model's other rows): runtime omlx · maxTokens 32768
- Config hash: `7ada8f1796ee` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `6805db5`, `7221ba3`
- Samples per item: 1; submitters: local
- Executed: 2026-10-23T12:37:17.015Z – 2026-10-28T05:08:25.488Z

## Score
- Pass rate: 73.4% ± 8.3 (124/169 items); core 68.3%, stretch 78.2%
- Rank 39 of 110, tier 4 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 13, thinking_truncated 7

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 1209799 total, 7159 per item
- Wall time: 15851 s total, 93.8 s per item
- Generation speed: 76.3 tok/s
- Peak memory: 6.8 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 9/12 | 75.0% ± 28.7 | 38686 | 449 | 86.1 | 5.2 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 6/10 | 60.0% ± 36.9 | 11060 | 119 | 92.6 | 5.2 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 30/35 | 85.7% ± 18.1 | 219104 | 2593 | 84.5 | 5.2 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 8/26 | 30.8% ± 19.0 | 59153 | 655 | 90.4 | 5.3 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 3082 | 32 | 95.8 | 5.3 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 18/26 | 69.2% ± 39.1 | 514571 | 7315 | 70.3 | 5.7 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 9/10 | 90.0% ± 22.6 | 29385 | 319 | 92.2 | 5.8 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 18965 | 198 | 95.8 | 5.8 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 3682 | 38 | 96.9 | 5.8 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 20/26 | 76.9% ± 27.4 | 312111 | 4133 | 75.5 | 6.8 |
