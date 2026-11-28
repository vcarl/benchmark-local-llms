# phi-4-llamacpp: Pre-release (draft)

> phi-4 on llamacpp Q8_0, Apple M5 Max 128GB. Pass rate 73.5% ± 5.9 (95% CI), rank 42 of 79, tier 8. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: phi-4 (`unsloth/phi-4-GGUF`)
- Runtime: llamacpp; versions: llama.cpp b12359 (b1b770d90)
- Quant: Q8_0; temperature 0.7
- Config hash: `e15b42b455be2163e34851e1603cb93aa6e10f71483f6f3ce9a641d91b73c86b` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `1ac5f98`, `2720d72`
- Samples per item: 1; submitters: local
- Executed: 2026-11-20T12:12:53.642Z – 2026-11-20T20:16:17.762Z

## Score
- Pass rate: 73.5% ± 5.9 (486/661 items); core 81.4%, stretch 42.1%
- Rank 42 of 79, tier 8 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 164, context_exceeded 4, near_miss 4, no_answer 3

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 89546 total, 135 per item
- Wall time: 2992 s total, 4.5 s per item
- Generation speed: 33.4 tok/s
- Peak memory: 27.5 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 4/13 | 30.8% | 1701 | 51 | 34.3 | 16.1 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 601 | 19 | 33.7 | 16.5 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 958 | 29 | 34.2 | 16.7 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 11/12 | 91.7% | 910 | 29 | 33.6 | 17.0 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 555 | 17 | 33.5 | 17.3 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 5/12 | 41.7% | 4764 | 144 | 33.3 | 17.8 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 19/35 | 54.3% ± 23.3 | 5329 | 163 | 33.3 | 18.7 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 11/26 | 42.3% ± 20.4 | 874 | 28 | 33.4 | 18.9 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 9/12 | 75.0% | 1140 | 36 | 33.4 | 19.2 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 53 | 2 | 32.3 | 19.2 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 10/26 | 38.5% ± 22.1 | 12137 | 366 | 33.4 | 20.7 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 19/36 | 52.8% | 5972 | 184 | 33.4 | 21.9 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 4/12 | 33.3% | 2518 | 76 | 33.4 | 22.4 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 639 | 20 | 33.3 | 22.6 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 3/8 | 37.5% | 93 | 24 | 31.9 | 16.3 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 8/13 | 61.5% ± 30.6 | 821 | 26 | 33.4 | 25.4 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 9/9 | 100.0% | 615 | 19 | 33.9 | 25.4 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 3/4 | 75.0% | 711 | 22 | 33.4 | 25.4 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 406 | 15 | 33.4 | 25.4 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 4/29 | 13.8% ± 22.9 | 5265 | 162 | 33.3 | 25.4 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 282/316 | 89.2% ± 5.4 | 27808 | 1081 | 33.4 | 27.5 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 6/12 | 50.0% | 4149 | 129 | 33.2 | 27.5 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 19/26 | 73.1% ± 25.2 | 11527 | 350 | 33.2 | 27.5 |
