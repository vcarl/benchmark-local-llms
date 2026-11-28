# qwen3.5-9b-omlx: Alpha challenge set

> Qwen3.5-9B on omlx 4bit, Apple M5 Max 128GB. Pass rate 81.1% ± 7.6 (95% CI), rank 27 of 110, tier 3. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3.5-9B (`mlx-community/Qwen3.5-9B-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 1
- Variant (what sets it apart from the model's other rows): runtime omlx · t1 · maxTokens 32768
- Config hash: `a4f0c339d8df` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `7221ba3`
- Samples per item: 1; submitters: local
- Executed: 2026-10-23T07:01:56.659Z – 2026-10-23T12:21:47.448Z

## Score
- Pass rate: 81.1% ± 7.6 (137/169 items); core 87.8%, stretch 74.7%
- Rank 27 of 110, tier 3 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): thinking_truncated 22, wrong 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 1655037 total, 9793 per item
- Wall time: 19575 s total, 115.8 s per item
- Generation speed: 86.7 tok/s
- Peak memory: 6.8 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 11/12 | 91.7% ± 18.3 | 88396 | 1000 | 88.4 | 6.7 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 52993 | 581 | 91.2 | 6.7 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 33/35 | 94.3% ± 12.0 | 329911 | 3773 | 87.4 | 6.8 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 17/26 | 65.4% ± 19.6 | 180570 | 2093 | 90.3 | 6.8 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 3053 | 34 | 91.1 | 6.8 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 13/26 | 50.0% ± 38.0 | 583244 | 6860 | 85.0 | 6.8 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 9738 | 105 | 92.8 | 6.8 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 16748 | 181 | 92.6 | 6.8 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 6598 | 71 | 93.0 | 6.8 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 19/26 | 73.1% ± 16.1 | 383786 | 4877 | 85.5 | 6.8 |
