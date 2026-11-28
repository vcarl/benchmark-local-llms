# Release notes: Alpha challenge set · release 0

- Release: `0` (initial-main-5fa9760)
- Date: 2026-11-16
- Closed at eval version: 0.7
- Commitment: none recorded
- Errata: https://vcarl.com/evals/llms/alpha/errata.md

## 10 challenges, 169 items

- [code](https://vcarl.com/evals/llms/alpha/challenges/code.md) v1: 12 items
- [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md) v1: 10 items
- [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md) v1: 35 items
- [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md) v1: 26 items
- [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md) v1: 7 items
- [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md) v1: 26 items
- [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md) v1: 10 items
- [math](https://vcarl.com/evals/llms/alpha/challenges/math.md) v1: 13 items
- [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md) v1: 4 items
- [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md) v1: 26 items

## Snapshots to cite

- Alpha challenge set, eval 0.7 (current): `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`

## Verify

`./bench release verify 0` (in the [harness repo](https://github.com/vcarl/benchmark-local-llms)) re-derives every published prompt and scorer blob of the release and checks its challenge files against its release file. A snapshot digest identifies exactly the rows shown; rebuilding a snapshot also needs the execution bundles, which are not published.
