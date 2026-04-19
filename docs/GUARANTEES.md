# Guarantees

> _Last verified: 2026-04-19 against commit `eae465c`._

The harness commits to a small set of invariants. Each section names the invariant, explains what it means, and points at the canonical implementation.

## Scope-managed resources

Every subprocess, HTTP session, and SSE connection is acquired inside an `Effect.Scope`. Closing the scope runs all registered finalizers in LIFO order. Acquisition implies guaranteed release; there is no path through normal completion or interruption that leaves a process running. The LLM server finalizer is installed before the health wait so a boot-time timeout still escalates cleanly.

Ref: `src/orchestration/run-model.ts` (scope wrapping), `src/llm/servers/supervisor.ts` (server finalizer registration).

## Graceful shutdown: SIGTERM → SIGKILL

The server supervisor sends SIGTERM, waits up to 10s for clean exit, then escalates to SIGKILL. The grace period is the `gracefulShutdownSec` parameter (default `10`). Both kill calls are wrapped in `Effect.interruptible` and bounded by `Effect.timeout` so a child that ignores SIGTERM — or a kernel that stalls on SIGKILL — cannot hang the finalizer. On ungraceful parent exit (SIGHUP, crash), a process-level safety net in `src/cli/subprocess-registry.ts` tears the child down instead.

Ref: `src/llm/servers/supervisor.ts`.

## Interruption safety

Ctrl-C does not skip archive finalization. A scoped finalizer in `runModel` rewrites the manifest header with final `stats` and `finishedAt` regardless of how the run ended. `interrupted` starts `true` and is flipped to `false` only on natural completion, so any path that skips the flip (interrupt, failure) preserves `interrupted: true`.

Ref: `src/orchestration/finalize-archive.ts`, `src/orchestration/run-model.ts`.

## Archive atomicity

Line 1 of each `.jsonl` is the `RunManifest` and is overwritten exactly once at finalize. Lines 2+ are `ExecutionResult` records appended one at a time with `flag: "a"` — once written they are never modified or removed. The trailer rewrite reads the full file, re-encodes line 1, and re-appends the body verbatim; the body is not round-tripped through the decoder.

Ref: `src/archive/writer.ts`, `src/orchestration/finalize-archive.ts`.

## Cross-run cache validity

A cached result is reused only when `(artifact, promptName, promptHash, temperature)` match exactly. Manifests are fast-filtered on `artifact` before result lines are scanned. Validation rejects entries where `error !== null`; prompt results additionally require non-empty `output`, and scenario results require non-null `terminationReason`. Ties broken by `executedAt` — most recent wins. `--fresh` short-circuits the lookup to `None`.

Ref: `src/archive/cache.ts` (scan), `src/orchestration/cache.ts` (validation).

## Self-contained archives

Each `RunManifest` embeds the `promptCorpus` and `scenarioCorpus` as records keyed by entry `name`. Re-scoring (`./bench score`, `./bench report --scoring as-run`) reads straight from the manifest and never touches the YAML corpus on disk. `--scoring current` is the explicit opt-in to re-read `prompts/`.

Ref: `src/schema/run-manifest.ts`, `src/orchestration/run-model.ts`, `src/cli/commands/report.ts`.

## Fail-fast config

All YAML loaders fully decode at startup. Malformed `prompts/*.yaml`, unknown `system:` keys, unknown constraint `check` discriminators, and duplicate prompt names surface before the first model spawns — never at prompt-run time.

Ref: `src/config/` (see `prompt-corpus.ts` for the loader shape).

## Error-channel discipline

Every fallible operation returns `Effect<A, TaggedError, R>`. Tagged errors extend `Data.TaggedError` and live in `src/errors/<domain>.ts` (`config`, `llm`, `game`, `scorer`, `io`, `server`, `sse`). `scripts/lint-strict.sh` in `npm run lint` bans three patterns with per-pattern exceptions:

- `try {` — allowed only in `src/cli/main.ts`, `src/cli/subprocess-registry.ts`, and `src/interop/`.
- `throw ` — allowed only in `src/interop/`.
- `console.` — allowed only under `src/cli/`.

Ref: `src/errors/index.ts`, `scripts/lint-strict.sh`.

## Re-scoring stability

`./bench score --archive FILE` and `./bench report --scoring as-run` score the archive against its own embedded corpus, so output is stable across runs as long as the scorer code is unchanged. `--scoring current` re-scores against the current `prompts/` corpus on disk. Scores are transient by design — the archive format stores `ExecutionResult` without a score field, so re-scoring never mutates the archive.

Ref: `src/scoring/score-result.ts`, `src/cli/commands/score.ts`, `src/cli/commands/report.ts`.
