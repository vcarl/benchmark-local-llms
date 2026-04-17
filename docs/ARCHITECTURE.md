# Architecture

> _Last verified: 2026-04-17 against commit `0d008c4`. Update this line when edits to the doc are prompted by code changes._

The harness is layered so that each layer can be reasoned about (and tested) independently. All I/O and lifecycle is managed through Effect's `Scope` — opening a scope is the only way to acquire a subprocess or HTTP session, and closing it is the only way to tear one down. Errors travel through typed `Data.TaggedError` classes in the Effect error channel; `try`/`catch`/`throw`/`console.*` are banned outside `src/cli/` by `scripts/lint-strict.sh`.

## Layer map

```
src/cli/        — @effect/cli entry, flag parsing, dep wiring
├── main.ts                        Command composition + NodeRuntime.runMain
├── commands/{run,report,score,list,migrate}.ts
├── config/build.ts                Flag → RunLoopConfig
├── deps.ts                        makeRunDeps: llmServer / admiral / gameSession factories
└── paths.ts

src/orchestration/  — run loop + per-model lifecycle
├── run-loop.ts                    Outer: filter models, generate runIds, iterate
├── run-model.ts                   Effect.scoped: LLM server + prompts + scenarios + finalize
├── phases.ts                      runPromptPhase, runScenarioPhase
├── run-prompt.ts                  Single prompt × temperature → ExecutionResult
├── run-scenario.ts                Single scenario → ExecutionResult
├── cache.ts                       Cross-run cache lookup
└── finalize-archive.ts            Manifest trailer rewrite (read-truncate-append)

src/llm/        — LLM API + server supervisors
├── chat-completion.ts             OpenAI-compatible ChatCompletion service
└── servers/
    ├── supervisor.ts              Generic spawn + health + SIGTERM→SIGKILL finalizer
    ├── process-health.ts          Fork an exitCode watcher; expose Deferred
    ├── llamacpp.ts                llama-server invocation (port 18080)
    ├── mlx.ts                     mlx_lm.server invocation (port 18081)
    └── resolve-gguf.ts            HF repo + quant → local .gguf path

src/game/       — Admiral + gameserver + session
├── admiral/
│   ├── server.ts                  Supervise Admiral HTTP server
│   ├── client.ts                  HTTP client
│   ├── profile.ts                 configure → create → connect → (disconnect → delete)
│   └── sse.ts                     Admiral SSE consumer; idle timeout via Stream.timeoutFail
├── server/                        Gameserver supervisor + admin client
└── session/
    ├── run-session.ts             Per-scenario orchestrator
    └── watchdog.ts                CutoffWatchdog: wall-clock fiber + token/tool-call ref

src/scoring/    — dispatch by scorer type
├── score-result.ts                scoreExecution: pick scorer by corpus entry
├── strip-thinking.ts              Remove <think> / reasoning_content blocks
├── exact_match.ts
├── constraint.ts                  20 check-type variants
├── code_exec.ts                   Python subprocess via @effect/platform Command
└── game.ts                        14 scenario scorers (bootstrap_grind, navigation, …)

src/archive/    — RunManifest read/write + cross-run cache index
├── writer.ts                      header / appendResult / writeManifestTrailer
├── reader.ts                      Streaming JSONL reader
└── cache.ts                       Scan archiveDir for (artifact, promptName, promptHash, temp)

src/config/     — YAML loaders (fail-fast, typed errors)
├── models.ts                      models.yaml → ModelConfig[]
├── prompt-corpus.ts               prompts/*.yaml → PromptCorpusEntry[] (+ promptHash)
├── scenario-corpus.ts             prompts/scenarios/*.yaml → ScenarioCorpusEntry[]
├── system-prompts.ts              prompts/system-prompts.yaml → SystemPromptRegistry
└── yaml.ts                        Single YAML parse boundary

src/schema/     — @effect/schema definitions
├── run-manifest.ts
├── execution.ts                   ExecutionResult, AgentEvent
├── prompt.ts, scenario.ts, model.ts
├── scorer.ts                      4-variant union
├── constraints.ts                 20-variant union
├── enums.ts                       Runtime, TerminationReason, …
└── index.ts

src/errors/     — Data.TaggedError classes per domain
├── config.ts, llm.ts, game.ts, scorer.ts, io.ts, server.ts, sse.ts
└── index.ts

src/report/     — Archive → webapp/src/data/data.js
src/migrate/    — prototype jsonl → RunManifest
```

## Lifecycle: one `run` invocation

```
NodeRuntime.runMain
  runCommand handler (src/cli/commands/run.ts)
    loadSystemPrompts / loadModels / loadPromptCorpus / loadScenarioCorpus   [B1 loaders]
    buildRunLoopConfig (pure)
    makeRunDeps (llmServer / admiral / gameSession factories)
    runLoop (src/orchestration/run-loop.ts)
      for each model:
        makeOpenManifest
        runModel (Effect.scoped)              ─── scope A ───
          writeManifestHeader
          addFinalizer(finalizeArchive)       ─ rewrites line 1 at scope close
          llmServer(model)                    ─── scope A: llama-server / MLX ───
          runPromptPhase                      ─ prompts × temperatures, cache lookup
          if scenarios:
            admiral()                         ─── scope A: Admiral ───
            runScenarioPhase                  ─ per-scenario scope (gameserver, profile)
          set interrupted=false
          return outcome                      ─ triggers scope A close
```

