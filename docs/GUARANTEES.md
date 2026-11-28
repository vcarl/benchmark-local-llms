# Guarantees

The harness runs work as **bundles**: one `(configuration × challenge)` pairing executed within a run (one `./bench run`). The schemaVersion 1–3 predecessor of a bundle is an **attempt**; those archives are read-only. Around that unit it commits to a small set of invariants. Each section states the promise, links to the doc that owns its mechanism where another doc does, and points at the canonical implementation.

## Scope-managed resources

Every subprocess, HTTP session, and SSE connection is acquired inside an `Effect.Scope`. Closing the scope runs all registered finalizers in LIFO order, so acquisition implies guaranteed release — no path through completion or interruption leaves a resource live. Each configuration's server is acquired inside an `Effect.scoped` region that also covers every bundle written against it. The server's shutdown finalizer is installed **before** the health wait, so even a boot-time health timeout escalates termination cleanly instead of orphaning a half-started server.

Ref: `src/orchestration/run-matrix.ts`, `src/llm/servers/supervisor.ts`.

## Graceful shutdown: SIGTERM → SIGKILL

The server supervisor sends SIGTERM, waits `gracefulShutdownSec` (default `10`) for a clean exit, then escalates to SIGKILL. Both kill calls are bounded by `Effect.timeout` and made `Effect.interruptible`, so a child that ignores SIGTERM — or a kernel that stalls on SIGKILL — cannot hang the finalizer. An ungraceful parent exit (SIGHUP, uncaught exception, sudden `process.exit`) bypasses Effect finalizers entirely, so a process-level safety net tracks every spawned PID and tears the child (and its process group) down instead.

Ref: `src/llm/servers/supervisor.ts`, `src/cli/subprocess-registry.ts`.

## Interruption safety

An interrupted run never leaves a sealed bundle, and readers never see a partial one: a bundle reaches `store/bundles/` only when its run seals it. Re-running `./bench run` resumes the cell's open file, keeping what it already holds. Mechanism: [ARCHIVE-FORMAT.md § Lifecycle](./ARCHIVE-FORMAT.md#lifecycle-open-to-sealed).

Ref: `src/store/bundle.ts` (`createOpenBundle`, `appendExecution`, `readOpenBundle`), `src/orchestration/run-challenge.ts`.

## Resume identity safety

Executions are never appended onto a bundle with a different identity: an open file is adopted only when its config digest, `hardwareId`, release and challenge all match the run's. Mechanism: [ARCHIVE-FORMAT.md § Lifecycle](./ARCHIVE-FORMAT.md#lifecycle-open-to-sealed).

Ref: `src/store/store-index.ts` (`findOpenBundle`), `src/orchestration/run-challenge.ts`.

## Store immutability and sealing

