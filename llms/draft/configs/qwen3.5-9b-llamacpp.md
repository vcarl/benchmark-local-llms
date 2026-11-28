# qwen3.5-9b-llamacpp: Pre-release (draft)

> Qwen3.5-9B on llamacpp Q8_0, Apple M5 Max 128GB. Pass rate 92.4% ± 2.8 (95% CI), rank 13 of 79, tier 3. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Qwen3.5-9B (`unsloth/Qwen3.5-9B-GGUF`)
- Runtime: llamacpp; versions: llama.cpp b12359 (b1b770d90)
- Quant: Q8_0; temperature 1
- Config hash: `0c383f7063b031015183c5496bf518f9d489a48e103e843ab0e992db4c5ca532` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `6abaae7a35aa03b9005cbc89680d1e6ad87567c8`
- Samples per item: 1; submitters: local
- Executed: 2026-11-26T03:54:06.122Z – 2026-11-26T14:26:12.815Z

## Score
- Pass rate: 92.4% ± 2.8 (611/661 items); core 94.1%, stretch 85.7%
- Rank 13 of 79, tier 3 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 37, thinking_truncated 13

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 2055468 total, 3110 per item
- Wall time: 38336 s total, 58.0 s per item
- Generation speed: 54.0 tok/s
- Peak memory: 20.4 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 11/13 | 84.6% | 87380 | 1630 | 53.7 | 14.1 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 10717 | 198 | 54.5 | 15.9 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 11/12 | 91.7% ± 18.3 | 26015 | 474 | 55.1 | 17.4 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 11/12 | 91.7% | 8149 | 149 | 55.5 | 18.6 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 25290 | 460 | 55.0 | 19.5 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 10/12 | 83.3% | 186979 | 3518 | 53.2 | 20.2 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 35/35 | 100.0% ± 0.0 | 136607 | 2502 | 54.7 | 20.2 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 14/26 | 53.8% ± 20.5 | 75003 | 1365 | 55.0 | 20.2 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 26796 | 488 | 55.2 | 20.2 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 2256 | 42 | 54.9 | 20.2 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 20/26 | 76.9% ± 22.5 | 427011 | 8019 | 53.3 | 20.4 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 33/36 | 91.7% | 106310 | 1923 | 55.5 | 20.4 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 12/12 | 100.0% | 41014 | 740 | 55.5 | 20.4 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 6986 | 126 | 55.6 | 20.4 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 6/8 | 75.0% | 20452 | 466 | 52.4 | 20.4 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 9674 | 175 | 55.7 | 20.4 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 7/9 | 77.8% | 25711 | 467 | 55.2 | 20.4 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 2991 | 54 | 55.6 | 20.4 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 12338 | 225 | 55.5 | 20.4 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 21/29 | 72.4% ± 52.8 | 455239 | 8495 | 53.6 | 20.4 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 308/316 | 97.5% ± 2.1 | 98076 | 1938 | 55.4 | 20.4 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 11/12 | 91.7% | 36672 | 666 | 55.3 | 20.4 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 24/26 | 92.3% ± 11.2 | 227802 | 4218 | 54.1 | 20.4 |
