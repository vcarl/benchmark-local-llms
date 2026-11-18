# Architecture

> _Last verified: 2026-06-20 against `9a651b2`._

The harness benchmarks local LLMs. Its atomic unit of work is an **attempt**: one `(configuration × challenge)` run. A configuration is a model + runtime + quant + sampling settings + system prompt; a challenge is a named, versioned set of scored items. One attempt produces one self-describing archive — see [ARCHIVE-FORMAT.md](./ARCHIVE-FORMAT.md).

The codebase is layered, and three rules hold across every layer:

- **All subprocess and HTTP lifecycle is `Scope`-managed.** The LLM server is acquired inside an `Effect.scoped` region; when the scope closes — normally or on interrupt — its finalizer tears the process down (SIGTERM, then SIGKILL).
- **Errors travel as typed `Data.TaggedError` in the Effect channel.** A failure is a value with a `_tag`, not a thrown exception. Operational outcomes (a scorer rejecting an answer, an LLM timing out) are folded into results; only genuine defects use `orDie`.
- **`try` / `throw` / `console.*` are banned outside `src/cli/`**, enforced by `scripts/lint-strict.sh`. The CLI layer is the one place allowed to touch `process`, log to the console, and use `try`/`throw`, because it owns the boundary with the outside world.

## Layer map

```
src/cli/                 process boundary — argv, exit codes, console, subprocess safety net
  main.ts                wires subcommands (run, report, score, export, list-models, list-prompts)
  commands/run.ts        sweep matched configurations × challenges → one attempt archive per cell
  commands/report.ts     aggregate attempts → webapp data + detail files
  commands/score.ts      re-score an attempt archive in place
  commands/export.ts     bundle an attempt + its blobs into a portable archive
  commands/list.ts       read-only challenge-item / model sanity checks
  deps.ts                production wiring of the LLM-server factory
  subprocess-registry.ts process-level safety net (SIGHUP / uncaughtException / exit)
  logger.ts, paths.ts    log layer + canonical path helpers

src/orchestration/
  run-challenge.ts       attempt orchestrator: scope, server boot, per-item execute-or-cache, score, finalize; aggregate(); resume + ResumeMismatchError
  run-prompt.ts          one prompt → completion → output/reasoning split → result assembly
  run-loop.ts, hardware.ts  run env: git sha, hardware profile + hardwareId (probed once per process)

src/llm/
  chat-completion.ts     OpenAI-compatible HTTP client for both runtimes (port per runtime)
  servers/supervisor.ts  generic server supervisor: health gate, SIGTERM→SIGKILL finalizer, peak-RSS sampling
  servers/*              runtime-specific spawners (llamacpp, mlx, omlx), artifact + runtime-version resolution

src/scoring/
  dispatch.ts            scoreByConfig: dispatch a scorer config to its scorer by type
  strip-thinking.ts      split reasoning from answer when the runtime inlined it
  exact-match.ts, constraint.ts, code-exec.ts, custom.ts   the scorers

src/config/
  configurations.ts      load configs.yaml, resolve identity (configHash)
  challenges.ts          load a challenge YAML, resolve its inline items + challengeHash
  system-prompts.ts      load the root system-prompts.yaml registry
  hashing.ts             12-hex SHA-256 identity hashes; yaml.ts the parser

src/schema/              Effect Schema definitions: attempt (manifest + item), configuration,
                         challenge, prompt, model, scorer, enums; run-manifest.ts exports RunEnv

src/archive/
  attempt-writer.ts      header write / item append / finalize / atomic full rewrite
  content-store.ts       content-addressed blob store (prompts / scorers / system)
  cache.ts               cross-attempt item cache lookup

src/report/
  index.ts               pipeline entry (runReport)
  load-attempts.ts       parse *.jsonl archives into LoadedAttempt
  aggregate.ts           completed-only filter and dedup: the attempts that get a detail file
  rows.ts                selection: rows per config × machine over the challenge set (__BENCHMARK_ROWS)
  model-key.ts           modelKey: the model identity GGUF / MLX builds share
  write-data-js.ts       emit webapp/src/data/data.js
  write-details.ts       emit per-attempt drilldown JSON
  reconstruct.ts         rebuild an attempt from .jsonl + content store

src/errors/              typed Data.TaggedError classes, re-exported from index.ts
```

