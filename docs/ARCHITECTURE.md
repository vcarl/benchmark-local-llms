# Architecture

> _Last verified: 2026-04-19 against commit `eae465c`. Update this line when edits to the doc are prompted by code changes._

The harness is layered so that each layer can be reasoned about (and tested) independently. All I/O and lifecycle is managed through Effect's `Scope` — opening a scope is the only way to acquire a subprocess or HTTP session, and closing it is the only way to tear one down. Errors travel through typed `Data.TaggedError` classes in the Effect error channel; `try`/`catch`/`throw`/`console.*` are banned outside `src/cli/` by `scripts/lint-strict.sh`.

## Layer map

```
src/cli/        — @effect/cli entry, flag parsing, dep wiring
├── main.ts                        Command composition + NodeRuntime.runMain
├── commands/{run,report,score,list}.ts
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
├── exact-match.ts
├── constraint.ts                  Constraint scorer entry point
├── constraint-checks.ts           20 check-type handlers
├── code-exec.ts                   Python subprocess via @effect/platform Command
└── game.ts                        14 scenario scorers (bootstrap_grind, navigation, …)

src/archive/    — RunManifest read/write + cross-run cache index
├── writer.ts                      header / appendResult / writeManifestTrailer
├── loader.ts                      Streaming JSONL reader
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
          runPromptPhase                      ─ one cell per (model × prompt), cache lookup
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

## Data flow

```
CLI flag parsing
  → orchestration (run loop, per-model scope)
    → llm (server supervisor + ChatCompletion client)
    → game (Admiral, gameserver, session) [scenarios only]
    → scoring (dispatch by corpus entry + scorer)
    → archive (manifest header + appended results)
report subcommand
  → archive (read .jsonl)
    → scoring (re-score against embedded or current corpus)
    → webapp data.js
```

## Where to look when…

| Problem | Start here |
|---|---|
| New scorer type | `src/schema/scorer.ts` (union) → `src/scoring/score-result.ts` (dispatch) → add scorer module |
| New constraint check | `src/schema/constraints.ts` (union) → `src/scoring/constraint-checks.ts` (handler) → `src/config/prompt-corpus.ts::preValidateConstraintChecks` |
| New runtime (not llamacpp/mlx) | `src/schema/enums.ts::Runtime` → `src/llm/servers/<new>.ts` (use `superviseServer`) → `src/cli/deps.ts::makeLlmServerFactory` |
| Shutdown hangs | `src/llm/servers/supervisor.ts` finalizer — interruptibility |
| Manifest trailer missing fields | `src/orchestration/finalize-archive.ts` — head-rewrite helper |
| Cache miss when expected | `src/archive/cache.ts` (scan) + `src/orchestration/cache.ts` (validate) |
| CLI flag plumbing | `src/cli/commands/<cmd>.ts` → `src/cli/commands/<cmd>-options.ts` → `src/cli/config/build.ts` |
| New report field | `src/report/webapp-contract.ts::WebappRecord` + `toWebappRecord` |

## Conventions

- **Effect error channel.** No thrown exceptions outside `src/cli/`. → see [`GUARANTEES.md` § Error-channel discipline](./GUARANTEES.md#error-channel-discipline).
- **Scope propagation.** Anything that acquires a subprocess, HTTP connection, or temporary file takes `Scope` in its environment. → see [`GUARANTEES.md` § Scope-managed resources](./GUARANTEES.md#scope-managed-resources).
- **Fail-fast config.** All YAML loaders fully decode at startup. → see [`GUARANTEES.md` § Fail-fast config](./GUARANTEES.md#fail-fast-config).
- **Self-contained archives.** Corpus travels in the archive. → see [`GUARANTEES.md` § Self-contained archives](./GUARANTEES.md#self-contained-archives).
- **One file per concept.** Files small enough to hold in context; split when a module approaches 300 lines along the boundary that makes parts independently testable.
