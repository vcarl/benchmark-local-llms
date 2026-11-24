# Follow-ups

Known open work, in no particular order. Each entry says what is missing and where to start. Remove an entry when its work lands.

## Build and publish

- **CI/CD.** Nothing runs `npm test`, typecheck or lint on push, and nothing builds or deploys the webapp. `scripts/deploy-gh-pages.sh` is stale: it calls `./bench report --archive-dir` and expects `data.js`, neither of which exists. `scripts/build-report.sh` is the current build. Deploy is its own scope; it needs Carl's go-ahead.
- **EEE export of v4 data.** `src/export/eee/build.ts` reads legacy attempts only, so the ranked draft cannot be exported. The export is for standardization ([EEE-EXPORT.md](EEE-EXPORT.md)); nothing is ever submitted upstream.

## Data integrity

- **Errata hardening.** A released item changes only via a published erratum ([ERRATA.md](ERRATA.md)). Nothing yet proves after the fact that a release's items match what its results were run against beyond `release.json` digests and `./bench release verify`. Scope is open.
- **Eval timing.** Prompts are public, so a model may have trained on them. Record when an eval ran relative to the challenge set's publication, the model's release and its training cutoff, so results that could be benchmaxxed are visible. A boolean on the run was judged insufficient; the design is open.
- **Requested sample count is not recorded.** A bundle header doesn't carry the sample count a run asked for, so the completeness check ([SCORING.md § Report rows](SCORING.md#report-rows)) can catch a gap (samples 1–2 without 0) but not a missing trailing sample. Record `samples` per item (it can differ per item via `--items`) in the header and check it.
- **Converted rows after their reruns.** The 39 converted draft configs are being rerun with weights recorded. Each rerun is a new config version (`weights <hex>`), shown beside its converted row (`weights unknown`). Decide whether a converted bundle leaves `datasets/draft.yaml` once its rerun lands.

## Code health

- **Dead scenario code.** `src/game/**` and the `RunManifest`/`ExecutionResult` archive format are type-reachable but never run: `cli/deps.ts` still builds Admiral/GameSession factories into `RunModelDeps`. Start by removing `admiral`/`gameSession` from `RunModelDeps` and `deps.ts`, then delete in stages, with tsc as the gate.
- **`scripts/` outside tsc and lint.** Author tests run under `npm test`, but `scripts/` isn't typechecked. Bringing it under strict tsc trips existing `noUncheckedIndexedAccess` / `noPropertyAccessFromIndexSignature` errors (for example in `scripts/author/draft.ts`), so it needs its own pass.
