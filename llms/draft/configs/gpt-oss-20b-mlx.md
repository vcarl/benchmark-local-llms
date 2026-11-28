# gpt-oss-20b-mlx: Pre-release (draft)

> gpt-oss-20b on mlx 4bit, Apple M5 Max 128GB. Pass rate 54.0% ± 6.8 (95% CI), rank 59 of 79, tier 11. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: gpt-oss-20b (`mlx-community/gpt-oss-20b-MXFP4-Q4`)
- Runtime: mlx; versions: mlx-lm 0.31.3
- Quant: 4bit; temperature 0.6
- Variant (what sets it apart from the model's other rows): runtime mlx · t0.6 · maxTokens 8192 · topP default
- Config hash: `1abcf09714ef383420c919d30057b391abfedfbd8a67edf9895dc1d9ad2a2234` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `f3e7ea0377a27a1bb3ec828e52a5fa7c39b7ad6f`
- Samples per item: 1; submitters: local
- Executed: 2026-11-24T06:52:11.724Z – 2026-11-24T07:44:38.886Z

## Score
- Pass rate: 54.0% ± 6.8 (357/661 items); core 59.3%, stretch 33.1%
- Rank 59 of 79, tier 11 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): loop 285, wrong 12, near_miss 6, length_cutoff 1

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 98151 total, 148 per item
- Wall time: 3144 s total, 4.8 s per item
- Generation speed: 160.0 tok/s
- Peak memory: 11.0 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 3/13 | 23.1% | 1669 | 79 | 164.7 | 10.9 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 8/12 | 66.7% | 1170 | 28 | 166.6 | 10.9 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 4/12 | 33.3% ± 31.3 | 0 | 67 | 0.0 | 10.9 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 0/12 | 0.0% | 0 | 89 | 0.0 | 10.9 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 7/10 | 70.0% ± 34.6 | 881 | 36 | 166.7 | 10.9 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 0/12 | 0.0% | 0 | 137 | 0.0 | 10.9 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 20/35 | 57.1% ± 21.1 | 4598 | 218 | 164.2 | 10.9 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 9/26 | 34.6% ± 19.6 | 1264 | 121 | 165.3 | 10.9 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 4/12 | 33.3% | 1885 | 75 | 163.2 | 10.9 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 5/7 | 71.4% ± 45.1 | 266 | 24 | 167.5 | 10.9 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 8/26 | 30.8% ± 17.8 | 150 | 207 | 165.6 | 10.9 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 11/36 | 30.6% | 16518 | 331 | 159.7 | 10.9 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 1/12 | 8.3% | 397 | 64 | 165.6 | 10.9 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 3/10 | 30.0% ± 34.6 | 675 | 49 | 165.6 | 10.9 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 4/8 | 50.0% | 756 | 87 | 130.8 | 11.0 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 11/13 | 84.6% ± 22.7 | 1513 | 32 | 166.3 | 11.0 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 0/9 | 0.0% | 8192 | 111 | 152.3 | 11.0 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 1000 | 7 | 166.3 | 11.0 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 2/9 | 22.2% | 871 | 47 | 163.1 | 11.0 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 1/29 | 3.4% ± 9.5 | 3320 | 248 | 159.1 | 11.0 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 238/316 | 75.3% ± 7.9 | 46616 | 796 | 160.2 | 11.0 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 4/12 | 33.3% | 4293 | 125 | 162.4 | 11.0 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 10/26 | 38.5% ± 19.6 | 2117 | 166 | 165.2 | 11.0 |
