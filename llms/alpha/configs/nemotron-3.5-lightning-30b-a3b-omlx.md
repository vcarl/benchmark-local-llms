# nemotron-3.5-lightning-30b-a3b-omlx: Alpha challenge set

> NVIDIA-Nemotron-3.5-Lightning-30B-A3B on omlx 4bit, Apple M5 Max 128GB. Pass rate 88.8% ± 6.4 (95% CI), rank 15 of 110, tier 2. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: NVIDIA-Nemotron-3.5-Lightning-30B-A3B (`mlx-community/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 1
- Config hash: `bd690b9b7e8e` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `94de7a9`
- Samples per item: 1; submitters: local
- Executed: 2026-10-28T15:01:33.715Z – 2026-10-28T15:57:22.893Z

## Score
- Pass rate: 88.8% ± 6.4 (150/169 items); core 89.0%, stretch 88.5%
- Rank 15 of 110, tier 2 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): loop 5, wrong 3, thinking_truncated 2

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 409024 total, 2420 per item
- Wall time: 3354 s total, 19.8 s per item
- Generation speed: 150.5 tok/s
- Peak memory: 17.5 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 10120 | 65 | 155.9 | 17.4 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 9/10 | 90.0% ± 22.6 | 26350 | 171 | 153.8 | 17.5 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 34/35 | 97.1% ± 6.0 | 27809 | 181 | 154.0 | 17.5 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 18/26 | 69.2% ± 19.0 | 20606 | 133 | 155.3 | 17.5 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 1449 | 10 | 149.8 | 17.5 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 17/26 | 65.4% ± 34.2 | 186347 | 1890 | 148.5 | 17.5 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 2950 | 20 | 150.6 | 17.5 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 3791 | 25 | 151.6 | 17.5 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 4/4 | 100.0% | 2699 | 17 | 154.9 | 17.5 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 26/26 | 100.0% ± 0.0 | 126903 | 842 | 150.7 | 17.5 |
