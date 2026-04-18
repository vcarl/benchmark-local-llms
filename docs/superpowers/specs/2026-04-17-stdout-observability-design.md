# Stdout Observability for `./bench run`

**Goal:** Make `./bench run` emit enough information about what it's doing and how fast it's going that a user watching the terminal can answer "what's happening, is it stuck, how is it performing" without opening the archive file — and enough additional intra-run detail under `--verbose` to diagnose why something went wrong.

## Problem

Today `./bench run` is effectively silent during execution. The only stdout it produces is one tab-separated summary line per model at the very end:

```
qwen3.5-9b	completed=38	skippedCached=2	errors=0	interrupted=false
```

Everything the harness already measures — per-call `promptTps`, `generationTps`, `wallTimeSec`, `peakMemoryGb`, cache hits, termination reasons, phase boundaries — is written only to the JSONL archive. A benchmark run that takes tens of minutes offers no indication it's still alive, no hint at which model/prompt/scenario is in flight, and no way to see why a scenario failed short of reading the archive after the fact.

The harness is built on Effect and already uses `Effect.log*` in a handful of CLI commands (`migrate`, `report`), but never in the hot path (`src/orchestration/`, `src/llm/servers/`, `src/game/`). The `scripts/lint-strict.sh` rule bans `console.*` outside `src/cli/`, so Effect's logger is the only available channel from those modules. This design turns that channel on.

## Design

### Stdout vs. stderr

- **Stdout** stays machine-oriented. The per-model final record stays on stdout (extended with more fields, see below). `./bench list-*`, `./bench score`, `./bench report` continue to write their records to stdout unchanged.
- **Stderr** carries everything else: phase boundaries, per-call progress, supervisor lifecycle, end-of-run summary block. Unix convention and it preserves the scriptability of stdout.

### Verbosity flag

One global flag on the root `llm-bench` command: `--verbose` / `-v`.

- unset → `LogLevel.Info` (default)
- set → `LogLevel.Debug`

No `--quiet`, no `-vv` — the Info/Debug split is the one that matters; lower tiers can be added later if a concrete need shows up.

### Logger wiring

A new `src/cli/logger.ts` exposes `makeLoggerLayer(verbose: boolean): Layer<…>` that:

1. Builds a custom `Logger.make` formatter writing to stderr.
2. Applies `Logger.minimumLogLevel(LogLevel.Debug)` when `verbose`, `LogLevel.Info` otherwise.
3. Replaces the default logger via `Logger.replace(Logger.defaultLogger, ...)`.

`src/cli/main.ts` pulls the flag value from `@effect/cli`'s root options and provides the layer to every subcommand.

### Log-line format

```
HH:MM:SS LEVEL scope | message [k1=v1 k2=v2 ...]
```

- `HH:MM:SS` — local time, no date (dates live in the archive).
- `LEVEL` — three-char tag (`INF`, `DBG`, `WRN`, `ERR`).
- `scope` — phase name: `run-loop`, `llm-server`, `admiral`, `gameserver`, `prompt`, `scenario`, `chat`, `health`, `cache`, `sse`, `watchdog`, `session`.
- `message` — free-form; phase word is always first so `grep '^.* prompt '` works.
- `k=v ...` — annotations attached via `Effect.annotateLogs` at scope boundaries (e.g. `model=qwen3.5-9b runtime=mlx`) appended after the message.

### Annotation boundaries

- `runModel` sets `model=<name> runtime=<r> quant=<q> runId=<id>` before its body runs, so every downstream log for that model carries those keys.
- `runPromptPhase` adds `phase=prompt`; `runScenarioPhase` adds `phase=scenario`.
- `runScenario` adds `scenario=<name>` within the scenario scope.

### Default-level (Info) content

**Run loop:**
- `run-loop | model 2/5: qwen3.5-9b (mlx-community/…, Q4_K_M)` on entry per model.
- `run-loop | skipping inactive model: <name>` / `run-loop | skipping (filter miss): <name>`.

