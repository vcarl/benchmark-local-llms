# qwen3-coder-30b-a3b-llamacpp: Alpha challenge set

> Qwen3-Coder-30B-A3B-Instruct on llamacpp Q8_0, Apple M5 Max 128GB. Pass rate 63.3% ± 7.8 (95% CI), rank 59 of 110, tier 5. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3-Coder-30B-A3B-Instruct (`unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF`)
- Runtime: llamacpp; versions: unknown
- Quant: Q8_0; temperature 0.7
- Config hash: `d48830bb55fd` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-25T06:02:49.161Z – 2026-06-29T05:50:10.918Z

## Score
- Pass rate: 63.3% ± 7.8 (107/169 items); core 76.8%, stretch 50.6%
- Rank 59 of 110, tier 5 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 49

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 32376 total, 192 per item
- Wall time: 422 s total, 2.5 s per item
- Generation speed: 79.7 tok/s
- Peak memory: 44.2 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 1070 | 12 | 95.7 | 42.7 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 454 | 6 | 96.6 | 42.7 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 18/35 | 51.4% ± 19.8 | 2373 | 31 | 84.5 | 42.8 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 15/26 | 57.7% ± 20.4 | 616 | 9 | 97.8 | 42.8 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 6/7 | 85.7% ± 35.0 | 83 | 1 | 101.4 | 42.8 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 12/26 | 46.2% ± 19.2 | 13566 | 178 | 77.4 | 43.5 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 9/10 | 90.0% ± 22.6 | 597 | 7 | 96.1 | 42.8 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 9/13 | 69.2% ± 29.0 | 503 | 6 | 96.8 | 43.1 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 735 | 8 | 95.2 | 43.1 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 14/26 | 53.8% ± 20.6 | 12379 | 164 | 77.0 | 44.2 |