Scope-close order is LIFO. The finalizers registered in `runModel` run last-added-first:

1. Scenario-phase gameserver scope (if any) — already torn down per-scenario
2. Admiral supervisor scope — SIGTERM→SIGKILL (admiral server)
3. LLM server supervisor scope — SIGTERM→SIGKILL (llama-server / mlx_lm.server)
4. `finalizeArchive` — overwrite manifest header with `finishedAt`, `interrupted`, final `stats`

On Ctrl-C the same teardown happens, except `interruptedRef` is never flipped to `false`, so the manifest's `interrupted` field is written `true`.

## Cross-run cache

Before calling the LLM for a `(prompt, temperature)` pair, `runPromptPhase` consults `src/archive/cache.ts`, which scans every `.jsonl` in the archive directory looking for a validated result with the same `(artifact, promptName, promptHash, temperature)`. A hit is carried forward into the new archive via `appendIfSaving` with a fresh `runId`. `--fresh` disables the scan.

Validation rejects cached results where `error !== null`, or (for prompts) `output` is empty. Ties broken by `executedAt` (most recent wins).

## Supervisor shutdown — interruptibility gotcha

`Effect.Scope` finalizers run inside an uninterruptible region. `Effect.timeout` cancels its operand via interruption; if the operand is uninterruptible, the timeout fires but the await keeps running, and the finalizer hangs forever.

This bites when `proc.kill("SIGTERM")` from `@effect/platform`'s `Command.Process` is used without wrapping: `proc.kill` sends the signal AND awaits exit, and llama-server with a full stderr pipe (the default, since `--verbose` is on and we don't drain stdio) doesn't respond to SIGTERM until the pipe drains.

Fix (`src/llm/servers/supervisor.ts`): wrap both `Effect.timeout(proc.kill(...), …)` calls in `.pipe(Effect.interruptible)` so the finalizer can actually escalate from SIGTERM → SIGKILL. Without this, a clean end-of-run hangs the entire process and the manifest never gets its trailer.

## Archive format

One `.jsonl` per `(model, runtime, quant)` run, named `{runId}.jsonl`. Line 1 is a `RunManifest` (header/trailer — overwritten on finalize with `finishedAt`, `interrupted`, final `stats`). Lines 2+ are `ExecutionResult` records, append-only.

Archives are **self-contained**: each manifest embeds the `promptCorpus` and `scenarioCorpus` keyed by name. Re-scoring (`./bench score`, `./bench report --scoring as-run`) reads straight from the manifest without touching the YAML corpus on disk.

## Scorer dispatch

```
scoreExecution(result, corpusEntry, systemPrompts)
  if promptCorpusEntry: switch entry.scorer.type
    exact_match → scoreExactMatch
    constraint  → scoreConstraints     (20 check-type functions)
    code_exec   → scoreCodeExec        (python3 subprocess, 10s timeout)
    game        → ScorerNotFound       (degenerate on a prompt)
  if scenarioCorpusEntry:
    GAME_SCORERS[entry.scorer](result, entry.scorerParams)
```

All scorers return `Score = { score: number [0,1], details: string, breakdown?: ... }`. Failures during scoring (process timeout, unknown constraint type) propagate as tagged errors; the report layer catches them, emits `score: 0` with `score_details: "scorer error: <tag>"`, and keeps going.

## Where to look when…

| Problem | Start here |
|---|---|
| New scorer type | `src/schema/scorer.ts` (union) → `src/scoring/score-result.ts` (dispatch) → add scorer module |
| New constraint check | `src/schema/constraints.ts` (union) → `src/scoring/constraint.ts` (handler) → `src/config/prompt-corpus.ts::preValidateConstraintChecks` |
| New runtime (not llamacpp/mlx) | `src/schema/enums.ts::Runtime` → `src/llm/servers/<new>.ts` (use `superviseServer`) → `src/cli/deps.ts::makeLlmServerFactory` |
| Shutdown hangs | `src/llm/servers/supervisor.ts` finalizer — interruptibility |
| Manifest trailer missing fields | `src/orchestration/finalize-archive.ts` — head-rewrite helper |
| Cache miss when expected | `src/archive/cache.ts` (scan) + `src/orchestration/cache.ts` (validate) |
| CLI flag plumbing | `src/cli/commands/<cmd>.ts` → `src/cli/commands/<cmd>-options.ts` → `src/cli/config/build.ts` |
| New report field | `src/report/webapp-contract.ts::WebappRecord` + `toWebappRecord` |

## Conventions

- **Effect error channel.** Every fallible operation returns `Effect<A, TaggedError, R>` — no thrown exceptions outside `src/cli/`. Tagged errors live in `src/errors/<domain>.ts`; the re-export hub is `src/errors/index.ts`.
- **Scope propagation.** Anything that acquires a subprocess, HTTP connection, or temporary file takes `Scope` in its environment. Callers wrap in `Effect.scoped` to decide cleanup boundaries.
- **Fail-fast config.** All YAML loaders fully decode at startup; a malformed `prompts/*.yaml` can't delay an error until prompt-run time.
- **Self-contained archives.** The corpus travels in the archive. Never rebuild it from the filesystem when re-scoring.
- **One file per concept.** Files are kept small enough to hold in context; if a module approaches 300 lines, split it along the boundary that makes the parts independently testable.
