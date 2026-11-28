# devstral-small-2-24b-mlx: Alpha challenge set

> Devstral-Small-2-24B-Instruct-2512 on mlx 4bit, Apple M5 Max 128GB. Pass rate 62.1% ± 8.1 (95% CI), rank 64 of 110, tier 5. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Devstral-Small-2-24B-Instruct-2512 (`mlx-community/Devstral-Small-2-24B-Instruct-2512-4bit`)
- Runtime: mlx; versions: mlx-lm 0.31.3, unknown
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx · t0.7
- Config hash: `8fd2eb03f523` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `2212237`, `unknown`
- Samples per item: 1; submitters: local
- Executed: 2026-06-24T08:38:56.027Z – 2026-11-17T12:37:38.361Z

## Score
- Pass rate: 62.1% ± 8.1 (105/169 items); core 73.2%, stretch 51.7%
- Rank 64 of 110, tier 5 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): wrong 46, length_cutoff 2

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 62660 total, 371 per item
- Wall time: 2446 s total, 14.5 s per item
- Generation speed: 28.3 tok/s
- Peak memory: 13.8 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 985 | 31 | 32.2 | 12.9 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 5/10 | 50.0% ± 37.7 | 461 | 15 | 31.0 | 12.9 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 18/35 | 51.4% ± 19.6 | 5765 | 227 | 25.4 | 12.9 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 15/26 | 57.7% ± 20.4 | 673 | 24 | 28.5 | 12.9 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 6/7 | 85.7% ± 35.0 | 46 | 3 | 17.3 | 12.9 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 8/26 | 30.8% ± 19.5 | 28445 | 1040 | 27.3 | 13.8 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 433 | 14 | 30.4 | 12.9 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 8/13 | 61.5% ± 30.6 | 491 | 16 | 30.2 | 12.9 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 531 | 16 | 33.4 | 12.9 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 19/26 | 73.1% ± 16.1 | 24830 | 1060 | 30.0 | 13.8 |
