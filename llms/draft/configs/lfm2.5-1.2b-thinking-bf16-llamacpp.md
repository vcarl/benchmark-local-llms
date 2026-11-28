# lfm2.5-1.2b-thinking-bf16-llamacpp: Pre-release (draft)

> LFM2.5-1.2B-Thinking on llamacpp BF16, Apple M5 Max 128GB. Pass rate 55.8% ± 5.7 (95% CI), rank 55 of 79, tier 10. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: LFM2.5-1.2B-Thinking (`LiquidAI/LFM2.5-1.2B-Thinking-GGUF`)
- Runtime: llamacpp; versions: llama.cpp b12359 (b1b770d90)
- Quant: BF16; temperature 0.05
- Variant (what sets it apart from the model's other rows): quant BF16 · weights c978772595ff
- Config hash: `96f4ecb0d350ec450e7dfb79db48fd965e019a4ee71c4262cef187919ab401d2` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: `c978772595ff` (prefix)
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `5f1b9ac7d96161fee9111239ec7818ca88aa218b`
- Samples per item: 1; submitters: local
- Executed: 2026-11-26T15:36:06.286Z – 2026-11-26T17:38:48.692Z

## Score
- Pass rate: 55.8% ± 5.7 (369/661 items); core 59.7%, stretch 40.6%
- Rank 55 of 79, tier 10 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 231, no_answer 43, near_miss 15, loop 3

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 1342798 total, 2031 per item
- Wall time: 7377 s total, 11.2 s per item
- Generation speed: 190.0 tok/s
- Peak memory: 11.8 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 3/13 | 23.1% | 57492 | 302 | 190.3 | 2.8 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 10/12 | 83.3% | 14965 | 78 | 193.1 | 2.9 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 6/12 | 50.0% ± 33.2 | 15375 | 80 | 192.8 | 3.0 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 8/12 | 66.7% | 40070 | 210 | 191.2 | 3.3 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 9/10 | 90.0% ± 22.6 | 13664 | 71 | 192.5 | 3.4 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 3/12 | 25.0% | 63517 | 333 | 190.6 | 3.8 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 21/35 | 60.0% ± 26.6 | 98467 | 515 | 191.6 | 4.4 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 2/26 | 7.7% ± 11.0 | 26909 | 140 | 193.0 | 4.6 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 6/12 | 50.0% | 20862 | 109 | 192.5 | 4.8 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 4169 | 22 | 193.0 | 4.8 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 12/26 | 46.2% ± 32.2 | 153882 | 814 | 189.3 | 5.8 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 11/36 | 30.6% | 120561 | 649 | 186.1 | 6.6 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 11/12 | 91.7% | 16735 | 90 | 187.4 | 6.8 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 6/10 | 60.0% ± 36.9 | 19145 | 100 | 191.6 | 6.9 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 1/8 | 12.5% | 13873 | 90 | 178.5 | 7.7 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 10608 | 56 | 191.2 | 8.0 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 0/9 | 0.0% | 37894 | 203 | 187.3 | 8.2 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 3498 | 19 | 185.1 | 8.2 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 0/9 | 0.0% | 10716 | 57 | 191.0 | 8.3 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 3/29 | 10.3% ± 18.8 | 155664 | 823 | 189.4 | 9.3 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 216/316 | 68.4% ± 7.0 | 287891 | 1795 | 191.2 | 11.7 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 2/12 | 16.7% | 58616 | 308 | 190.7 | 11.7 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 15/26 | 57.7% ± 31.7 | 98225 | 515 | 191.0 | 11.8 |
