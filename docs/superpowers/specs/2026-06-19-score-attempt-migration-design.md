# `score` — migrate to the attempt archive format (re-score in place)

> Status: design approved 2026-06-19. Builds on the Challenge × Configuration reframe
> (`docs/superpowers/specs/2026-06-18-challenge-config-reframe-design.md`) and Phase 4
> (cache + resume: `docs/superpowers/specs/2026-06-19-phase-4-cache-resume-design.md`),
> which gave `ItemResult` a persisted `score` field. Surfaced by `/qa` A7
> (`docs/superpowers/specs/2026-06-19-qa-skill-design.md`). Branch: `challenge-config-reframe`.
> An implementation plan follows via writing-plans.

## Problem

The `score` subcommand (`src/cli/commands/score.ts`) still reads the **legacy** archive format: it
calls `loadManifest` from `src/archive/loader.js`, expects `ExecutionResult` rows + an embedded
`promptCorpus`/`scenarioCorpus`, and prints a `model\tpromptName\ttemp\tscore` table to stdout. None
of that exists in the new attempt format. Pointed at a real `AttemptManifest`/`ItemResult` archive,
it fails with a `JsonlCorruptLine`-class error — this is the known bug `/qa` A7 reports as
FAIL(known bug).

The command was stdout-only for a single reason: the legacy `ExecutionResult` had **no** score field,
so a re-score could not be persisted (see the comment in the current `score.ts` head). The new
`ItemResult` carries a required `score` field (`src/schema/attempt.ts:22`), removing that constraint.

## Goal

Re-apply scorers to an existing attempt archive's stored outputs and **write the updated per-item
`score`s + recomputed aggregate back into the SAME file in place**, so `report`/webapp reflect them.
This enables a tight scorer-iteration loop: **edit a scorer → `./bench score --archive X` →
`./bench report`** without re-running any model. There is no stdout score table anymore — only a
one-line summary.

## Non-goals

- **Reading the legacy format.** Clean break, consistent with Phase 4. A legacy / non-attempt file
  produces a clear error, not a re-score.
- **Re-running models.** `score` never calls the LLM; it re-scores stored `output`.
- **Re-establishing a clean identity.** Re-scoring with an edited scorer leaves `challengeHash` (and
  every other identity field) as-recorded — see "Identity is never rewritten." A clean identity
  requires a real re-run via `submit`. Accepted limitation.
- **A new stdout score table.** Replaced by the one-line summary.

## Ground truth (verified code facts the build relies on)

- **Current command** `src/cli/commands/score.ts` uses legacy `loadManifest`
  (`src/archive/loader.js`), `ExecutionResult`, and `scoreExecution`. The migration **switches off**
  all three.
- **Attempt schema** (`src/schema/attempt.ts`): `AttemptManifest` header (incl. `attemptId`,
  `finishedAt`, `interrupted`, `configId`, `configHash`, `challengeId`, `challengeVersion`,
  `challengeHash`, `env`, `aggregate`) + `ItemResult` body lines (`itemId`, `promptName`,
  `promptHash`, `itemHash`, `executedAt`, …token/timing fields…, `output`, `reasoning`, `rawOutput`,
  `error: string | null`, `score`).
- **Attempt loader** `src/report/load-attempts.ts` has the internal `parseAttempt(path, source)` and
  the public `loadAttemptArchives(dir)` (which decodes line 1 as `AttemptManifest`, lines 2.. as
  `ItemResult`, and folds parse failures into an `AttemptLoadIssue { path, reason }`). No single-file
  public loader exists yet.
- **Challenge resolution** `src/config/challenges.ts`: `loadChallenge(path, corpus)` and
  `resolveChallenge(challenge, corpus)` → `ResolvedChallenge { id, version, passThreshold,
  challengeHash, items: ResolvedItem[] }`; `ResolvedItem { itemId, promptHash, itemHash, scorer,
  prompt }`. Per-item scorer is `item.scorer ?? prompt.scorer`;
  `itemHash = shortSha256(\`${promptHash}|${scorerKey(scorer)}\`)` (scorer-inclusive).
