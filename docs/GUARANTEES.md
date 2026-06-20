# Guarantees

> _Last verified: 2026-06-20 against `9a651b2`._

The harness runs work as **attempts** — one `(configuration × challenge)` pairing executed by `submit`. Around that unit it commits to a small set of invariants. Each section names an invariant, explains what it means today, and points at the canonical implementation. For the on-disk shape these guarantees protect, see [ARCHIVE-FORMAT.md](./ARCHIVE-FORMAT.md).

## Scope-managed resources

Every subprocess, HTTP session, and SSE connection is acquired inside an `Effect.Scope`. Closing the scope runs all registered finalizers in LIFO order, so acquisition implies guaranteed release — no path through completion or interruption leaves a resource live. An attempt runs entirely inside `Effect.scoped`, and the LLM server is acquired within that scope. Its shutdown finalizer is installed **before** the health wait, so even a boot-time health timeout escalates termination cleanly instead of orphaning a half-started server.

Ref: `src/orchestration/run-challenge.ts`, `src/llm/servers/supervisor.ts`.

## Graceful shutdown: SIGTERM → SIGKILL

The server supervisor sends SIGTERM, waits `gracefulShutdownSec` (default `10`) for a clean exit, then escalates to SIGKILL. Both kill calls are bounded by `Effect.timeout` and made `Effect.interruptible`, so a child that ignores SIGTERM — or a kernel that stalls on SIGKILL — cannot hang the finalizer. An ungraceful parent exit (SIGHUP, uncaught exception, sudden `process.exit`) bypasses Effect finalizers entirely, so a process-level safety net tracks every spawned PID and tears the child (and its process group) down instead.

Ref: `src/llm/servers/supervisor.ts`, `src/cli/subprocess-registry.ts`.

## Interruption safety

An attempt's header is written in an open state — `interrupted: true`, `finishedAt: null` — and is flipped to completed (`interrupted: false`, `finishedAt` set, aggregate filled) only on a clean finish. Any interrupt or failure path leaves the header in its open state, and the report ignores such attempts. Resume re-runs only the items missing from the partial body.

Ref: `src/archive/attempt-writer.ts`, `src/orchestration/run-challenge.ts`.

## Archive atomicity

Line 1 — the manifest — is overwritten exactly once at finalize, via a header-only rewrite that re-encodes the first line and re-appends the body bytes verbatim. Appended item lines are never modified once written. The one path that rewrites a whole archive in place, in-place re-scoring (`score`), is **atomic**: it encodes to a sibling temp file and `rename`s over the target (an atomic replace on the same filesystem), so a partial or failed write never corrupts the existing archive — the target is untouched until the rename lands.

Ref: `src/archive/attempt-writer.ts` (`writeAttemptHeader` / `appendItem` / `finalizeAttempt` / `rewriteAttempt`).

## Self-sufficient archives

Every archive carries a content store: the resolved system prompt, each item's full prompt text, and each item's scorer config, written as blobs keyed by `configHash` / `promptHash` / `scorerHash`. Given only the `.jsonl` plus its referenced blobs, the harness can reconstruct the exact prompt, system prompt, and scorer behind every recorded result — with no corpus or challenge YAML on disk. Reconstruction is all-or-nothing per attempt: a missing blob or an item without a `scorerHash` fails the whole reconstruction with a typed `NotReconstructible` result rather than degrading.

Ref: `src/archive/content-store.ts`, `src/report/reconstruct.ts`. See [ARCHIVE-FORMAT.md#content-store](./ARCHIVE-FORMAT.md#content-store).

## Cross-attempt cache validity

When executing an item, the harness reuses a previous result only from a **completed** attempt (`finishedAt` set and `interrupted: false`) whose header matches `(configHash, challengeId, challengeVersion)` and that contains an item with the same `itemHash`. Among matches, the most recent `executedAt` wins. A hit is copied **verbatim** — original timestamp, token counts, throughput, and wall time preserved — so measured efficiency always reflects real cost, never a cache artifact. `--no-cache` bypasses the lookup and forces fresh execution.

Ref: `src/archive/cache.ts` (`findCachedItem`), `src/orchestration/run-challenge.ts`.

## Resume identity safety

Resuming an attempt re-resolves the configuration and challenge, then validates the resolved hashes against the partial archive's header. A disagreement on `configHash` or `challengeHash` fails loudly with `ResumeMismatchError` and leaves the archive untouched — mismatched items are never appended onto an attempt with a different identity.

Ref: `src/orchestration/run-challenge.ts` (`resumeChallenge`).

## Re-scoring stability and identity preservation

`score` re-applies scorers to recorded outputs and never calls the model. By default it re-scores from the content store, needing no corpus or challenge YAML; `--corpus` instead resolves the current on-disk challenge and scores against it. Either way it never rewrites identity or provenance fields — `challengeHash` and every other recorded identity stay as written; a clean identity requires a real re-run via `submit`. In the corpus path a guard keeps the stored score for any item whose `promptHash` has drifted from the resolved corpus, so only genuinely matching items are re-applied.

Ref: `src/cli/commands/score.ts`, `src/orchestration/run-challenge.ts` (`aggregate`).

## Fail-fast config

All YAML loaders fully decode at startup. Malformed configurations, challenges, or prompts, unknown `system:` keys, unknown constraint `check` discriminators, and duplicate prompt names all surface as typed failures before any model spawns — never at execution time.

Ref: `src/config/configurations.ts`, `src/config/challenges.ts`, `src/config/prompt-corpus.ts`, `src/config/system-prompts.ts`.

## Error-channel discipline

Every fallible operation returns `Effect<A, TaggedError, R>`. Tagged errors live in `src/errors/<domain>.ts` (`config`, `game`, `io`, `llm`, `scorer`, `server`, `sse`) and are re-exported from the barrel. `scripts/lint-strict.sh` (run via `npm run lint`) enforces this by banning three patterns with explicit allowlists:

- `try {` — allowed only in `src/cli/main.ts`, `src/cli/subprocess-registry.ts`, and `src/interop/`.
- `throw ` — allowed only in `src/interop/` and `*.test.ts` files.
- `console.` — allowed only under `src/cli/`.

Ref: `src/errors/index.ts`, `scripts/lint-strict.sh`.
