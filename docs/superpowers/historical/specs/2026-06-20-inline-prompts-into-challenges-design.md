# Inline prompts into challenges; drop the global prompt corpus

**Date:** 2026-06-20
**Status:** Approved (design), pending spec review

## Problem

Prompts live in a flat global directory `prompts/*.yaml` (80 files) and are
referenced from `challenges/*.yaml` by `name` ID (`- prompt: code_two_sum_direct`).
The challenge loader joins the two by name at load time. This indirection is
unwanted: a challenge cannot be read or edited in one place, and the global
corpus is an abstraction with only one real consumer shape (challenge items).

A second, orphaned directory `smoke-prompts/` (no code references) holds a
smaller smoke fixture set.

## Goal

Each `challenges/*.yaml` carries its items **fully inline**. Delete `prompts/`
and `smoke-prompts/`. The challenge loader resolves inline items directly — no
global corpus join, no ID dereferencing.

## Non-goals

- Removing the obsolete per-model run subsystem (`run-loop.ts`, `phases.ts`,
  `run-prompt.ts`). Only `run.ts` (the CLI command) is deleted here. The rest is
  left orphaned-but-compiling for a separate obsolete-path-removal effort.
- Changing the scenario corpus shape. `scenarios/` is only rehomed, not edited.
- Any change to `promptHash` inputs (archival reconstruction must stay stable).

## New on-disk shape

A challenge item becomes the old `prompts/*.yaml` body, minus `system:`, nested
under `items:`:

```yaml
id: code
version: 1
passThreshold: 0.8
items:
  - name: code_two_sum_direct
    category: code
    tier: 1
    prompt: |-
      Write a Python function `two_sum(...)` ...
    scorer: code_exec
    testFile: code_two_sum.test.py     # resolved relative to the challenge file
    tags: [code-synthesis]
  - name: math_two_plus_two            # exact_match example
    category: math
    tier: 1
    prompt: |-
      ...
    scorer: exact_match
    expected: "4"
    extract: last_number
```

Scorer-discriminated fields (`exact_match`: `expected`/`extract`; `constraint`:
`constraints`; `code_exec`: `testFile`; `game`: `gameScorer`/`scorerParams`)
move inline exactly as they appear in the prompt files today.

**`system:` is removed from the authoring surface entirely** — it is an
LLM-config concern, already owned by `configs.yaml` (`systemPrompt:` → keyed into
`system-prompts.yaml`). Real prompts are already self-contained (their `system`
resolves to `""` today). The live attempt pipeline (`run-challenge.ts`) sources
the system prompt from `config.systemPromptText` and never reads `prompt.system`.

## File moves (then delete `prompts/` and `smoke-prompts/`)

| From | To |
|---|---|
| `prompts/*.test.py` | `challenges/*.test.py` (path refs preserved; resolved relative to the challenge file) |
| `prompts/system-prompts.yaml` | repo-root `system-prompts.yaml` (config registry, sibling of `configs.yaml`/`models.yaml`) |
| `prompts/scenarios/` | repo-root `scenarios/` (untouched in shape) |

The duplicate `code_two_sum.test.py` (smoke vs main) is **verified identical**;
consolidate to one `challenges/code_two_sum.test.py`.

## `smoke.yaml`

Four inline items: the three from `smoke-prompts/` (`code_two_sum_direct`,
`constraint_capitals`, `math_multiply_direct`) plus the existing
`constraint_keywords_direct`. Drop the stale `system:` fields that the
`smoke-prompts/` copies still carry. `passThreshold: 0.5` retained.

## `promptHash` preservation

`promptHash` stays exactly `shortSha256(`${promptText}|`)` — i.e.
`computePromptHash(promptText, "")` with empty system text. Every existing
archived attempt remains reconstructable; no data migration.

## Loader / schema changes

- **`schema/challenge.ts`** — `ChallengeItem` absorbs the full inline definition:
  the scorer-discriminated input structs (the current `PromptInput` union from
  `prompt-corpus.ts`), **minus `system`**. `Challenge` (`id`/`version`/
  `passThreshold`/`items`) is otherwise unchanged.
- **`config/prompt-corpus.ts`** — its per-item logic (flat→nested scorer bridge,
  `testFile` reading, `promptHash`, unknown-constraint-check pre-validation,
  per-list duplicate-`name` detection) folds into the challenge loader. The
  global `loadPromptCorpus(dir)` directory reader is **deleted**.
- **`config/challenges.ts`** — `loadChallenge(path)` drops its `corpus`
  parameter and self-resolves inline items (decode → per-item scorer bridge +
  `testFile` read + `promptHash`). `ResolvedItem` / `ResolvedChallenge` keep
  their existing shapes and hashing. `testFile` is resolved relative to the
  directory of the challenge file (was: the prompts dir).
- **`schema/prompt.ts`** — `PromptCorpusEntry.system` is **retained internally**
  as a constant `{ key: "none", text: "" }` set by the loader. This keeps the
  orphaned run subsystem (`phases.ts`) and its tests compiling, and keeps the
  `promptHash` formula verbatim. It is no longer settable from disk.

## Consumer changes

- **`cli/commands/submit.ts`** — drop `loadPromptCorpus` + the corpus
  registry layer; call `loadChallenge(challengePath)` (self-resolving).
  `loadSystemPrompts` still loads (for configs) from the new root path.
- **`cli/commands/score.ts`** — same: drop corpus load; `loadChallenge` self-resolves.
- **`cli/commands/list.ts`** — iterate every `challenges/*.yaml`, flatten
  `items`, and list those. Drop the `system.key` display column. Option renamed
  from `--prompts` to a challenges directory (default `challenges/`).
- **`cli/commands/run.ts`** + `cli/__tests__/run-stdout-record.test.ts` +
  `cli/commands/__tests__/run.test.ts` — **deleted**; unregister `runCommand`
  from `cli/main.ts` and `cli/deps.ts`.
- **`cli/paths.ts`** — `systemPromptsPath` repoints to repo-root
  `system-prompts.yaml`; `scenariosSubdir` repoints to repo-root `scenarios/`.

## Tests & fixtures

- `config/challenges.test.ts` — rewrite around inline items; no corpus arg.
- `config/prompt-corpus.test.ts` — migrate the per-item decode/scorer/testFile/
  duplicate-name cases into the challenge-loader test (or a renamed
  `challenge-item.test.ts`); delete the directory-reader cases.
- `__tests__/integration-smoke.test.ts` — load from `challenges/` + root
  `system-prompts.yaml` / `scenarios/`; locate a sample item inline.
- `config/__fixtures__/` — update any prompt-corpus fixtures to the inline shape.
- `errors/config.test.ts` — adjust any paths/messages referencing the prompts dir.
- `cli/commands/__tests__/{score,list,export}.test.ts` — update for the new
  loader signatures and directory layout.

## Docs

- `README.md` and `docs/` reference material: replace the `prompts/` + ID-
  reference model with the inline-challenges model; note `system-prompts.yaml`
  and `scenarios/` now live at the repo root.

## Verification

- `npm test` green.
- `./bench list` enumerates all challenge items across files.
- `./bench submit --config smoke-config --challenge challenges/smoke.yaml` (or
  the QA skill cold-start path) resolves the inline smoke items and produces an
  attempt archive, with `promptHash` values matching pre-refactor archives for
  unchanged prompt text.
- `lint-strict.sh` clean.