- **Prompt corpus** `src/config/prompt-corpus.ts` `loadPromptCorpus(promptsDir)` — used by
  `submit.ts` under a `SystemPromptRegistry` layer (`loadSystemPrompts(systemPromptsPath(promptsDir))`
  → `Layer.succeed(SystemPromptRegistry, …)`).
- **Scoring** `src/scoring/dispatch.ts` `scoreByConfig(output, scorerConfig, meta)` →
  `PromptScore { kind: "prompt"; score; details }`. (Game scorers `Effect.fail`; not used by
  prompt-style challenge items.)
- **Aggregate** `src/orchestration/run-challenge.ts:41` exports
  `aggregate(items, passThreshold)` = `{ score: (count of items with score === 1) / length, passed:
  score >= passThreshold }` (a perfect-pass **rate**, NOT a mean; empty → `{score:0, passed:false}`).
- **Scorer-error fold-to-0** precedent (`run-challenge.ts:144-150`):
  `scoreByConfig(...).pipe(Effect.catchAll(() => Effect.succeed({ kind:"prompt", score:0, details:
  "scorer error" })))`, and `score: exec.error === null ? scoreResult.score : 0` (line 168) — an
  execution error forces score 0.
- **Writer** `src/archive/attempt-writer.ts`: `finalizeAttempt` rewrites **only** the header line
  (reads file, decodes line 1, merges `finishedAt`/`interrupted`/`aggregate`, re-encodes, writes back
  with a plain `flag:"w"` overwrite); item lines are kept verbatim. Encoders `encodeManifest` /
  `encodeItem` are `Schema.encode(...)`. There is **no** full-rewrite writer today.
- **Constraints (house rules):** Biome bans `!` (non-null assertion) and `throw` in non-test
  `src/` (`*.test.ts` exempt from the throw ban). `FileIOError` needs `{ path, operation, cause }`.
  `Runtime` literals are `"llamacpp"` / `"mlx"`. No new runtime deps. Effect-TS idioms throughout.
- **Layout:** challenges at `challenges/<challengeId>.yaml` (filename == `challengeId`); prompts under
  `prompts/`.

## Design

### Command interface

```
./bench score --archive <file> [--prompts-dir prompts] [--challenges-dir challenges] \
              [--challenge <file>] [--dry-run] [-v]
```

- **`--archive`** (required): attempt `.jsonl` to re-score in place.
- **`--prompts-dir`** default `"prompts"`.
- **`--challenges-dir`** default `"challenges"`.
- **`--challenge <file>`** (optional): overrides auto-resolution.
- **Auto-resolution:** challenge path = `<challenges-dir>/<manifest.challengeId>.yaml` unless
  `--challenge` is given.
- **`--dry-run`:** do everything (load, resolve, re-score, compute new aggregate) **except** writing.
  Print the summary + per-item would-change / warn lines; leave the file **byte-for-byte untouched**;
  exit 0.
- **`-v` / `--verbose`:** debug logging (as elsewhere).

### Load + resolve

- Load the attempt via a **new single-file loader** `loadAttemptArchive(file)`, factored out of the
  existing `parseAttempt` in `src/report/load-attempts.ts` (export it; **reuse**, do not duplicate the
  parse logic). It reads the file string, runs the existing `parseAttempt`, and yields
  `LoadedAttempt { manifest, items }`.
- A non-attempt / legacy-format file must produce a **clear** error message — e.g. `"not an attempt
  archive (score no longer reads the legacy format)"` — **not** a raw `JsonlCorruptLine` /
  `AttemptLoadIssue` reason leaking through. Map the loader's failure into this message at the
  command boundary.
- Resolve the challenge by `manifest.challengeId` (or `--challenge`) together with
  `loadPromptCorpus(promptsDir)` (under the same `SystemPromptRegistry` layer `submit.ts` uses) →
  `ResolvedChallenge`, giving per-item `scorer`, `promptHash`, `itemHash`, and `passThreshold`.

### Re-score with graceful fallback (per item)

Match archived items to resolved items by `itemId` / `promptName` (both equal the prompt name in the
current resolver — `ResolvedItem.itemId = prompt.name`). For each archived `ItemResult`:

1. **Challenge unresolvable** (challenge file missing or fails to parse) → **WHOLE-ARCHIVE
   fallback:** warn, leave the file untouched, **exit 0**. This is a graceful fallback per the user's
   decision, **not** a hard error. (This is the only condition evaluated before the per-item loop.)
