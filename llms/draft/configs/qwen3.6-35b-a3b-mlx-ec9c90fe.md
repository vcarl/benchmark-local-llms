# qwen3.6-35b-a3b-mlx: Pre-release (draft)

> Qwen3.6-35B-A3B on mlx 4bit, Apple M5 Max 128GB. Pass rate 14.7% ± 4.7 (95% CI), rank 76 of 79, tier 16. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Qwen3.6-35B-A3B (`mlx-community/Qwen3.6-35B-A3B-4bit`)
- Runtime: mlx; versions: mlx-lm 0.31.3
- Quant: 4bit; temperature 0.7
- Variant (what sets it apart from the model's other rows): runtime mlx · t0.7 · maxTokens 8192 · topP default · topK default · minP default · presencePenalty default · chatTemplateKwargs default · weights unknown
- Config hash: `ec9c90fe8b1ea51461f9d2ccd9ebe9daa3796e3e4f59e5ad598131cbfa163963` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: `unknown` (prefix)
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `37f9f14`
- Samples per item: 1; submitters: local
- Executed: 2026-06-21T02:27:20.216Z – 2026-11-19T17:10:06.137Z

## Score
- Pass rate: 14.7% ± 4.7 (97/661 items); core 12.7%, stretch 22.6%
- Rank 76 of 79, tier 16 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: partial; challenges 9/23, items 139/661
- Failures (sample lines): thinking_truncated 22, loop 15, wrong 5

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 352774 total, 2538 per item
- Wall time: 3335 s total, 24.0 s per item
- Generation speed: 128.6 tok/s
- Peak memory: 18.8 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 9/13 | 69.2% | 30127 | 384 | 107.7 | 18.8 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 11/12 | 91.7% | 8905 | 122 | 137.4 | 18.8 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 8/12 | 66.7% ± 31.3 | 32184 | 296 | 134.2 | 18.8 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 5/12 | 41.7% | 58243 | 504 | 132.7 | 18.8 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 13621 | 110 | 124.0 | 18.8 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | not_run | 0/12 | 0.0% | — | — | — | — |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 21/35 | 60.0% ± 23.0 | 124411 | 1117 | 133.5 | 18.8 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 14/26 | 53.8% ± 20.5 | 60537 | 574 | 134.2 | 18.8 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 22108 | 206 | 107.2 | 18.8 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 2638 | 21 | 128.4 | 18.8 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | not_run | 0/26 | 0.0% ± 0.0 | — | — | — | — |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | not_run | 0/36 | 0.0% | — | — | — | — |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | not_run | 0/12 | 0.0% | — | — | — | — |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | not_run | 0/10 | 0.0% ± 0.0 | — | — | — | — |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | not_run | 0/8 | 0.0% | — | — | — | — |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | not_run | 0/13 | 0.0% ± 0.0 | — | — | — | — |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | not_run | 0/9 | 0.0% | — | — | — | — |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | not_run | 0/4 | 0.0% | — | — | — | — |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | not_run | 0/9 | 0.0% | — | — | — | — |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | not_run | 0/29 | 0.0% ± 0.0 | — | — | — | — |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | not_run | 0/316 | 0.0% ± 0.0 | — | — | — | — |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | not_run | 0/12 | 0.0% | — | — | — | — |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | not_run | 0/26 | 0.0% ± 0.0 | — | — | — | — |
