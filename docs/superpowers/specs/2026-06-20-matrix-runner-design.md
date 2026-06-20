# Matrix Runner — Design

> _Spec, 2026-06-20._ One command that runs a matched set of configurations against a matched set of
> challenges, booting each model **once** and reusing it across all of that configuration's
> challenges. Output is the same per-attempt archives `report`/webapp already consume — this is an
> orchestration + selection layer over the existing per-attempt machinery, not a new archive format.

## 1. Motivation

Running a real benchmark today is a manual shell cross-product over `./bench submit`, and **each
`submit` boots and tears down the LLM server in its own scope** (`runChallenge` opens `Effect.scoped`
and boots `deps.llmServer(...)` inside it). A single model against six challenges reloads the model
six times; for multi-GB local models that reload dominates wall-clock. The fix is to lift server
lifetime from **per-attempt** to **per-configuration**.

## 2. Sequencing dependency

This spec assumes the obsolete-`run`-path removal
(`docs/superpowers/plans/2026-06-20-obsolete-run-path-removal.md`) lands **first**. That pass frees
the `run` command name and untangles `defaultRunEnv` / `RunModelDeps` / `RunEnv` from the run-only
code, leaving a single clean orchestration path. The matrix runner is then built on the tidy tree and
reclaims `run`.

## 3. Command surface — `bench run`

Reclaims the `run` verb. Mirrors `submit`'s loaders (system prompts → corpus → configs → challenges),
adds two pattern selectors and the sweep loop.

| Flag | Default | Meaning |
|---|---|---|
| `--configs <glob>` | all `active: true` configs | Glob (with brace alternation) over config `id` |
| `--challenges <glob>` | all `*.yaml` in dir | Glob over challenge **file stem** |
| `--challenges-dir <dir>` | `challenges` | Directory of challenge YAMLs |
| `--configs-file <file>` | `configs.yaml` | Configs YAML |
| `--prompts-dir <dir>` | `prompts` | Prompt corpus + system prompts |
| `--archive-dir <dir>` | `benchmark-archive` | Attempt archive output (also the cache scan root) |
| `--no-cache` | off (cache **on**) | Bypass the cross-attempt item cache |
| `--no-report` | off (report **on**) | Suppress the end-of-sweep `report` |
| `--verbose` / `-v` | off | Debug-level logging |

### 3.1 Selection semantics

- **Engine: picomatch v4** (already vendored transitively; promoted to a direct dependency, with
  `@types/picomatch`). Pure string matcher — no filesystem walk. Patterns are full-string anchored.
- **Syntax: glob + brace alternation.** `*`, `?`, `[…]`, and `{a,b,c}` alternation
  (`--configs '{code-config,logic-config}'`, `--configs 'qwen-{7b,14b}'`). `.`, `-`, and `/` are
  **literal** — verified: `qwen2.5-7b-mlx` does not match `qwen2X5-7b-mlx`. This is the one capability
  plain glob lacks and the only reason brace support is a hard requirement of the engine choice.
- **Configs** match against the config `id`. An explicit `--configs` pattern **overrides** the
  `active` gate — explicit intent wins; `active` governs only the zero-arg default set.
- **Challenges** match against the **filename stem** (e.g. `code.yaml` → `code`). Matching on the
  filename avoids parsing every challenge YAML just to select; the archive's challenge `id` still
  comes from the loaded YAML.
- **Empty match fails fast.** `--configs 'qwen*'` matching nothing → a clear error
  (`no configurations matched 'qwen*'`), not a silent empty sweep. Same for challenges.

### 3.2 Cross-product

Default to the **full cross product**: every matched configuration × every matched challenge. The
cross-attempt item cache (`findCachedItem`) makes re-running an already-covered cell nearly free, so
re-invoking the sweep to fill in a newly-added model or challenge is the intended workflow. No
explicit-pairs mode in v1.

## 4. Orchestration refactor (the core change)

