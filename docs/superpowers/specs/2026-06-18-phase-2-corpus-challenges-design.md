# Phase 2 — Corpus rewrite + real challenge set

> Status: design approved 2026-06-18. Builds on the Challenge × Configuration reframe
> (`docs/superpowers/specs/2026-06-18-challenge-config-reframe-design.md`). Branch:
> `challenge-config-reframe` (Phase 0–1 complete, 652 tests green).

## Problem

Phase 0–1 landed the entity model (Configuration / Challenge / Result), content hashing, the
custom subprocess scorer, `runChallenge`, and `./bench submit`. But there is no real content to
submit: the prompt corpus still binds a **system prompt to each prompt** (carrying task framing),
and **no challenges exist** beyond hand-authored test fixtures.

Phase 2 produces the real content:

1. Rewrite the ~81-prompt corpus so each prompt is **self-contained** — its scorer's output
   contract lives in the prompt text, not in a per-prompt system prompt — because the system
   prompt is now a *configuration* axis, not a *prompt* field.
2. Author the real **challenge set** (`challenges/*.yaml`) over the rewritten corpus.

## Goals

- Every prompt is self-contained: any configuration can be pointed at it and the built-in scorer
  still parses the output, regardless of which system-prompt persona the config selected.
- `system-prompts.yaml` becomes a small menu of genuine, config-selectable **personas** (style),
  with task-framing keys deleted (their instructions folded into prompt text).
- A real, named, versioned challenge set exists: one challenge per category.
- The corpus rewrite is verified **semantically** (scorer-parseability preserved), not mechanically.
- Land the carried `challengeHash` golden-value regression test and the small carried fast-follows.

## Non-goals

- **Custom (subprocess) scorers in the v1 challenge set.** Every item uses its corpus built-in
  scorer. The custom-scorer code path stays covered by its own unit tests; it is not exercised by a
  real challenge in this pass. (Deferred, not removed.)
- **The 3 game/scenario prompts** (`accept_complete_mission`, `dock_and_sell`, `sandbox`). They use
  scenario orchestration + non-dispatch scorers and fit no category. Excluded from the v1 set.
- Capability-themed or category×tier challenge groupings. One challenge per category for v1.
- Report / webapp re-axis (Phase 3) and cache/resume (Phase 4).

## Design

### Part A — Challenge set (sub-step 2a)

Six challenges, **one per category**. Every prompt in a category becomes an item. Uniform
`passThreshold: 0.8`. No per-item `scorer` override (each item falls back to its corpus entry's
built-in scorer). All start at `version: 1`.

| Challenge | Items | Scorer family |
|---|---|---|
| `code@v1` | 12 | code_exec |
| `constraint@v1` | 10 | constraint |
| `effect-ts@v1` | 26 | constraint |
| `factual@v1` | 9 | exact_match (+ `fact_elements_structured` → constraint) |
| `logic@v1` | 10 | exact_match (+ `logic_door_structured` → constraint) |
| `math@v1` | 13 | exact_match (+ `math_modular_structured` → constraint) |

Item membership is **every prompt Agent B's inventory lists under that category**. Exact item lists
are derived from the rewritten corpus at authoring time (2c), not frozen here — but the counts above
are the target.

Rationale for uniform 0.8: keeps challenges directly comparable as proofs of ability; difficulty
differences surface honestly in pass rates rather than being normalized away (consistent with the
project stance that inverted pass rates are a useful signal). The threshold is cheap to retune later
by bumping `version` if 0.8 gates out nearly every local model.

### Part B — Corpus rewrite (sub-step 2b)

**Each prompt becomes self-contained.** It folds any task-framing that lived in its system prompt
into its `promptText` and **drops the `system:` field** from the YAML.

The loader is changed to make `system:` **optional**: when a prompt omits it, the in-memory
`PromptCorpusEntry.system` is populated with a neutral **sentinel** `{ key: "none", text: "" }` and
`promptHash = computePromptHash(promptText, "")` (hash over the prompt text alone). Keeping the
in-memory `system` field populated with a sentinel — rather than making it optional on the entry —
avoids type-churn at the ~16 `.system.text` / `.system.key` call sites; only the loader changes.
The legacy `run` path (`phases.ts`) consequently sends an empty system prompt for rewritten prompts,
which is acceptable (the legacy path is slated for later removal; execution in the new submit path
sources the system prompt from `config.systemPromptText`, already wired at `run-challenge.ts:128`).
Prompts that still carry a `system:` key continue to resolve against the registry unchanged (the
omit-path is purely additive).

**`system-prompts.yaml` trims to generic personas** — a small menu a configuration selects from and
applies uniformly across every challenge:

```yaml
default:  "You are a helpful assistant."
concise:  "You are a helpful assistant. Be concise; answer with just the answer unless asked for more."
cot:      "You are a helpful assistant. Think step by step before answering."
```

The task-framing keys (`code_direct`, `code_tdd`, `code_bugfix`, `code_docstring`, `structured`)
are **deleted**; their instructions move into the prompt text of the prompts that used them.
`configs.yaml`'s `smoke-config` currently selects `systemPrompt: direct` (a deleted key) and is
repointed to `concise` (the surviving persona with the same "be concise" meaning); its `configHash`
changes accordingly, so any test pinning that hash is re-pinned.

