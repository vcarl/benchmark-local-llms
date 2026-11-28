# gemma-4-e4b-llamacpp: Pre-release (draft)

> gemma-4-E4B-it on llamacpp Q8_0, Apple M5 Max 128GB. Pass rate 89.4% ± 3.6 (95% CI), rank 20 of 79, tier 4. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: gemma-4-E4B-it (`unsloth/gemma-4-E4B-it-GGUF`)
- Runtime: llamacpp; versions: llama.cpp b12359 (b1b770d90)
- Quant: Q8_0; temperature 1
- Config hash: `5e55184fc5e9b725669c4d8e1292d3ab2c96f34d97f0a10c9105694cb778cb21` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `202a47057293316973f92bb38f36eba91d203de5`
- Samples per item: 1; submitters: local
- Executed: 2026-11-24T09:40:23.226Z – 2026-11-24T11:06:19.591Z

## Score
- Pass rate: 89.4% ± 3.6 (591/661 items); core 94.3%, stretch 69.9%
- Rank 20 of 79, tier 4 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 69, near_miss 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 364407 total, 551 per item
- Wall time: 5174 s total, 7.8 s per item
- Generation speed: 73.1 tok/s
- Peak memory: 19.2 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 7/13 | 53.8% | 5400 | 75 | 72.6 | 8.5 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 2411 | 34 | 72.6 | 8.7 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 1246 | 18 | 71.8 | 8.9 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 16753 | 230 | 73.4 | 9.3 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 1372 | 20 | 72.2 | 9.3 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 11/12 | 91.7% | 17537 | 240 | 73.2 | 9.7 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 34/35 | 97.1% ± 6.0 | 26229 | 363 | 72.8 | 10.3 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 12/26 | 46.2% ± 20.5 | 10817 | 151 | 72.5 | 10.6 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 8158 | 113 | 72.9 | 10.9 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 43 | 1 | 68.6 | 10.9 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 18/26 | 69.2% ± 33.8 | 42939 | 591 | 73.0 | 11.7 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 31/36 | 86.1% | 36489 | 501 | 73.5 | 13.3 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 10/12 | 83.3% | 2849 | 40 | 72.3 | 13.4 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 2950 | 42 | 72.3 | 13.5 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 7/8 | 87.5% | 5051 | 120 | 68.9 | 14.8 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 3246 | 46 | 72.5 | 15.2 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 9/9 | 100.0% | 11922 | 164 | 73.2 | 15.5 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 1887 | 26 | 73.1 | 15.5 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 8/9 | 88.9% | 5708 | 79 | 73.4 | 15.7 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 11/29 | 37.9% ± 44.2 | 33024 | 454 | 73.1 | 16.4 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 311/316 | 98.4% ± 1.2 | 78450 | 1179 | 73.3 | 19.2 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 10/12 | 83.3% | 16246 | 223 | 73.5 | 19.2 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 20/26 | 76.9% ± 19.3 | 33680 | 463 | 73.2 | 19.2 |