## Attempt lifecycle

`run` executes each `(configuration × challenge)` cell as one attempt, in order:

1. **Resolve inputs.** Load `configs.yaml`, the challenge YAML, and the system-prompt registry. Find the configuration by id (an unknown id is a hard `dieMessage`). Resolve the challenge's inline items directly, computing every identity hash. Build an `attemptId` of the form `att-<configHash>-<challengeHash>-<timestamp>`.
2. **Open the archive.** Inside `Effect.scoped`, write line 1 — the `AttemptManifest` header — in its open state (`finishedAt: null`, `interrupted: true`, zeroed aggregate). Write the resolved system-prompt blob to the content store.
3. **Boot the LLM server.** `run` boots the runtime's server **once per configuration** and reuses it across that configuration's challenges. A server that won't boot skips the whole configuration's row — every cell is recorded `SKIPPED` and the sweep continues to the next configuration. (The single-attempt `runChallenge` wrapper instead `orDie`s, having nothing to recover to.) The supervisor spawns the process, waits on its health endpoint, registers it with the process-level safety net, and forks a peak-RSS poller.
4. **Run each item.** For every challenge item: write its prompt and scorer blobs to the content store, then for each of its samples (one unless `--samples`) either serve a cross-attempt cache hit (copied verbatim from an attempt on this machine, stamped with `cachedFrom`) or execute it freshly via `runPrompt` with a random seed. Score the cleaned output with `scoreByConfig` — a scorer error folds to score 0, never a crashed attempt. An item whose execution carried an `error` scores 0. Append each resulting `ItemResult` as a new line.
5. **Finalize.** Aggregate the items into `{ score, passed }` (`score` = fraction of items scoring exactly 1; `passed` = `score >= passThreshold`), then rewrite line 1 with `finishedAt`, `interrupted: false`, the filled aggregate, and the generated/replayed line counts. Body lines are never touched once appended.

The header→append→finalize order is what makes interruption safe: if the process dies before finalize, the archive keeps `interrupted: true` and `finishedAt: null`, and the report ignores it. An interrupted sweep is simply re-run: the cross-attempt item cache serves already-completed items verbatim, so re-invoking `run` only re-executes the gaps. (The lower-level `resumeChallenge` — re-resolve config and challenge, validate their hashes against the partial header, execute only the missing items, re-aggregate, finalize — remains in the orchestrator but is not exposed by the current CLI.)

## Report pipeline

`report` turns attempt archives into the webapp's data, one dataset at a time — the main archive against `--challenges-dir`, then the pilot (`<archive-dir>-next` against `<challenges-dir>-next`) when both exist and `--no-pilot` is not given:

```
per dataset: loadAttemptArchives → buildRows + detailSources
then:        writeDataJs → writeDetails
```

1. **`loadAttemptArchives`** reads every `*.jsonl` under the archive directory, decoding line 1 as an `AttemptManifest` and lines 2+ as `ItemResult`s. A file that fails to parse becomes a collected load issue, not a failure.
2. **`buildRows`** (`src/report/rows.ts`) selects the ranking: one row per `configHash × hardwareId` over the dataset's challenge set, with per-challenge cells, completeness, freshness, execution provenance, and the `modelKey` that groups builds of one model (`configs.yaml` `modelKey` overrides it). The rules are in [SCORING.md § Report rows](./SCORING.md#report-rows).
3. **`detailSources`** keeps the **completed** attempts (`finishedAt` set and `interrupted: false`), deduplicated by `attemptId` (first wins); incomplete and duplicate attempts are counted.
4. **`writeDataJs`** writes `globalThis.__BENCHMARK_ROWS = [...]`, one entry per dataset, main first, on one line to `webapp/src/data/data.js`. It is the webapp's only input.
5. **`writeDetails`** writes one `webapp/public/details/<attemptId>.json` per completed, reconstructible attempt, joining the reconstructed prompt / scorer / system text with the in-memory output, reasoning, score, and error. A non-reconstructible attempt is skipped gracefully — its row still appears in `data.js`, only its drilldown is absent.

