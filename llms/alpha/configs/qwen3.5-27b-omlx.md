# qwen3.5-27b-omlx: Alpha challenge set

> Qwen3.5-27B on omlx 4bit, Apple M5 Max 128GB. Pass rate 81.1% ± 8.6 (95% CI), rank 26 of 110, tier 3. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3.5-27B (`mlx-community/Qwen3.5-27B-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 1
- Variant (what sets it apart from the model's other rows): runtime omlx · t1
- Config hash: `0894764dbe3a` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `6805db5`
- Samples per item: 1; submitters: local
- Executed: 2026-10-27T07:17:32.770Z – 2026-10-27T11:31:02.698Z

## Score
- Pass rate: 81.1% ± 8.6 (137/169 items); core 93.9%, stretch 69.0%
- Rank 26 of 110, tier 3 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): thinking_truncated 25, wrong 7

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 476225 total, 2818 per item
- Wall time: 15410 s total, 91.2 s per item
- Generation speed: 30.9 tok/s
- Peak memory: 16.5 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 25502 | 819 | 31.1 | 16.4 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 22455 | 724 | 31.0 | 16.4 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 32/35 | 91.4% ± 12.1 | 87866 | 2848 | 30.8 | 16.4 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 21/26 | 80.8% ± 16.2 | 65310 | 2109 | 31.0 | 16.4 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 2433 | 79 | 30.9 | 16.4 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 12/26 | 46.2% ± 39.7 | 144529 | 4690 | 30.8 | 16.5 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 5474 | 176 | 31.2 | 16.5 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 9402 | 300 | 31.3 | 16.5 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 2277 | 73 | 31.3 | 16.5 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 16/26 | 61.5% ± 35.2 | 110977 | 3592 | 30.9 | 16.5 |
