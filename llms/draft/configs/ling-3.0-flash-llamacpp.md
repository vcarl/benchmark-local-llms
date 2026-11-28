# ling-3.0-flash-llamacpp: Pre-release (draft)

> Ling-3.0-flash on llamacpp Q4_K_M, Apple M5 Max 128GB. Pass rate 92.0% ± 3.2 (95% CI), rank 16 of 79, tier 3. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: Ling-3.0-flash (`inclusionAI/Ling-3.0-flash-GGUF`)
- Runtime: llamacpp; versions: llama.cpp b12359 (b1b770d90)
- Quant: Q4_K_M; temperature 0.6
- Config hash: `ec197b94d663df73fdb073d2845edb6a9906f5d2858d057834352bd8fcacb787` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `278bac5b05de710c20f3be8a9408a3c9b37028b3`
- Samples per item: 1; submitters: local
- Executed: 2026-11-23T04:44:18.934Z – 2026-11-23T09:18:43.882Z

## Score
- Pass rate: 92.0% ± 3.2 (608/661 items); core 92.6%, stretch 89.5%
- Rank 16 of 79, tier 3 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 29, no_answer 12, thinking_truncated 11, near_miss 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 836367 total, 1265 per item
- Wall time: 16901 s total, 25.6 s per item
- Generation speed: 51.1 tok/s
- Peak memory: 80.2 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 11/13 | 84.6% | 85782 | 1869 | 46.0 | 74.2 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 1889 | 33 | 61.9 | 76.9 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 3453 | 57 | 62.4 | 78.2 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 2155 | 38 | 62.5 | 78.7 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 10/10 | 100.0% ± 0.0 | 9713 | 164 | 59.6 | 79.9 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 12/12 | 100.0% | 32041 | 555 | 57.9 | 79.9 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 35/35 | 100.0% ± 0.0 | 13012 | 210 | 63.8 | 79.9 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 19/26 | 73.1% ± 18.3 | 7624 | 123 | 63.9 | 79.9 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 5383 | 88 | 63.7 | 79.9 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 345 | 6 | 64.1 | 79.9 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 22/26 | 84.6% ± 27.7 | 177488 | 3725 | 47.7 | 79.9 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 35/36 | 97.2% | 27838 | 456 | 62.7 | 79.9 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 12/12 | 100.0% | 14460 | 231 | 63.0 | 79.9 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 1653 | 27 | 64.3 | 79.9 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 8/8 | 100.0% | 1042 | 162 | 44.4 | 79.9 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 1438 | 24 | 64.5 | 79.9 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 8/9 | 88.9% | 17216 | 287 | 60.6 | 79.9 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 761 | 12 | 64.4 | 79.9 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 7545 | 122 | 63.8 | 79.9 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 22/29 | 75.9% ± 55.2 | 299827 | 6253 | 48.0 | 80.0 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 287/316 | 90.8% ± 4.6 | 51120 | 1127 | 62.4 | 80.2 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 11/12 | 91.7% | 6522 | 107 | 63.8 | 80.2 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 25/26 | 96.2% ± 8.9 | 68060 | 1225 | 55.8 | 80.2 |
