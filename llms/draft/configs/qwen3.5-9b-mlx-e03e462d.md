# qwen3.5-9b-mlx: Pre-release (draft)

> Qwen3.5-9B on mlx 4bit, Apple M5 Max 128GB. Pass rate 2.0% ± 1.3 (95% CI), rank 78 of 79, tier 16. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Qwen3.5-9B (`mlx-community/Qwen3.5-9B-4bit`)
- Runtime: mlx; versions: mlx-lm 0.31.3
- Quant: 4bit; temperature 1
- Variant (what sets it apart from the model's other rows): runtime mlx · chatTemplateKwargs {"enable_thinking":true} · weights unknown
- Config hash: `e03e462d91c055c07997b823ae092cf537c6b34a721e6bd8e652261d8c4b9fac` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: `unknown` (prefix)
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `bfb5743`
- Samples per item: 1; submitters: local
- Executed: 2026-11-20T00:28:37.182Z – 2026-11-20T00:47:07.312Z

## Score
- Pass rate: 2.0% ± 1.3 (13/661 items); core 2.5%, stretch 0.0%
- Rank 78 of 79, tier 16 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: partial; challenges 2/23, items 22/661
- Failures (sample lines): loop 8, thinking_truncated 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 61793 total, 2809 per item
- Wall time: 1109 s total, 50.4 s per item
- Generation speed: 90.1 tok/s
- Peak memory: 5.4 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | not_run | 0/13 | 0.0% | — | — | — | — |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | not_run | 0/12 | 0.0% | — | — | — | — |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | not_run | 0/12 | 0.0% ± 0.0 | — | — | — | — |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | not_run | 0/12 | 0.0% | — | — | — | — |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | not_run | 0/10 | 0.0% ± 0.0 | — | — | — | — |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 3/12 | 25.0% | 51112 | 998 | 88.8 | 5.4 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | not_run | 0/35 | 0.0% ± 0.0 | — | — | — | — |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | not_run | 0/26 | 0.0% ± 0.0 | — | — | — | — |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | not_run | 0/12 | 0.0% | — | — | — | — |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | not_run | 0/7 | 0.0% ± 0.0 | — | — | — | — |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | not_run | 0/26 | 0.0% ± 0.0 | — | — | — | — |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | not_run | 0/36 | 0.0% | — | — | — | — |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | not_run | 0/12 | 0.0% | — | — | — | — |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 10681 | 112 | 97.4 | 5.4 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | not_run | 0/8 | 0.0% | — | — | — | — |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | not_run | 0/13 | 0.0% ± 0.0 | — | — | — | — |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | not_run | 0/9 | 0.0% | — | — | — | — |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | not_run | 0/4 | 0.0% | — | — | — | — |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | not_run | 0/9 | 0.0% | — | — | — | — |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | not_run | 0/29 | 0.0% ± 0.0 | — | — | — | — |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | not_run | 0/316 | 0.0% ± 0.0 | — | — | — | — |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | not_run | 0/12 | 0.0% | — | — | — | — |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | not_run | 0/26 | 0.0% ± 0.0 | — | — | — | — |
