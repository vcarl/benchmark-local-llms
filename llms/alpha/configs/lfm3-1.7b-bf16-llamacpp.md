# lfm3-1.7b-bf16-llamacpp: Alpha challenge set

> LFM3-1.7B on llamacpp BF16, Apple M5 Max 128GB. Pass rate 40.2% ± 11.8 (95% CI), rank 87 of 110, tier 7. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: LFM3-1.7B (`LiquidAI/LFM3-1.7B-GGUF`)
- Runtime: llamacpp; versions: llama.cpp b12359 (b1b770d90)
- Quant: BF16; temperature 0.1
- Variant (what sets it apart from the model's other rows): quant BF16
- Config hash: `fbfe17c48265` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `ee21948`
- Samples per item: 1; submitters: local
- Executed: 2026-11-18T02:44:26.240Z – 2026-11-18T03:33:09.513Z

## Score
- Pass rate: 40.2% ± 11.8 (68/169 items); core 41.5%, stretch 39.1%
- Rank 87 of 110, tier 7 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: partial; challenges 5/10, items 90/169
- Failures (sample lines): none

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 315963 total, 3511 per item
- Wall time: 2896 s total, 32.2 s per item
- Generation speed: 109.3 tok/s
- Peak memory: 6.0 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 19016 | 175 | 109.2 | 3.9 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 18082 | 167 | 108.5 | 4.0 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 34/35 | 97.1% ± 6.6 | 171806 | 1585 | 108.5 | 5.3 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 5/26 | 19.2% ± 16.2 | 106108 | 960 | 110.6 | 6.0 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 951 | 9 | 111.3 | 6.0 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | interrupted | 0/26 | 0.0% ± 0.0 | — | — | — | — |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | not_run | 0/10 | 0.0% ± 0.0 | — | — | — | — |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | not_run | 0/13 | 0.0% ± 0.0 | — | — | — | — |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | not_run | 0/4 | 0.0% | — | — | — | — |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | not_run | 0/26 | 0.0% ± 0.0 | — | — | — | — |