**LLM server supervisor (`src/llm/servers/supervisor.ts`):**
- `llm-server | starting <runtime> on :<port> (pid=<n>)` after spawn, before health wait.
- `llm-server | healthy in <s>s` after health probe succeeds.
- `llm-server | stopping (SIGTERM, <grace>s grace)` when finalizer fires.
- `llm-server | escalating to SIGKILL` only if graceful shutdown timed out.

**Admiral + gameserver:**
- `admiral | starting on :<port>` / `admiral | healthy in <s>s` / `admiral | stopping`. If Admiral's boot doesn't expose a health-wait elapsed today, add one when wiring the log — the Effect boundary is already the right place for it.
- `gameserver | started on :<port>` per scenario (teardown is implicit in the scope close).

**Prompt phase (one line per `(prompt, temperature)` pair):**
- Fresh: `prompt 3/40 code_4 @0.7 → 127 gen tok, 18.3 tps gen, 142 tps prompt, 6.9s`.
- Cache hit: `prompt 3/40 code_4 @0.7 — cache hit (runId=<id>, executedAt=<iso>)`.
- Error: `prompt 3/40 code_4 @0.7 — ERROR: <truncated-to-200-chars>`.

Counters (`N/M`) reflect `(promptsIndex × temperaturesIndex) + 1` out of `prompts.length * temperatures.length`. `gen tok` is `generationTokens`; `tps gen` and `tps prompt` are `generationTps` and `promptTps` respectively — all three sourced directly from `ExecutionResult`. `wallTimeSec` renders with one decimal place (`6.9s`).

**Scenario phase (one line per scenario):**
- Fresh: `scenario 2/14 bootstrap_grind — natural, ticks=412, toolCalls=38, 94.2s`.
- Cutoff: `scenario 2/14 bootstrap_grind — cutoff:tokens (limit=4096), ticks=318, toolCalls=22, 88.1s`.
- Cache hit / error variants use the same shape as prompts.

**End-of-model summary (emitted before `runModel` returns, Info-level, stderr):**

```
─ qwen3.5-9b · mlx · Q4_K_M ──────────────────────
  prompts     38 completed · 2 cached · 0 errors
  scenarios   13 completed · 1 cached · 1 errors (cutoff:tokens)
  wall        3.4 min total · avg 18.2 tps gen · avg 142 tps prompt
  slowest     bootstrap_grind 94s · pathfinding 78s · code_4 42s
  archive     ./benchmark-archive/<runId>.jsonl
  interrupted false
```

Averages weight by `generationTokens` (avoids 0-token errored calls skewing the mean) and exclude cached results (cached entries carry perf from the source run, not this one). Slowest-3 comes from the union of prompt and scenario executions, sorted by `wallTimeSec` descending, excluding cached and errored results. If the model produced fewer than 3 eligible executions, the list is shorter.

Duration formatting in the block: under 60 seconds renders as `<s.s>s`; between 60 and 3600 seconds renders as `<m.m> min`; at or above 3600 renders as `<h.h>h`. The same rules apply to the cross-model roll-up's `total` field.

**Cross-model roll-up (emitted at end of `runLoop` when `perModel.length > 1`, Info-level, stderr):**

```
─ totals ─────────────────────────────────────────
  5 models · 186 completed · 12 cached · 3 errors · 18.7 min total
```

### Debug-level (`--verbose`) content

Same format, extra detail:

**`chat` scope (`src/llm/chat-completion.ts`):**
- `chat | POST <url> temp=<t> max_tokens=<n>` before each request.
- `chat | response 200 in <s>s, prompt_tokens=<n> gen_tokens=<n>` on success.
- `chat | error after <s>s: <tag>` on failure (in addition to the folded error on the Info line).

**`health` scope (`src/llm/servers/health.ts`):**
- `health | poll <n>/<max> → <statusOrErr> (retry <ms>ms)` per failed probe.
- `health | poll <n>/<max> → 200` on the successful probe that unblocks the supervisor.

