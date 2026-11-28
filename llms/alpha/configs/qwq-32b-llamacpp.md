# qwq-32b-llamacpp: Alpha challenge set

> QwQ-32B on llamacpp Q6_K, Apple M5 Max 128GB. Pass rate 74.6% ± 8.9 (95% CI), rank 37 of 110, tier 4. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: QwQ-32B (`Qwen/QwQ-32B-GGUF`)
- Runtime: llamacpp; versions: unknown
- Quant: Q6_K; temperature 0.6
- Variant (what sets it apart from the model's other rows): quant Q6_K
- Config hash: `a0051e15714a` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-23T01:09:08.766Z – 2026-06-29T10:02:37.287Z

## Score
- Pass rate: 74.6% ± 8.9 (126/169 items); core 81.7%, stretch 67.8%
- Rank 37 of 110, tier 4 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): execution_error 27, wrong 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 147983 total, 876 per item
- Wall time: 18603 s total, 110.1 s per item
- Generation speed: 14.2 tok/s
- Peak memory: 53.0 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 11/12 | 91.7% ± 18.3 | 14778 | 1066 | 13.9 | 43.5 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 9/10 | 90.0% ± 22.6 | 5155 | 360 | 14.4 | 44.5 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 34/35 | 97.1% ± 6.0 | 50325 | 3842 | 14.3 | 47.9 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 13/26 | 50.0% ± 20.6 | 11392 | 759 | 15.1 | 47.4 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 1718 | 115 | 15.2 | 47.7 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 9/26 | 34.6% ± 29.9 | 19150 | 6507 | 13.9 | 53.0 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 6914 | 457 | 15.2 | 50.0 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 10159 | 706 | 14.5 | 50.8 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 3313 | 250 | 13.3 | 50.8 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 16/26 | 61.5% ± 32.5 | 25079 | 4541 | 13.8 | 53.0 |
