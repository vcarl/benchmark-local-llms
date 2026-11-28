# mistral-small-3.2-24b-llamacpp: Alpha challenge set

> Mistral-Small-3.2-24B-Instruct-2506 on llamacpp Q6_K, Apple M5 Max 128GB. Pass rate 62.7% ± 8.2 (95% CI), rank 62 of 110, tier 5. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Mistral-Small-3.2-24B-Instruct-2506 (`bartowski/mistralai_Mistral-Small-3.2-24B-Instruct-2506-GGUF`)
- Runtime: llamacpp; versions: unknown
- Quant: Q6_K; temperature 0.7
- Config hash: `f2f422177412` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-24T08:27:19.093Z – 2026-07-02T00:11:58.195Z

## Score
- Pass rate: 62.7% ± 8.2 (106/169 items); core 70.7%, stretch 55.2%
- Rank 62 of 110, tier 5 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 47

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 30684 total, 182 per item
- Wall time: 1647 s total, 9.7 s per item
- Generation speed: 19.1 tok/s
- Peak memory: 31.1 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 1000 | 47 | 23.0 | 28.5 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 7/10 | 70.0% ± 34.6 | 525 | 25 | 23.0 | 28.7 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 17/35 | 48.6% ± 17.9 | 3205 | 147 | 22.8 | 28.8 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 13/26 | 50.0% ± 20.6 | 521 | 25 | 24.8 | 28.8 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 6/7 | 85.7% ± 35.0 | 64 | 3 | 27.1 | 28.8 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 13/26 | 50.0% ± 28.8 | 12725 | 712 | 18.1 | 30.0 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 8/10 | 80.0% ± 30.2 | 366 | 18 | 23.0 | 29.0 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 8/13 | 61.5% ± 30.6 | 767 | 36 | 22.3 | 29.1 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 566 | 27 | 21.7 | 29.2 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 18/26 | 69.2% ± 26.1 | 10945 | 607 | 18.3 | 31.1 |
