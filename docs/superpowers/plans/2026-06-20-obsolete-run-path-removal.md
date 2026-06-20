# Cleanup plan: remove the obsolete per-model `run` path

> _Drafted 2026-06-20. A removal checklist for a later pass — nothing here has been deleted yet._

## Why this is obsolete

The harness now records work as **attempts** (`submit` → one `(configuration × challenge)` archive → `report` → webapp). The earlier per-model entry point — `run`, its prompt/scenario loop, the game/scenario subsystem, and the `RunManifest`/`ExecutionResult` archive format — has been fully superseded:

- `report` reads **only** attempt archives (`loadAttemptArchives` decodes `AttemptManifest`). It cannot consume `RunManifest`/`ExecutionResult` output, so `./bench run` → `./bench report` is already a dead pipeline.
- Scoring, archival, and the webapp are all built on the attempt grain.

`run` still appears in `./bench --help` until this pass runs. The reference docs (README, ARCHITECTURE, CONFIG, GUARANTEES, ARCHIVE-FORMAT) have already been rewritten to describe **only** the attempt pipeline.

## Bucket A — safe to delete (reachable only from `run`)

These have no importer among the surviving commands (`submit`, `report`, `score`, `export`, `list-models`, `list-prompts`):

- `src/cli/commands/run.ts`, `src/cli/commands/run-options.ts`, `src/cli/config/build.ts` (the `RunLoopConfig` builder)
- `src/state/run-state.ts` (run-state persistence / `--fresh`)
- `src/orchestration/completion.ts`, `summary.ts`, `phases.ts`, `run-scenario.ts`, `finalize-archive.ts`
- `src/archive/writer.ts`, `src/archive/loader.ts` (`RunManifest` writer/loader — imported only by the obsolete orchestration files above)
- The whole game/scenario subsystem: `src/game/**`, `src/scoring/game.ts`, `src/errors/game.ts`
- `src/schema/scenario.ts`
- Data: `prompts/scenarios/`, `benchmark-archive/.run-state.json`

Also unregister `runCommand` from `src/cli/main.ts`.

## Bucket B — keep (used by the attempt pipeline)

Everything under `src/report/`, `src/scoring/` (except `game.ts`), `src/llm/`, `src/config/` (loaders for configs/challenges/prompts/system-prompts + hashing), `src/archive/{attempt-writer,content-store,cache}.ts`, most of `src/schema/`, and `src/cli/{deps,logger,paths,subprocess-registry}.ts`. Notably **`src/orchestration/run-prompt.ts` stays** — it is shared by the attempt orchestrator (`run-challenge.ts`).

## Bucket C — entangled (extract the surviving symbol, then delete the rest)

These files are mostly obsolete but each exports something a survivor still imports. Each needs a small extraction before its obsolete remainder can go:

| File | Surviving symbol(s) | Used by | Extraction |
|---|---|---|---|
| `src/orchestration/run-loop.ts` | `defaultRunEnv` | `src/cli/commands/submit.ts` | Move `defaultRunEnv` (builds a `RunEnv`) into a small shared module (e.g. alongside `run-challenge.ts` or a `run-env.ts`); delete the rest of `run-loop.ts`. |
| `src/orchestration/run-model.ts` | dependency **types** `RunModelDeps`, `LlmServerFactory` (and any sibling factory types) | `src/cli/deps.ts`, `src/orchestration/run-challenge.ts` | Lift the surviving types into their own module (e.g. `run-deps.ts`); delete the `runModel` function and its run-only types. |
| `src/schema/run-manifest.ts` | `RunEnv` | `src/schema/attempt.ts`, `run-challenge.ts`, `defaultRunEnv` | Move `RunEnv` to its own schema module; delete `RunManifest` / `RunStats`. |
| `src/config/scenario-corpus.ts`, `src/config/models.ts`, `models.yaml` | scenario + model enumeration | `src/cli/commands/list.ts` (`list-prompts` prints scenarios; `list-models` reads `models.yaml`) | Decide the future of `list-models`/`list-prompts`: drop scenario enumeration from `list-prompts`, and either retire `list-models` or repoint it at `configs.yaml`. Then these become deletable. |

## Suggested order

1. Extract the Bucket C survivors (`defaultRunEnv`, the dep types, `RunEnv`) into their own modules; update importers; confirm `npm run typecheck` + `npm run test` green.
2. Decide `list-models`/`list-prompts` scope (drop scenarios; repoint or retire `list-models`).
3. Delete Bucket A files + the now-emptied Bucket C remainders; unregister `runCommand`.
4. Run `tracing-dead-code-after-deletion` to sweep newly-orphaned helpers, types, fixtures, and tests.
5. Update `./bench --help` expectations in the `qa` skill if the surviving subcommand set changes.
