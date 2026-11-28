# qwen3.6-35b-a3b-mlx: Pre-release (draft)

> Qwen3.6-35B-A3B on mlx 4bit, Apple M5 Max 128GB. Pass rate 85.9% ± 4.5 (95% CI), rank 24 of 79, tier 5. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Qwen3.6-35B-A3B (`mlx-community/Qwen3.6-35B-A3B-4bit`)
- Runtime: mlx; versions: mlx-lm 0.31.3
- Quant: 4bit; temperature 1
- Variant (what sets it apart from the model's other rows): runtime mlx · t1 · maxTokens 32768 · topP 0.95 · topK 20 · minP 0 · presencePenalty 1.5 · chatTemplateKwargs {"enable_thinking":true} · weights 8d52271ea750
- Config hash: `26a53827e52e78f4c5020bfe8ebff2bcfc10c450bdc759c6d327965b2892484b` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: `8d52271ea750` (prefix)
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `a11a8b3`
- Samples per item: 1; submitters: local
- Executed: 2026-11-20T03:45:59.915Z – 2026-11-20T07:22:50.029Z

## Score
- Pass rate: 85.9% ± 4.5 (568/661 items); core 89.8%, stretch 70.7%
- Rank 24 of 79, tier 5 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): loop 64, wrong 23, thinking_truncated 6

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 959455 total, 1452 per item
- Wall time: 12870 s total, 19.5 s per item
- Generation speed: 127.2 tok/s
- Peak memory: 18.9 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 11/13 | 84.6% | 33702 | 337 | 129.9 | 18.8 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 6142 | 49 | 133.0 | 18.8 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 11/12 | 91.7% ± 18.3 | 24276 | 299 | 131.1 | 18.8 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 8/12 | 66.7% | 52258 | 918 | 121.8 | 18.9 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 8/10 | 80.0% ± 30.2 | 10230 | 111 | 132.3 | 18.9 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 12/12 | 100.0% | 58872 | 458 | 129.4 | 18.9 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 34/35 | 97.1% ± 6.0 | 62431 | 517 | 131.4 | 18.9 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 13/26 | 50.0% ± 20.6 | 18403 | 382 | 132.3 | 18.9 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 20418 | 158 | 131.9 | 18.9 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 2154 | 17 | 133.6 | 18.9 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 16/26 | 61.5% ± 27.5 | 104485 | 1591 | 125.0 | 18.9 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 27/36 | 75.0% | 58771 | 977 | 130.9 | 18.9 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 10/12 | 83.3% | 17614 | 174 | 132.4 | 18.9 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 4986 | 39 | 133.7 | 18.9 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 7/8 | 87.5% | 6537 | 100 | 118.8 | 18.9 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 7805 | 63 | 133.6 | 18.9 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 0/9 | 0.0% | 32768 | 980 | 116.8 | 18.9 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 3755 | 29 | 133.1 | 18.9 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 6/9 | 66.7% | 10331 | 245 | 131.6 | 18.9 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 11/29 | 37.9% ± 48.8 | 133152 | 2361 | 122.6 | 18.9 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 308/316 | 97.5% ± 2.7 | 131785 | 1289 | 131.3 | 18.9 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 9/12 | 75.0% | 66819 | 672 | 122.9 | 18.9 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 19/26 | 73.1% ± 34.7 | 91761 | 1102 | 128.4 | 18.9 |