2. **`promptName` not present in the resolved challenge** → keep the stored `score`, **warn**.
3. **Resolved `promptHash` ≠ archived item `promptHash`** (prompt text drifted; the stored output no
   longer corresponds to the current prompt) → keep the stored `score`, **warn**.
   - **IMPORTANT — the drift guard is `promptHash`, NOT `itemHash`.** A changed *scorer* must still
     be applied (re-scoring with an edited scorer is the entire point). `itemHash` folds
     `promptHash` **and** the scorer, so guarding on `itemHash` would wrongly block a scorer-only
     edit. Guard on `promptHash` alone.
4. **Archived item had an execution error** (`item.error !== null`) → **score 0** (mirrors
   run-challenge: a failed execution scores 0 regardless of scorer).
5. **Otherwise** → `scoreByConfig(item.output, resolvedItem.scorer, { promptName: item.promptName })`;
   a scorer error **folds to score 0** (`Effect.catchAll(() => Effect.succeed({ kind:"prompt",
   score:0, … }))`), mirroring `run-challenge.ts:147-149`.

In every "keep stored score" / "score 0" branch above, the result is still emitted as an updated
`ItemResult` (with the chosen `score`), so the rewritten body stays complete and re-parseable.

### Aggregate + write-back

- Recompute the aggregate via the **shared** `aggregate(updatedItems, resolvedChallenge.passThreshold)`
  from `run-challenge.ts` — **reuse it, do not reimplement** (it is a perfect-pass rate, not a mean).
- Write back via a **new** writer `rewriteAttempt(path, manifest, items)` in
  `src/archive/attempt-writer.ts` that:
  - re-encodes the header (with the **updated `aggregate`**, all other fields preserved) plus **all**
    item lines, using the existing `encodeManifest` / `encodeItem` + `JSON.stringify`;
  - writes **atomically** — write to a temp path (e.g. `${path}.tmp`) then `rename` over `path` — to
    protect the archive against a partial write.
- Contrast with `finalizeAttempt`, which rewrites only the header via a plain `flag:"w"` overwrite.
  The full-rewrite path touches the whole file, so it **must** be atomic; document this distinction
  in the writer.

### Identity is never rewritten

`rewriteAttempt` changes **only** the per-item `score` fields and the header `aggregate`. Every
identity / provenance field is preserved verbatim from the loaded manifest: `challengeHash`,
`challengeVersion`, `attemptId`, `startedAt`, `finishedAt`, `interrupted`, `configId`, `configHash`,
`artifact`, `runtime`, `quant`, `temperature`, `systemPrompt`, `maxTokens`, `challengeId`, `env`.

State explicitly: **re-scoring with an edited scorer leaves `challengeHash` as-recorded.** `score` is
a quick iteration / inspection tool; a clean identity (a `challengeHash` that reflects the new scorer)
requires a real re-run via `submit`. This is an **accepted limitation**, not a bug.

### Summary line (stdout)

One line, e.g.:

```
score: smoke-config × smoke@1 → aggregate 0.750 PASS  [rescored 2/2, drift 0, fallback 0]
```

- `<configId> × <challengeId>@<version> → aggregate <score.toFixed(3)> PASS|FAIL`, followed by counts:
  `rescored <n>/<total>` (items actually re-scored via `scoreByConfig`), `drift <n>` (promptHash-drift
  + missing-prompt items kept at stored score), `fallback <n>` (whole-archive fallback → 0 or 1).
- In **`--dry-run`**, mark the line clearly as a dry run / "would write" (prefix or suffix), and
  print the per-item would-change / warn lines.

## Component / file responsibilities

- `src/report/load-attempts.ts` — **export** a new `loadAttemptArchive(file)` factored from the
  existing `parseAttempt` (reads the file, runs `parseAttempt`, returns `LoadedAttempt`). Reuse, no
  duplication.
- `src/archive/attempt-writer.ts` — **add** `rewriteAttempt(path, manifest, items)`: full re-encode
  (header + all items) via existing encoders, **atomic** temp-write + rename. `finalizeAttempt` is
  untouched.
