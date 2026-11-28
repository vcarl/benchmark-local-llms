# lfm3-1.7b-q4km-llamacpp: Alpha challenge set

> LFM3-1.7B on llamacpp Q4_K_M, Apple M5 Max 128GB. Pass rate 77.5% ± 6.6 (95% CI), rank 31 of 110, tier 4. Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20.

## Config
- Model: LFM3-1.7B (`LiquidAI/LFM3-1.7B-GGUF`)
- Runtime: llamacpp; versions: llama.cpp b12359 (b1b770d90)
- Quant: Q4_K_M; temperature 0.1
- Variant (what sets it apart from the model's other rows): quant Q4_K_M
- Config hash: `76ecc5570626` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfe`)
- Harness commits: `ee21948`
- Samples per item: 1; submitters: local
- Executed: 2026-11-18T01:02:52.538Z – 2026-11-18T02:41:19.267Z

## Score
- Pass rate: 77.5% ± 6.6 (131/169 items); core 74.4%, stretch 80.5%
- Rank 31 of 110, tier 4 on the [leaderboard](https://vcarl.com/evals/llms/alpha/leaderboard.md)
- Completeness: complete; challenges 10/10, items 169/169
- Failures (sample lines): thinking_truncated 6, wrong 4

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 1068763 total, 6324 per item
- Wall time: 6035 s total, 35.7 s per item
- Generation speed: 177.3 tok/s
- Peak memory: 8.7 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 19947 | 109 | 184.6 | 1.7 |
| [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 12193 | 70 | 175.8 | 1.9 |
| [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) | scored | 32/35 | 91.4% ± 7.6 | 165438 | 954 | 173.7 | 3.0 |
| [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) | scored | 6/26 | 23.1% ± 17.4 | 125290 | 687 | 182.7 | 3.9 |
| [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 773 | 5 | 183.5 | 3.9 |
| [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) | scored | 17/26 | 65.4% ± 27.5 | 488094 | 2746 | 177.8 | 6.9 |
| [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 4129 | 22 | 187.9 | 7.1 |
| [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 2791 | 15 | 188.2 | 7.2 |
| [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) | scored | 3/4 | 75.0% | 2235 | 12 | 188.2 | 7.2 |
| [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) | scored | 21/26 | 80.8% ± 16.2 | 247873 | 1415 | 175.4 | 8.7 |
