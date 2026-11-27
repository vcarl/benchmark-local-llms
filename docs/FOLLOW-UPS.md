# Follow-ups

Known open work, in no particular order. Each entry says what is missing and where to start. Remove an entry when its work lands.

## Build and publish

- **CI.** Nothing runs `npm test`, typecheck or lint on push. Deploy is local by design ([DEPLOY.md](DEPLOY.md)): it reads the local store.
- **Snapshot rows carry no weights digest.** A row's `weightsDigest` reaches the webapp and `llms/` pages only as a variant-label prefix when it tells rows apart. Add it to the row's `provenance` in `src/report/` and `webapp/src/lib/rows.ts` (a new snapshot digest).
- **EEE export of v4 data.** `src/export/eee/build.ts` reads legacy attempts only, so the ranked draft cannot be exported. The export is for standardization ([EEE-EXPORT.md](EEE-EXPORT.md)); nothing is ever submitted upstream.

## Data integrity

- **Errata hardening.** A released item changes only via a published erratum ([ERRATA.md](ERRATA.md)). Nothing yet proves after the fact that a release's items match what its results were run against beyond `release.json` digests and `./bench release verify`. Scope is open.
- **Model release dates.** 50 of the 61 `model-dates.yaml` keys date their release by the original Hugging Face repo's `createdAt`, which can precede the real public release and so errs toward `predates` ([EVAL-TIMING.md](EVAL-TIMING.md)). Replace them with vendor-stated dates when labels near an item's publication date start to matter: start with the models whose date is within about a month of an item's effective publication date.
- **Requested sample count is not recorded.** A bundle header doesn't carry the sample count a run asked for, so the completeness check ([SCORING.md § Report rows](SCORING.md#report-rows)) can catch a gap (samples 1–2 without 0) but not a missing trailing sample. Record `samples` per item (it can differ per item via `--items`) in the header and check it.
- **Converted rows after their reruns.** The 39 converted draft configs are being rerun with weights recorded. Each rerun is a new config version (`weights <hex>`), shown beside its converted row (`weights unknown`). Decide whether a converted bundle leaves `datasets/draft.yaml` once its rerun lands.

## Code health

- **Dead scenario code.** `src/game/**` and the `RunManifest`/`ExecutionResult` archive format are type-reachable but never run: `cli/deps.ts` still builds Admiral/GameSession factories into `RunModelDeps`. Start by removing `admiral`/`gameSession` from `RunModelDeps` and `deps.ts`, then delete in stages, with tsc as the gate.
- **`scripts/` outside tsc and lint.** Author tests run under `npm test`, but `scripts/` isn't typechecked. Bringing it under strict tsc trips existing `noUncheckedIndexedAccess` / `noPropertyAccessFromIndexSignature` errors (for example in `scripts/author/draft.ts`), so it needs its own pass.
