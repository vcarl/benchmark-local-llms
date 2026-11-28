# qwen3.8-flash-next-llamacpp: Pre-release (draft)

> Qwen3.8-Flash-Next on llamacpp UD-IQ4_XS, Apple M5 Max 128GB. Pass rate 98.2% ± 1.7 (95% CI), rank 1 of 79, tier 1. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Qwen3.8-Flash-Next (`unsloth/Qwen3.8-Flash-Next-GGUF`)
- Runtime: llamacpp; versions: llama.cpp b12359 (b1b770d90)
- Quant: UD-IQ4_XS; temperature 1
- Config hash: `18973ae53c1d65b68fd462f937d171148e0dfcb68ac1ba0060bb29b130c268e6` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `53e766a255bd3d23183ae86c6387b706b90bbe03`
- Samples per item: 1; submitters: local
- Executed: 2026-11-23T00:53:36.138Z – 2026-11-23T04:42:08.124Z

## Score
- Pass rate: 98.2% ± 1.7 (649/661 items); core 99.1%, stretch 94.7%
- Rank 1 of 79, tier 1 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): thinking_truncated 6, wrong 5, no_answer 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 625171 total, 946 per item
- Wall time: 13793 s total, 20.9 s per item
- Generation speed: 48.0 tok/s
- Peak memory: 89.8 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 13/13 | 100.0% | 44943 | 984 | 45.9 | 68.1 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 3497 | 86 | 42.7 | 71.6 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 4116 | 99 | 43.1 | 74.5 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 3402 | 79 | 46.0 | 74.9 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 4149 | 88 | 48.5 | 75.7 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 12/12 | 100.0% | 17882 | 374 | 48.2 | 76.3 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 35/35 | 100.0% ± 0.0 | 10350 | 222 | 48.6 | 76.9 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 22/26 | 84.6% ± 14.9 | 26850 | 550 | 49.3 | 79.3 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 5119 | 108 | 49.7 | 79.7 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 630 | 14 | 49.8 | 79.8 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 25/26 | 96.2% ± 9.4 | 114871 | 2403 | 48.0 | 83.2 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 35/36 | 97.2% | 20109 | 432 | 48.4 | 83.4 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 12/12 | 100.0% | 5067 | 107 | 48.8 | 83.8 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 1030 | 23 | 48.7 | 83.8 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 8/8 | 100.0% | 10242 | 395 | 47.2 | 86.4 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 1231 | 28 | 48.7 | 86.4 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 9/9 | 100.0% | 12918 | 266 | 49.1 | 86.4 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 511 | 11 | 49.7 | 86.4 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 2778 | 62 | 49.4 | 86.4 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 24/29 | 82.8% ± 47.5 | 234969 | 4922 | 47.8 | 86.4 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 316/316 | 100.0% ± 0.0 | 66402 | 1833 | 49.0 | 89.4 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 12/12 | 100.0% | 7167 | 152 | 49.4 | 89.4 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 25/26 | 96.2% ± 8.9 | 26938 | 556 | 49.1 | 89.8 |