**`cache` scope (`src/archive/cache.ts` + `src/orchestration/cache.ts`):**
- `cache | scanning <archiveDir> (<n> files) for key=(<artifact>,<promptName>,<hash>,<temp>)` before each lookup.
- `cache | <n> candidates, picked runId=<id> (most recent)` / `cache | 0 candidates`.

**`sse` scope (`src/game/admiral/sse.ts`):**
- `sse | tick=<n> event=<type>` per normalized event. Expected to be noisy — opt-in under Debug.

**`watchdog` scope (`src/game/session/watchdog.ts`):**
- `watchdog | elapsed=<s>s tokens=<n> toolCalls=<m> (limits: <wallSec>s/<tokens>/<toolCalls>)` at each watchdog tick.

**`session` scope (`src/game/session/run-session.ts`):**
- `session | configure profile <id> → 201` / `session | connect → 200` at each Admiral HTTP boundary.
- `session | tool_call name=<tool> args=<truncated-100-chars>` per tool event.

**`llm-server` supervisor extras:**
- `llm-server | proc.isRunning=<bool> before SIGTERM`.
- `llm-server | exit finalizer completed in <s>s (graceful=<bool>)`.

### Stdout record (machine-readable, extended)

Current single line becomes:

```
<model>\t<runtime>\t<quant>\tcompleted=<n>\tcached=<n>\terrors=<n>\twall=<s>\tgenTps=<f>\tinterrupted=<bool>\tarchive=<path>
```

- Tab-separated.
- First three fields are positional identifiers (`<model>`, `<runtime>`, `<quant>`). The old record had only `<model>` at field 1 — consumers reading field 2 or later by position must update.
- Remaining fields are `key=value`. The old `skippedCached=` key is renamed to `cached=` — consumers grepping `skippedCached=` must update.
- `wall=<s>` is `totalWallTimeSec` rendered as a decimal number of seconds (e.g. `wall=204.3`), not the human-friendly format used in the stderr block.
- `genTps=<f>` is the token-weighted average generation TPS over non-cached non-errored executions, rendered with one decimal place.
- `archive=<path>` is the full archive path as written by the writer.

### Implementation touchpoints

| Module | Change |
|---|---|
| `src/cli/logger.ts` (new) | `makeLoggerLayer(verbose)` + formatter |
| `src/cli/main.ts` | Pull `--verbose` from root command, provide logger layer |
| `src/cli/commands/run.ts` | Thread `--verbose`; emit extended stdout record (existing `console.log`) |
| `src/orchestration/run-loop.ts` | Per-model entry log, annotation scope, cross-model roll-up (stderr) |
| `src/orchestration/run-model.ts` | Annotation scope for `model/runtime/quant/runId` |
| `src/orchestration/phases.ts` | `phase=` annotation; per-prompt / per-scenario Info lines; aggregator threading |
| `src/orchestration/run-prompt.ts` | (minimal — perf fields come from `ExecutionResult`, logged by phases.ts) |
| `src/orchestration/run-scenario.ts` | (minimal — termination reason logged by phases.ts) |
| `src/orchestration/cache.ts` | Debug cache-scan logs |
| `src/orchestration/summary.ts` (new) | Per-model aggregator (slowest-3, token-weighted avg TPS), end-of-model block formatter, cross-model roll-up formatter |
| `src/llm/servers/supervisor.ts` | spawn / healthy / stopping / escalating / isRunning / exit-code logs |
| `src/llm/servers/health.ts` | Debug poll logs |
| `src/llm/chat-completion.ts` | Debug request/response logs |
| `src/game/admiral/server.ts` | start / healthy / stopping logs |
| `src/game/admiral/sse.ts` | Debug event logs |
| `src/game/session/run-session.ts` | Debug session boundary logs |
| `src/game/session/watchdog.ts` | Debug watchdog tick logs |

### Per-model aggregator

`src/orchestration/summary.ts` owns a small in-memory structure:

```ts
interface ModelAggregate {
  readonly promptStats: { completed: number; cached: number; errors: number };
  readonly scenarioStats: {
    completed: number;
    cached: number;
    errors: number;
    lastErrorReason: TerminationReason | null;
  };
  readonly tokenWeightedGenTpsNumerator: number; // Σ (genTps × genTokens) over non-cached non-error
  readonly tokenWeightedGenTpsDenominator: number; // Σ genTokens over non-cached non-error
  readonly tokenWeightedPromptTpsNumerator: number;
  readonly tokenWeightedPromptTpsDenominator: number;
  readonly slowestByWallTime: ReadonlyArray<{
    name: string;
    wallTimeSec: number;
    kind: "prompt" | "scenario";
  }>; // top-3 maintained in insertion order
}
```

`phases.ts` updates this via a `Ref<ModelAggregate>` threaded alongside the existing `statsRef`, then hands it to the summary formatter at end-of-model.

### Testing

- **`src/cli/__tests__/logger.test.ts`** — formatter unit tests: level tag rendering, scope prefix, annotation rendering (k=v), k=v sanitization (no unescaped spaces), truncation behavior for long messages.
- **`src/orchestration/__tests__/phases-logging.test.ts`** — capture logs via a test `Logger` sink. Assert:
  - Info lines for fresh prompts contain `promptName`, `temperature`, `generationTokens`, `generationTps`, `wallTimeSec`.
  - Cache-hit lines carry source `runId` + `executedAt`.
  - Debug lines for HTTP / cache / watchdog appear only when min level is Debug.
- **`src/orchestration/__tests__/summary.test.ts`** — aggregator correctness:
  - Token-weighted averages.
  - Cached + errored executions excluded from TPS averages.
  - Slowest-3 ordering across both prompts and scenarios.
  - Cross-model roll-up totals.
- **`src/cli/__tests__/run-stdout-record.test.ts`** — stdout record format: tab-separated, positional header (`model`, `runtime`, `quant`), remaining fields in the documented `key=value` order.
- **Existing ~440 tests** — expected green. Default test log level is Warning; emitted logs are not asserted in existing tests.

### Backwards compatibility

- **Stdout record:** breaking change. Positional field 1 (`<model>`) stays the same, but fields 2-3 are now `<runtime>` / `<quant>` (previously `completed=N` / `skippedCached=N`). The `skippedCached` key is renamed to `cached`. No known internal consumer, but any downstream shell glue reading field 2+ by position or grepping `skippedCached=` must update.
- **`--verbose` flag:** new; default `false` preserves today's behavior except for new stderr output.
- **Test baseline:** existing tests don't assert silence on stderr, so new stderr lines don't break them.

### Out of scope

- `--log-format=json` or structured-log export. Punt until a concrete consumer exists.
- ANSI/TTY-aware rendering (progress bars, cursor repaint). One line per event keeps piped output coherent.
- SSE sampling / rate-limiting knobs. If Debug is too noisy in practice, the next iteration can add `--log-filter=sse:warn` or similar.
- Peak-memory instrumentation. `peakMemoryGb` stays stubbed at 0 until the out-of-band probe described in `src/orchestration/run-prompt.ts` lands.
- Logging in `migrate` / `report` beyond what's already there. They already use `Effect.logInfo`; picking up the new logger layer is free and uniform.

## Acceptance

- `./bench run --model-name <m> --prompts-dir smoke-prompts --scenarios none --max-tokens 128 --archive-dir /tmp/x --fresh` on a terminal shows, on stderr, per-prompt progress lines, LLM-server boot/shutdown lines, and the end-of-model block.
- `./bench run … 2>/dev/null` on the same invocation emits only the stdout record(s) — scripting still works.
- `./bench run … --verbose` additionally emits `chat`, `cache`, and `health` detail.
- The archive file content is unchanged by this feature.
- All existing tests pass; the new tests above cover the aggregator and formatter.
