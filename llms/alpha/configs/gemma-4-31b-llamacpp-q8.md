# gemma-4-31b-llamacpp-q8: Alpha challenge set

> gemma-4-31B-it on llamacpp Q8_0, Apple M5 Max 128GB. Pass rate 91.7% ± 5.3 (95% CI), rank 11 of 110, tier 1. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: gemma-4-31B-it (`unsloth/gemma-4-31B-it-GGUF`)
- Runtime: llamacpp; versions: unknown
- Quant: Q8_0; temperature 0.7
- Variant (what sets it apart from the model's other rows): quant Q8_0
- Config hash: `89727c8eccfb` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-25T18:12:53.072Z – 2026-07-01T15:01:19.828Z

## Score
- Pass rate: 91.7% ± 5.3 (155/169 items); core 95.1%, stretch 88.5%
- Rank 11 of 110, tier 1 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): execution_error 6, wrong 4

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 113647 total, 672 per item
- Wall time: 11027 s total, 65.2 s per item
- Generation speed: 12.5 tok/s
- Peak memory: 54.0 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 8248 | 643 | 13.0 | 46.5 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 9367 | 728 | 13.0 | 50.4 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 35/35 | 100.0% ± 0.0 | 22201 | 1815 | 12.4 | 52.7 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 24/26 | 92.3% ± 11.0 | 8685 | 694 | 12.8 | 54.0 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 780 | 63 | 13.3 | 54.0 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 21/26 | 80.8% ± 29.1 | 28170 | 3673 | 11.5 | 54.0 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 2454 | 193 | 13.2 | 54.0 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 4323 | 337 | 13.1 | 54.0 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 1729 | 135 | 13.0 | 54.0 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 21/26 | 80.8% ± 21.3 | 27690 | 2746 | 13.1 | 54.0 |
