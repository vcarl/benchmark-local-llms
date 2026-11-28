# qwen3.6-35b-a3b-llamacpp: Pre-release (draft)

> Qwen3.6-35B-A3B on llamacpp Q6_K, Apple M5 Max 128GB. Pass rate 94.3% ± 2.4 (95% CI), rank 7 of 79, tier 2. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Qwen3.6-35B-A3B (`unsloth/Qwen3.6-35B-A3B-GGUF`)
- Runtime: llamacpp; versions: llama.cpp b12359 (b1b770d90)
- Quant: Q6_K; temperature 1
- Config hash: `9130b6bebce69d0c625e8d0d54ae94468093cdfc5a9df9bdd6e412047a0583f6` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `8e006d2cbb81af01ec9661d6b430da635181bce9`
- Samples per item: 1; submitters: local
- Executed: 2026-11-23T19:13:31.434Z – 2026-11-23T23:08:53.562Z

## Score
- Pass rate: 94.3% ± 2.4 (623/661 items); core 96.6%, stretch 85.0%
- Rank 7 of 79, tier 2 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 31, thinking_truncated 3, loop 2, no_answer 2

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 1297581 total, 1963 per item
- Wall time: 14192 s total, 21.5 s per item
- Generation speed: 95.5 tok/s
- Peak memory: 38.5 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 10/13 | 76.9% | 34549 | 359 | 96.6 | 31.6 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 6859 | 72 | 97.7 | 33.8 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 26944 | 278 | 97.3 | 35.2 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 10/12 | 83.3% | 70564 | 1088 | 95.9 | 37.2 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 20097 | 207 | 97.5 | 37.7 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 11/12 | 91.7% | 99267 | 1074 | 92.5 | 37.9 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 35/35 | 100.0% ± 0.0 | 75610 | 793 | 95.8 | 38.4 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 17/26 | 65.4% ± 19.6 | 56239 | 583 | 96.7 | 38.4 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 21502 | 222 | 97.6 | 38.4 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 2288 | 24 | 97.5 | 38.4 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 21/26 | 80.8% ± 18.9 | 184554 | 1964 | 94.1 | 38.4 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 33/36 | 91.7% | 60652 | 627 | 97.6 | 38.4 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 12/12 | 100.0% | 25053 | 258 | 97.5 | 38.4 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 6351 | 66 | 97.7 | 38.4 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 8/8 | 100.0% | 6710 | 142 | 89.2 | 38.4 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 9497 | 98 | 97.7 | 38.5 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 8/9 | 88.9% | 66641 | 704 | 94.9 | 38.5 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 3338 | 35 | 97.6 | 38.5 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 36427 | 380 | 96.5 | 38.5 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 19/29 | 65.5% ± 42.0 | 191243 | 2036 | 94.1 | 38.5 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 314/316 | 99.4% ± 0.9 | 167572 | 1876 | 97.1 | 38.5 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 12/12 | 100.0% | 32933 | 340 | 97.6 | 38.5 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 24/26 | 92.3% ± 11.2 | 92691 | 968 | 96.0 | 38.5 |
