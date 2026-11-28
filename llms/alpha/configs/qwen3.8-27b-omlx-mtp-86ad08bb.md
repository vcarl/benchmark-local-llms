# qwen3.8-27b-omlx-mtp: Alpha challenge set

> Qwen3.8-27B-MTP on omlx 4bit, Apple M5 Max 128GB. Pass rate 89.9% ± 6.2 (95% CI), rank 14 of 110, tier 2. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: Qwen3.8-27B-MTP (`~/.omlx/models/Qwen3.8-27B-4bit-MTP`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 1
- Variant (what sets it apart from the model's other rows): t1
- Config hash: `86ad08bb6e09` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `6805db5`
- Samples per item: 1; submitters: local
- Executed: 2026-10-27T19:22:57.297Z – 2026-10-27T21:40:20.135Z

## Score
- Pass rate: 89.9% ± 6.2 (152/169 items); core 93.9%, stretch 86.2%
- Rank 14 of 110, tier 2 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): thinking_truncated 14, wrong 3

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 244342 total, 1446 per item
- Wall time: 8345 s total, 49.4 s per item
- Generation speed: 30.3 tok/s
- Peak memory: 15.5 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 7474 | 243 | 30.8 | 15.4 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 6241 | 205 | 30.5 | 15.4 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 35/35 | 100.0% ± 0.0 | 14207 | 472 | 30.1 | 15.4 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 21/26 | 80.8% ± 16.2 | 69586 | 2567 | 30.3 | 15.5 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 506 | 18 | 27.9 | 15.5 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 15/26 | 57.7% ± 38.1 | 90359 | 2992 | 30.2 | 15.5 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 1299 | 45 | 29.0 | 15.5 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 1321 | 46 | 28.6 | 15.5 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 728 | 25 | 29.7 | 15.5 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 25/26 | 96.2% ± 8.9 | 52621 | 1732 | 30.4 | 15.5 |