A sealed bundle is never modified and never overwritten: it is named by the SHA-256 of its canonical bytes, and a different file under the same name fails with `BundleConflict`. Mechanism: [ARCHIVE-FORMAT.md § Lifecycle](./ARCHIVE-FORMAT.md#lifecycle-open-to-sealed).

Ref: `src/store/bundle.ts` (`sealBundle`, `createOpenBundle`).

## Verifying reader

Every sealed bundle is read by re-deriving instead of trusting: canonical lines, re-derived digests, no duplicates, a file that hashes to its name; any failure is a `BundleInvalid` naming the check. `./bench verify` additionally pins a bundle to its release and writes nothing. Mechanism: [ARCHIVE-FORMAT.md § Verifying reader](./ARCHIVE-FORMAT.md#verifying-reader).

Ref: `src/store/bundle.ts` (`readBundle`), `src/cli/commands/verify.ts`.

## Complete-run skip

A cell's results are always those of one real run on one machine: `./bench run` skips a cell only when a single complete bundle already holds all of it, and otherwise runs the whole cell; nothing is copied from another bundle. Mechanism: [SCORING.md § Report rows](./SCORING.md#report-rows) (run skip).

Ref: `src/store/store-index.ts`, `src/orchestration/run-challenge.ts`.

## Score log: append-only, checked for nondeterminism

Grading never calls the model, never changes a bundle and never rewrites a score record; a scorer or rules change adds records under a new scorer digest. A nondeterministic scorer, or an execution with no record at the dataset's eval version, fails the snapshot build. A golden corpus fails `npm test` on any scoring-rules behaviour change until `SCORING_RULES` is bumped. Mechanism: [SCORING.md § Scorer digest and score records](./SCORING.md#scorer-digest-and-score-records), [§ Scoring rules version](./SCORING.md#scoring-rules-version); format: [ARCHIVE-FORMAT.md § Score log](./ARCHIVE-FORMAT.md#score-log).

Ref: `src/store/scores.ts` (`appendScores`, `conflicts`), `src/report/v4-rows.ts` (`scoredExecutions`), `src/scoring/rules.ts`, `src/scoring/rules-golden.test.ts`.

## Release freezing and verification

A frozen release's items are public and fixed: anyone holding the release directory recomputes its item-set digest with `./bench release verify`, and a released item changes only through a published erratum. The draft has no item-set digest, and `npm test` fails when its `release.json` is out of sync with `challenges/`. Mechanism: [ARCHIVE-FORMAT.md § Releases](./ARCHIVE-FORMAT.md#releases), [ERRATA.md § The coverage check](./ERRATA.md#the-coverage-check).

Ref: `src/release/release.ts` (`commitment`, `verifyRelease`, `loadRelease`), `src/config/errata.ts` (`coverageGaps`).

## Snapshot determinism and immutability

Anyone holding a snapshot's inputs (manifest, release, harness at its git sha, and the bundles) rebuilds it byte for byte: it carries no build timestamp and is named by the SHA-256 of its bytes, and a snapshot file is never rewritten. The bundles and archives are unpublished, so a reader verifies the release (`./bench release verify`) and cites the snapshot digest. Mechanism: [ARCHIVE-FORMAT.md § Snapshots](./ARCHIVE-FORMAT.md#snapshots), [ARCHITECTURE.md § Report pipeline](./ARCHITECTURE.md#report-pipeline).

Ref: `src/report/index.ts` (`buildSnapshot`, `snapshotFile`, `runReport`).

## Dataset membership

A dataset is exactly what its manifest lists. A v4 manifest names sealed bundles by digest, and every listed bundle must belong to the manifest's release; no directory scan, config list or naming convention decides membership. Rows never mix datasets: one snapshot is one manifest scored against one release's challenges at one eval version.

Ref: `src/dataset/manifest.ts`, `src/report/v4-rows.ts`. See [SCORING.md § Report rows](./SCORING.md#report-rows).

## Provenance before reuse

We maintain data provenance for every evaluation result. A result recorded in an older format is reused in a newer one only when its provenance is proven while converting it; otherwise the evaluation is rerun. Each dataset holds exactly one format. `./bench legacy convert` is the only path from a legacy archive into a v4 dataset. Mechanism: [ARCHIVE-FORMAT.md § Converting a legacy dataset](./ARCHIVE-FORMAT.md#converting-a-legacy-dataset).

Ref: `src/legacy/convert.ts`, `src/cli/commands/legacy.ts`.

## Legacy pins

The schemaVersion 1–3 archives are read-only and reproducible: a legacy manifest pins every attempt file and content-store blob by SHA-256, the reader reads only pinned bytes, and reconstruction is all-or-nothing per attempt. Legacy lines are graded into the score log, never by rewriting the archive. Release 0 is closed at eval version `0.7` and archival; its manifest's `rowsDigest` fails any build that would change its rows. Mechanism: [ARCHIVE-FORMAT.md § Pinned reads](./ARCHIVE-FORMAT.md#pinned-reads), [§ Verification](./ARCHIVE-FORMAT.md#verification); grading: [SCORING.md § Scorer digest and score records](./SCORING.md#scorer-digest-and-score-records).

Ref: `src/legacy/pinned.ts`, `src/legacy/content-store.ts`, `src/legacy/reconstruct.ts`, `src/cli/commands/score.ts`.

## Run provenance and privacy

Every bundle one run writes shares its `run.id` and records its contributor in `run.contributor` (`BENCH_CONTRIBUTOR`, default `local`). The header's `env.hardware` and `env.hardwareId` identify the machine by its specification only: no hostname, serial number, username, or email is written, and a `BENCH_CONTRIBUTOR` containing `@` is refused before any model starts. The hardware probe never fails a run; a field it cannot read is left out.

`env.weightsSource` dates the weights from the Hugging Face Hub: one request per config per run, carrying only the public repo id and revision (no user, host or path), with a 5 s timeout. It never fails a run: any failure records `publishedAt: null` ([EVAL-TIMING.md § Weights date](./EVAL-TIMING.md#weights-date)).

Ref: `src/orchestration/hardware.ts`, `src/orchestration/run-loop.ts`, `src/store/weights.ts`, `src/cli/commands/run.ts`.

## Report row selection

A cell counts exactly one complete run, the most recent; items are never pooled across runs, an incomplete run never counts, and rows from different contributors never merge. Mechanism: [SCORING.md § Report rows](./SCORING.md#report-rows).

Ref: `src/report/v4-rows.ts`, `src/legacy/rows.ts`.

## Scorer isolation

Code scorers (`code_exec` programs and `custom` scripts) never execute on the host, so running `score` over a contributed bundle cannot reach the maintainer's files or network. There is no host fallback: without Docker the item is a `scorer_error`. Mechanism: [SCORING.md § Isolated runner](./SCORING.md#isolated-runner).

Ref: `src/scoring/sandbox.ts`.

## Fail-fast config

All YAML loaders fully decode at startup. Malformed configurations, challenges, or system prompts, a configuration naming an unknown system prompt, unknown constraint `check` discriminators, and duplicate item names all surface as typed failures before any model spawns — never at execution time.

Ref: `src/config/configurations.ts`, `src/config/challenges.ts`, `src/config/system-prompts.ts`, `src/config/scenario-corpus.ts`.

## Error-channel discipline

Every fallible operation returns `Effect<A, TaggedError, R>`. Tagged errors live in `src/errors/<domain>.ts` (`config`, `game`, `io`, `llm`, `scorer`, `server`, `sse`, `store`) and are re-exported from the barrel. `scripts/lint-strict.sh` (run via `npm run lint`) enforces this by banning three patterns with explicit allowlists:

- `try {` — allowed only in `src/cli/main.ts`, `src/cli/subprocess-registry.ts`, and `src/interop/`.
- `throw ` — allowed only in `src/interop/` and `*.test.ts` files.
- `console.` — allowed only under `src/cli/`.

Ref: `src/errors/index.ts`, `scripts/lint-strict.sh`.
