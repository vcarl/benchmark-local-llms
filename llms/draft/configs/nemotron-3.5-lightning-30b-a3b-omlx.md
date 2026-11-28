# nemotron-3.5-lightning-30b-a3b-omlx: Pre-release (draft)

> NVIDIA-Nemotron-3.5-Lightning-30B-A3B on omlx 4bit, Apple M5 Max 128GB. Pass rate 93.0% ± 3.0 (95% CI), rank 11 of 79, tier 3. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

## Config
- Model: NVIDIA-Nemotron-3.5-Lightning-30B-A3B (`mlx-community/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-4bit`)
- Runtime: omlx; versions: omlx 0.6.3
- Quant: 4bit; temperature 1
- Config hash: `d7c3fe7851accd87ac455ec9c3febfe554b68baa1737bfdc41788284ef65a076` (covers weights, chat template, system prompt and sampler settings)
- Weights digest: not shown in the snapshot; the config hash covers it
- Hardware: Apple M5 Max (18 CPU cores, 40 GPU cores), 128 GB, macOS 27.0.1 (`771252e96dfed8bd703d9bf1720ab9beee5767f541cc2a9bf6fd5678e4e3bfd3`)
- Harness commits: `9605df700c37ee514032630d674b74a55a9f1940`
- Samples per item: 1; submitters: local
- Executed: 2026-11-23T13:11:20.652Z – 2026-11-23T16:03:46.476Z

## Score
- Pass rate: 93.0% ± 3.0 (615/661 items); core 95.5%, stretch 83.5%
- Rank 11 of 79, tier 3 on the [leaderboard](https://vcarl.com/evals/llms/draft/leaderboard.md)
- Completeness: complete; challenges 23/23, items 661/661
- Failures (sample lines): wrong 35, loop 6, thinking_truncated 5

## Cost
Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.

- Generation tokens: 1533716 total, 2320 per item
- Wall time: 10409 s total, 15.7 s per item
- Generation speed: 165.7 tok/s
- Peak memory: 17.6 GB

## Challenges

| Challenge | Status | Passed / items | Pass rate ± 95% CI | Gen tokens | Wall s | tok/s | Peak GB |
|---|---|---|---|---|---|---|---|
| [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) | scored | 11/13 | 84.6% | 122327 | 775 | 158.6 | 17.5 |
| [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) | scored | 12/12 | 100.0% | 6713 | 42 | 175.7 | 17.5 |
| [code](https://vcarl.com/evals/llms/draft/challenges/code.md) | scored | 12/12 | 100.0% ± 0.0 | 8911 | 55 | 173.8 | 17.5 |
| [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) | scored | 12/12 | 100.0% | 17964 | 109 | 171.5 | 17.5 |
| [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) | scored | 9/10 | 90.0% ± 22.6 | 23687 | 143 | 168.2 | 17.5 |
| [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) | scored | 12/12 | 100.0% | 93403 | 567 | 165.5 | 17.5 |
| [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) | scored | 33/35 | 94.3% ± 12.0 | 23669 | 144 | 174.7 | 17.5 |
| [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) | scored | 19/26 | 73.1% ± 18.3 | 31820 | 191 | 171.9 | 17.5 |
| [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) | scored | 12/12 | 100.0% | 18911 | 114 | 171.4 | 17.5 |
| [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) | scored | 7/7 | 100.0% ± 0.0 | 1477 | 9 | 185.3 | 17.5 |
| [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) | scored | 20/26 | 76.9% ± 23.8 | 225275 | 1773 | 160.7 | 17.5 |
| [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) | scored | 34/36 | 94.4% | 81406 | 494 | 169.5 | 17.5 |
| [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) | scored | 12/12 | 100.0% | 40756 | 249 | 166.0 | 17.5 |
| [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) | scored | 10/10 | 100.0% ± 0.0 | 2768 | 18 | 181.7 | 17.5 |
| [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) | scored | 6/8 | 75.0% | 20813 | 179 | 155.9 | 17.6 |
| [math](https://vcarl.com/evals/llms/draft/challenges/math.md) | scored | 13/13 | 100.0% ± 0.0 | 4297 | 27 | 180.1 | 17.6 |
| [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) | scored | 8/9 | 88.9% | 34647 | 211 | 166.6 | 17.6 |
| [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) | scored | 4/4 | 100.0% | 1319 | 8 | 179.8 | 17.6 |
| [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) | scored | 9/9 | 100.0% | 9559 | 59 | 172.3 | 17.6 |
| [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) | scored | 21/29 | 72.4% ± 44.0 | 280524 | 2034 | 162.7 | 17.6 |
| [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) | scored | 304/316 | 96.2% ± 4.0 | 368232 | 2348 | 170.1 | 17.6 |
| [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) | scored | 11/12 | 91.7% | 34447 | 209 | 167.9 | 17.6 |
| [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) | scored | 24/26 | 92.3% ± 11.2 | 80791 | 652 | 167.7 | 17.6 |