`RowsDataset` (`src/report/rows.ts`) is the backend→webapp contract. `webapp/src/lib/rows.ts` mirrors the fields the webapp reads; there is no compile-time link between the two files, so a change to one must be mirrored in the other.

## Reasoning split

A completion's text is separated into `output` / `reasoning` / `rawOutput` / `error` **once**, at completion time, in `run-prompt.ts`:

- If the runtime already split reasoning into a distinct API field (`reasoning_content` on llama.cpp, `reasoning` on mlx_lm.server), that body is trusted verbatim and no stripping occurs — except that a `length`-stopped `output` identical to its `reasoning` (oMLX flushes unclosed thinking into `content` when the budget runs out) is no answer: `output` becomes `""` (`echoesTruncatedReasoning` in `src/scoring/failure-kind.ts`; `bench score` applies the same rule to archived lines).
- Otherwise the model may have inlined thinking into the answer (`<think>…</think>` or Harmony channel markers). `stripThinkingTags` recovers it: cleaned answer → `output`, extracted thinking → `reasoning`, and `error: "thinking_truncated"` when an unclosed think block means no answer was produced.
- `rawOutput` always preserves the original API content for audit.

Scorers consume the already-cleaned `output` and never re-strip. The split happens exactly once and lives entirely outside the scoring layer.

## Where to look when…

| You want to… | Start here |
|---|---|
| Add a new scorer type | `src/schema/scorer.ts` (add the config variant), then a new case in `src/scoring/dispatch.ts` and its scorer module |
| Add a new runtime | `src/llm/servers/` (a spawner over `supervisor.ts`), the port map in `src/llm/chat-completion.ts`, the `Runtime` enum in `src/schema/enums.ts`, and the factory in `src/cli/deps.ts` |
| Debug a shutdown that hangs | `src/llm/servers/supervisor.ts` — the SIGTERM→SIGKILL finalizer and its bounded, interruptible kill timeouts |
| Add a new report field | `src/report/rows.ts` **and** `webapp/src/lib/rows.ts` together (the contract is hand-maintained) |
| Know what counts as a pass | An item passes when its `score === 1`; the same definition (`passFraction`) drives the attempt aggregate and each cell's `passed` |

## Conventions

- **Effect error channel.** Failures are typed `Data.TaggedError` values; expected outcomes are folded into results, and only defects use `orDie`. See [GUARANTEES.md](./GUARANTEES.md#error-channel-discipline).
- **Scope propagation.** Every subprocess and server is acquired in an `Effect.scoped` region whose finalizer guarantees teardown. See [GUARANTEES.md](./GUARANTEES.md#scope-managed-resources) and [#graceful-shutdown-sigterm--sigkill](./GUARANTEES.md#graceful-shutdown-sigterm--sigkill).
- **Fail-fast config.** Configuration and challenge resolution validates eagerly; an unknown id or an undecodable YAML stops the run before any model is touched. See [GUARANTEES.md](./GUARANTEES.md#fail-fast-config).
- **Self-sufficient archives.** An attempt's `.jsonl` plus its referenced content blobs are everything needed to reconstruct, re-score, or export it. See [GUARANTEES.md](./GUARANTEES.md#self-sufficient-archives) and [ARCHIVE-FORMAT.md](./ARCHIVE-FORMAT.md#content-store).
- **One file per concept.** Each module owns a single concern — one scorer per file, one writer for the archive, one client for completions — so the layer map above reads as a table of contents.
