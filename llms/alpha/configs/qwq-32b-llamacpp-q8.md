# qwq-32b-llamacpp-q8: Alpha challenge set

> QwQ-32B on llamacpp Q8_0, Apple M5 Max 128GB. Pass rate 72.8% ± 9.8 (95% CI), rank 40 of 110, tier 4. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: QwQ-32B (`Qwen/QwQ-32B-GGUF`)
- Runtime: llamacpp; versions: unknown
- Quant: Q8_0; temperature 0.6
- Variant (what sets it apart from the model's other rows): quant Q8_0
- Config hash: `76b121613899` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-24T04:00:41.668Z – 2026-06-29T16:50:37.216Z

## Score
- Pass rate: 72.8% ± 9.8 (123/169 items); core 82.9%, stretch 63.2%
- Rank 40 of 110, tier 4 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): execution_error 30, wrong 2

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 130420 total, 772 per item
- Wall time: 19851 s total, 117.5 s per item
- Generation speed: 12.5 tok/s
- Peak memory: 60.1 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 10/12 | 83.3% ± 24.7 | 13531 | 1349 | 13.0 | 50.9 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 3910 | 302 | 13.1 | 51.9 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 34/35 | 97.1% ± 5.6 | 46725 | 4156 | 12.2 | 54.5 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 16/26 | 61.5% ± 20.0 | 12006 | 899 | 13.5 | 54.8 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 1853 | 132 | 14.2 | 55.2 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 6/26 | 23.1% ± 27.0 | 12649 | 6759 | 12.3 | 60.0 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 5395 | 388 | 14.0 | 57.1 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 10597 | 759 | 14.0 | 58.1 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 3185 | 224 | 14.2 | 58.2 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 15/26 | 57.7% ± 34.5 | 20569 | 4882 | 11.1 | 60.1 |