Lift server lifetime above the per-challenge loop by splitting `src/orchestration/run-challenge.ts`:

### 4.1 `runChallengeWithServer(input, server)` — new exported inner

The current inner body of `runChallenge`, **minus** the scope and the boot. Takes an
already-booted `ServerHandle`:

```
runChallengeWithServer(
  input: RunChallengeInput,
  server: ServerHandle,
): Effect<AttemptManifest, FileIOError | JsonlCorruptLine, FS | Path | CommandExecutor | HttpClient | ChatCompletion>
```

Body: write header → write system blob → for each item `executeOrCacheItem(input, item,
server.peakRssKb)` → append → `aggregate` → `finalizeAttempt`. No `Effect.scoped`, no
`deps.llmServer(...)`. `executeOrCacheItem`, `findCachedItem`, `aggregate`, and the attempt-writer are
unchanged — they already operate at the right grain.

### 4.2 `runChallenge(input)` — preserved wrapper

Becomes a thin wrapper that keeps `submit` (and every existing `runChallenge` test) working
byte-for-byte:

```
Effect.scoped(
  server = deps.llmServer(modelFromConfig(input.config)).pipe(Effect.orDie)  // single submit → orDie is fine
  runChallengeWithServer(input, server)
)
```

`resumeChallenge` is **left unchanged**. It is not on the sweep path (only `submit --resume` uses it),
its inner logic genuinely differs (it reads the partial archive's body and executes only the missing
items), and its own per-attempt scope is correct for an interactive resume. Touching it would add risk
for no sweep benefit.

### 4.3 `runMatrix(input)` — new orchestrator (`src/orchestration/run-matrix.ts`)

The outer loop. **Strictly sequential** — one local model in memory at a time (v1 does not design for
parallel model serving; state it explicitly). For each matched configuration:

```
for (const config of configs) {                       // sequential
  row = yield* Effect.scoped(Effect.gen(function* () {
    const server = yield* deps.llmServer(modelFromConfig(config))   // booted ONCE per config
    const cells = []
    for (const challenge of challenges) {              // sequential, server reused
      const cell = yield* runChallengeWithServer({ ...perCellInput }, server).pipe(Effect.either)
      cells.push(toCell(config, challenge, cell))
    }
    return cells
  })).pipe(Effect.catchAll(bootErr =>                  // boot failed → whole row skipped
    Effect.succeed(challenges.map(ch => skippedCell(config, ch, bootErr)))
  ))
  matrix.push(...row)
}
```

Each cell mints a fresh `attemptId` (same shape `submit` uses,
`att-${configHash}-${challengeHash}-${Date.now()}`) and its own `archivePath`
(`${archiveDir}/${attemptId}.jsonl`), so every challenge is an independent finalized archive.

Grouping by configuration falls out naturally: different runtimes (`llamacpp` vs `mlx`) bind
different fixed ports, so iterating config-by-config means exactly one server is up at a time.

### 4.4 Failure isolation

- **Boot failure** (`ServerSpawnError | HealthCheckTimeout`) — caught at the row level; the **whole
  configuration row** is recorded `SKIPPED` with the reason, and the sweep continues to the next
  configuration. (Contrast `runChallenge`, which keeps `orDie` — correct for a single submit.)
- **Per-challenge typed I/O error** (`FileIOError | JsonlCorruptLine` from archive writes or the cache
  scan) — caught per cell via `Effect.either`; that **cell** is recorded `ERROR` with the reason, the
  server stays up, and the row continues to the next challenge.
- **Per-item model error** — already non-fatal today: `runPrompt` captures it on `ItemResult.error`
  and the item scores 0, so one bad prompt never aborts a cell. Unchanged.

### 4.5 Watch-items (verified against current code)

