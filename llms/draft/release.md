# Release notes: Pre-release (draft)

- Release: `draft`
- Commitment: none; the pre-release is uncommitted and its items may still change
- Errata: none

## 23 challenges, 661 items

- [chains](https://vcarl.com/evals/llms/draft/challenges/chains.md) v1: 13 items
- [classify](https://vcarl.com/evals/llms/draft/challenges/classify.md) v1: 12 items
- [code](https://vcarl.com/evals/llms/draft/challenges/code.md) v1: 12 items
- [codefix](https://vcarl.com/evals/llms/draft/challenges/codefix.md) v1: 12 items
- [constraint](https://vcarl.com/evals/llms/draft/challenges/constraint.md) v1: 10 items
- [dates](https://vcarl.com/evals/llms/draft/challenges/dates.md) v1: 12 items
- [economics](https://vcarl.com/evals/llms/draft/challenges/economics.md) v1: 35 items
- [effect-ts](https://vcarl.com/evals/llms/draft/challenges/effect-ts.md) v1: 26 items
- [extraction](https://vcarl.com/evals/llms/draft/challenges/extraction.md) v1: 12 items
- [factual](https://vcarl.com/evals/llms/draft/challenges/factual.md) v1: 7 items
- [financial](https://vcarl.com/evals/llms/draft/challenges/financial.md) v1: 26 items
- [followups](https://vcarl.com/evals/llms/draft/challenges/followups.md) v1: 36 items
- [ifeval](https://vcarl.com/evals/llms/draft/challenges/ifeval.md) v1: 12 items
- [logic](https://vcarl.com/evals/llms/draft/challenges/logic.md) v1: 10 items
- [longctx](https://vcarl.com/evals/llms/draft/challenges/longctx.md) v1: 8 items
- [math](https://vcarl.com/evals/llms/draft/challenges/math.md) v1: 13 items
- [regex](https://vcarl.com/evals/llms/draft/challenges/regex.md) v1: 9 items
- [smoke](https://vcarl.com/evals/llms/draft/challenges/smoke.md) v1: 4 items
- [sql](https://vcarl.com/evals/llms/draft/challenges/sql.md) v1: 9 items
- [stretch](https://vcarl.com/evals/llms/draft/challenges/stretch.md) v1: 29 items
- [toolcall](https://vcarl.com/evals/llms/draft/challenges/toolcall.md) v1: 316 items
- [transform](https://vcarl.com/evals/llms/draft/challenges/transform.md) v1: 12 items
- [trust](https://vcarl.com/evals/llms/draft/challenges/trust.md) v1: 26 items

## Snapshots to cite

- Pre-release (draft) (current): `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`

## Verify

`./bench release verify draft` (in the [harness repo](https://github.com/vcarl/benchmark-local-llms)) re-derives every published prompt and scorer blob of the release and checks its challenge files against its release file. A snapshot digest identifies exactly the rows shown; rebuilding a snapshot also needs the execution bundles, which are not published.