- `src/cli/commands/score.ts` — rewrite the command: new options (`--archive`, `--prompts-dir`,
  `--challenges-dir`, `--challenge`, `--dry-run`, `-v`); load via `loadAttemptArchive`; resolve the
  challenge (`loadChallenge` + `loadPromptCorpus` under `SystemPromptRegistry`); per-item re-score
  with the graceful-fallback ladder; `aggregate(...)`; `rewriteAttempt(...)` unless `--dry-run`; emit
  the summary line. Drop `loadManifest`, `ExecutionResult`, `scoreExecution`, `resolveCorpusEntry`,
  `formatScoredLine`. (Per the dead-code rule, audit those now-unused exports/helpers for removal —
  including their tests — once `score` no longer references them.)
- `src/orchestration/run-challenge.ts` — **no change**; its `aggregate` export is reused as-is.

## Testing

- **Red→green (the headline):** with the current code, point `score` at a real attempt archive and
  reproduce the `JsonlCorruptLine`-class failure. After migration, `score --archive <attempt.jsonl>`
  exits 0 and rewrites the file with updated scores + aggregate; `--dry-run` leaves it byte-identical.
  Observe red first, then green — never assert green without seeing the original symptom flip.
- **Unit:**
  - re-score updates per-item `score`s and the header `aggregate` (shared `aggregate`, perfect-pass
    rate);
  - a `promptHash`-drift item falls back to its stored score and warns (and a scorer-only edit on a
    matching `promptHash` **is** applied — the `itemHash`-vs-`promptHash` guard distinction);
  - missing prompt in the resolved challenge → keep stored score + warn;
  - missing / unparseable challenge file → **whole-archive fallback**, file untouched, exit 0;
  - legacy / non-attempt file → the **clear** error message (not a raw corrupt-line reason);
  - `rewriteAttempt` produces a valid, re-parseable archive (round-trip through
    `loadAttemptArchive`), and the atomic write leaves no partial file on the happy path;
  - **all identity fields preserved** across the rewrite (only `score` + `aggregate` differ);
  - `--dry-run` leaves the bytes identical while still reporting intended changes;
  - a scorer error folds the item to score 0;
  - an archived execution error (`error !== null`) → score 0.
- **Integration:** `/qa` A7 flips from **FAIL(known bug)** to **PASS**.
- Full suite green; lint + typecheck clean. (Root `npm test` also globs `webapp/src/**/*.test.ts` —
  the combined count is one number.)

## Build order

1. `loadAttemptArchive(file)` factored + exported from `load-attempts.ts` (+ unit test).
2. `rewriteAttempt(path, manifest, items)` atomic writer in `attempt-writer.ts` (+ round-trip test).
3. Rewrite `score.ts`: load → resolve → per-item re-score ladder → `aggregate` → `rewriteAttempt` →
   summary; `--dry-run` short-circuits the write (+ unit tests, red→green on the real archive).
4. Dead-code sweep of the dropped legacy helpers/exports + their tests.
5. Confirm `/qa` A7 passes.

## Risks

- **Archive corruption on write is the central risk.** `score` overwrites a real archive in place; a
  partial or malformed write destroys data. Mitigated by the **atomic** temp-write + rename in
  `rewriteAttempt` and the round-trip re-parse test. `--dry-run` exists precisely so an operator can
  preview before committing a write.
- **Silent mis-scoring.** Guarding drift on `itemHash` instead of `promptHash` would silently refuse
  to apply edited scorers — defeating the feature's whole purpose. The guard is `promptHash`; the
  dedicated drift/scorer-edit test pins this.
- **Stale identity is accepted, not hidden.** `challengeHash` is not recomputed on re-score; the
  summary + this spec document that `score` is for iteration and a clean identity needs `submit`.

## Constraints / gotchas

- `FileIOError` requires `{ path, operation, cause }` — use a distinct `operation` for the atomic
  write steps (e.g. `"rewrite-encode"`, `"rewrite-write-temp"`, `"rewrite-rename"`).
- Biome bans `!` and `throw` in non-test `src/` (`*.test.ts` exempt from the throw ban).
- `Runtime` literals are `"llamacpp"` / `"mlx"` — preserved verbatim through the rewrite.
- No new runtime dependencies; Effect-TS idioms throughout (`FileSystem` / `Path` from
  `@effect/platform` for the atomic rename).