- **Peak RSS.** `ServerHandle.peakRssKb` is backed by a **scoped poller fiber**. With one boot per
  configuration the poller now spans the configuration's whole row, so per-item `peakMemoryGb`
  reflects the peak across all that config's challenges rather than per-challenge. Peak RSS is roughly
  constant after model load, so this is acceptable and arguably more representative. **Noted, not
  changed.**
- **`ctxSize`** stays per-configuration; the server boots with it. A future per-challenge ctx need
  would force a mid-row restart — out of scope for v1.
- **Interrupt safety** is unchanged per attempt: each challenge finalizes its own archive, so an
  interrupted sweep leaves completed cells intact. Re-invoking the sweep re-runs only uncovered cells
  (the item cache serves completed ones). **No `--resume` on the sweep in v1** — the cross-attempt
  item cache is the resume mechanism at cell grain. A challenge that was mid-flight at interrupt is
  left as an orphaned `interrupted: true` attempt and simply re-run on the next invocation.

## 5. Selection logic (`src/config/select.ts`)

A small pure module, no Effect / no IO, unit-testable in isolation:

- `selectConfigs(all: ResolvedConfiguration[], pattern?: string): ResolvedConfiguration[]` — when
  `pattern` is absent, return `all.filter(c => c.active === true)`; when present, return
  `all.filter(c => picomatch(pattern)(c.id))`.
- `selectChallengeStems(stems: string[], pattern?: string): string[]` — when absent, return all; when
  present, filter by `picomatch(pattern)`.

The command wires these between the loaders and `runMatrix`, then loads only the matched challenge
YAMLs. Empty results raise the fail-fast error described in §3.1.

## 6. Progress + summary output

**Live** — one line per cell as it resolves, prefixed with the configuration's position in the sweep:

```
[1/2 qwen2.5-7b-mlx] booting…
[1/2 qwen2.5-7b-mlx] code@1     → 0.80 PASS
[1/2 qwen2.5-7b-mlx] logic@1    → 0.40 FAIL
[2/2 smoke-config]   boot FAILED → row skipped (ServerSpawnError)
```

**End-of-run** — a matrix grid to stdout (configurations = rows, challenges = columns; each cell is
the score plus a PASS/FAIL marker, or `SKIP` / `ERR`), followed by a totals line (cells passed /
total, rows skipped). If `--report` is on (the default), `report` runs **after** this summary so the
sweep's own result is visible even if report generation later changes.

**Deferred to v1.1: a per-cell "cached" marker.** Showing that a cell ran entirely from cache would
confirm the cache-aware re-run workflow, but it requires `executeOrCacheItem` to thread a hit/miss
flag up through its return type (a ripple to its three call sites). v1 keeps cell status at
PASS / FAIL / ERR / SKIP.

## 7. Testing

TDD, headline test first:

1. **Server booted once, reused across challenges (the proof).** A fake `deps.llmServer` that counts
   invocations and a fake `ChatCompletion`; run **one configuration × two challenges**. Assert: the
   `llmServer` factory is called **exactly once**, two finalized archives are written, and the server
   scope closes once (boot count == teardown count == 1). This test is the direct proof the
   per-config-reload cost is gone.
2. **Failure isolation.** A two-config sweep where the first config's `llmServer` fails to boot →
   its row is recorded `SKIPPED` and the second config still runs to completion.
3. **Selection (pure).** `selectConfigs` / `selectChallengeStems` over fixtures: brace alternation,
   literal `.`/`-`, the `active` default, explicit-overrides-`active`, and the empty-match error.
4. **Preserved `runChallenge`.** The existing `runChallenge` / `resumeChallenge` tests stay green
   after the §4.2 refactor (the regression guard that the wrapper is behavior-preserving).

## 8. Out of scope (v1)

- Parallel model serving / concurrency across configurations.
- Per-challenge `ctxSize` (mid-row server restart).
- A sweep-level `--resume` (the item cache covers re-invocation).
- Explicit config×challenge pairs (only the full cross product).
- The per-cell "cached" marker (§6, deferred to v1.1).