**Ordering constraint:** the menu trim must land *after* the corpus rewrite — once `direct` /
`structured` / `code_*` are deleted, any prompt still referencing them fails to load. The corpus
rewrite removes every prompt's `system:` reference first; trimming the menu is then safe.

#### The self-containment invariant

Because the system prompt is now config-chosen and uniform, **a prompt may not rely on a particular
persona being selected.** Each prompt's scorer output contract must live in the prompt text:

- **exact_match** prompts: the prompt text must make the model emit output the `extract` regex can
  capture (e.g. the `ANSWER:` prefix, sufficient brevity).
- **constraint** prompts: the exact-format requirement moves into the prompt text.
- **code_exec** prompts: the "output only the function / no markdown" framing moves into the prompt
  text.

This makes the rewrite scope **"review all 81, edit the 31 task-framers + whatever the verifier
flags as scorer-coupled"** — not a flat 31 or 81. The known stragglers beyond the 31:

- The **4 `cot` prompts** (`logic_ages_cot`, `logic_sheep_cot`, `math_combinatorics_cot`,
  `math_multiply_cot`): their exact_match extract keys off the `ANSWER:` prefix that today lives
  only in the `cot` *system* prompt. Under a `default` config that prefix vanishes and scoring
  breaks — so `ANSWER:` must move into these prompts' text. (`cot` survives in the menu as an
  optional *style*; once the prompts are self-contained, selecting it is harmless, not required.)
- Any `direct` / `adversarial` / `noisy` / `few_shot` prompt whose scorer contract was
  system-carried — the verifier decides per-prompt.

Purely-stylistic persona prompts whose text already carries the contract are **no-ops** (drop the
`system:` reference, no text change, re-hash unchanged-text + changed-system → new hash).

#### Rewrite rules (the one-page spec the implementer subagents work from)

1. Combine the original `system` text + `promptText` mentally; preserve that combined *meaning* and,
   critically, the scorer's output contract.
2. Move any instruction that shapes output (format, prefix, brevity, "output only X", "no markdown")
   into `promptText`.
3. Remove the `system:` field from the prompt YAML (prompts no longer reference a system key).
4. Do **not** carry over the persona's stylistic flavor ("you are a code generator") unless it
   encodes a real output contract — keep the rewritten prompt neutral and self-contained.
5. Re-hash: the implementer recomputes `promptHash` via the existing `computePromptHash`.

#### Execution shape

A **pipeline fanned out by category batch → adversarial verifier per batch**:

- One implementer subagent per category batch (code / constraint / effect-ts / factual / logic /
  math), all working from the rewrite rules above plus 3 worked examples (one `code_*`, one `cot`,
  one `structured`). One file per prompt → no shared-file contention → **plain parallel, no
  worktrees**.
- Each batch is immediately followed by an **adversarial verifier** subagent that confirms, per
  rewritten prompt: (a) semantically equivalent to the original system+prompt combined; (b) now
  self-contained — the scorer's output contract is present in the text and parseable under a neutral
  persona; (c) `system:` field dropped; (d) `promptHash` recomputed correctly. Pipeline so a batch
  verifies as soon as it is rewritten.

#### Carried fast-follow landed here

- **`challengeHash` golden-value regression test** — pins the drift-detection guarantee the
  challenge set now depends on (a known challenge definition hashes to a known constant; a change to
  any item prompt-hash or scoring rule changes it).

### Part C — Challenge authoring (sub-step 2c) — depends on 2a + 2b

Write `challenges/{code,constraint,effect-ts,factual,logic,math}.yaml` from the Part A table against
the rewritten corpus. No `scorer` overrides (all built-in), so **no `scorers/*.py` this pass**. A
handful of files — one or two subagents. Each authored challenge is smoke-checked by loading it
through `loadChallenge` against the real corpus (resolves every item, computes `challengeHash`).

Fold in the remaining carried fast-follows here (before they matter):

- `custom.ts` `catchAll` folds infra errors (e.g. `python3` missing) into `CodeExecFailed` — give
  spawn failures a distinct tag.
- `submit.ts` reads `loadSystemPrompts` twice → swap to `Layer.succeed` on the loaded map.
- `attempt-writer.ts` `firstNewline < 0` branch lacks an explicit early return (cosmetic; mirrors
  `writer.ts`).

## Phasing within Phase 2

1. **2b corpus rewrite** (parallel by category batch → verifier) + `challengeHash` golden test.
   This is the long pole; it unblocks 2c.
2. **2c challenge authoring** over the rewritten corpus + carried fast-follows.

2a (this design) is already resolved; it is input to 2c, not a build step.

## Testing

- Per rewritten prompt: the verifier asserts self-containment + scorer-parseability + correct hash.
- Corpus-wide: existing prompt-corpus loader tests pass against the rewritten YAMLs (re-fixture as
  needed); `loadPromptCorpus` resolves every prompt with the trimmed `system-prompts.yaml`.
- `challengeHash` golden-value regression test (new).
- Per authored challenge: `loadChallenge` resolves all items and computes a `challengeHash`.
- Full suite stays green; lint + typecheck clean.

## Risks

- **Silent scorer breakage** — a prompt rewritten to read well but no longer emitting
  scorer-parseable output. Mitigation: the adversarial verifier's explicit scorer-parseability check
  is the primary guard; the corpus loader tests are the backstop.
- **Hash fixtures** — test fixtures that pin old `promptHash` values must be regenerated. Expected
  and mechanical; called out so it isn't mistaken for a regression.
