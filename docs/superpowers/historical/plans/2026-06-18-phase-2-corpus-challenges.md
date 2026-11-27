# Phase 2 — Corpus rewrite + real challenge set — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every prompt self-contained (framing in the prompt text, no per-prompt system prompt), trim the system-prompt menu to config-selectable personas, and author the six real per-category challenges.

**Architecture:** The new submit path already sources the system prompt from the *configuration* (`run-challenge.ts:128`), so per-prompt `system:` is vestigial at execution. This phase (1) makes the loader treat `system:` as optional — omitted ⇒ neutral sentinel `{key:"none", text:""}`, `promptHash = hash(promptText, "")`; (2) rewrites the ~81 prompt YAMLs to fold their framing into the prompt text and drop `system:`, in parallel category batches each gated by an adversarial semantic-equivalence + scorer-parseability review; (3) trims `prompts/system-prompts.yaml` to `{default, concise, cot}` and repoints `configs.yaml`; (4) authors `challenges/*.yaml`; (5) lands the `challengeHash` golden test and three carried fast-follows.

**Tech Stack:** TypeScript + Effect (`effect`, `@effect/platform`), Vitest, YAML prompt/challenge files, Python companion test files for `code_exec` scorers.

**Source spec:** `docs/superpowers/specs/2026-06-18-phase-2-corpus-challenges-design.md`

## Global Constraints

- **Effect idioms only** — no raw Promises in `src/`; errors flow through typed Effect channels, not `throw`. (`lint-strict.sh`'s throw ban exempts `*.test.ts`.)
- **`exactOptionalPropertyTypes: true`** — use conditional spreads (`...(x !== undefined ? {x} : {})`) for optional fields, as existing code does.
- **Every task ends green:** `npm test` (full suite, currently 652) passes, plus `npm run lint` and `npm run typecheck` clean, before commit.
- **One file per prompt.** Prompt rewrites never touch a shared file → category batches are independent and parallel-safe (no worktrees needed).
- **Re-pin, don't fight, hashes.** Dropping `system:` changes every rewritten prompt's `promptHash`; any fixture/test asserting an old corpus hash is re-pinned as part of the task that changes it. This is expected, not a regression.
- **Verify red→green for real:** "fixed/passing" means the actual command was run and observed flipping. No claims from inspection alone.

---

## Rewrite Protocol (applies to every category-batch task: Tasks 3–8)

Each prompt YAML in a batch is transformed in place by these rules. This protocol is the standing contract for Tasks 3–8; each task lists only its files and category-specific notes.

**Rules:**
1. **Read the original `system:` text** (from `prompts/system-prompts.yaml`) and the `prompt:` text together. Preserve that *combined meaning*.
2. **Fold any output-shaping instruction into `prompt:`** — format requirements, "output only X", "no markdown", the `ANSWER:` prefix, brevity ("answer with just the…"). The rewritten prompt text must, on its own, elicit output the prompt's **scorer can parse** (see per-scorer checklist below).
3. **Delete the `system:` line** from the YAML. Prompts no longer reference a system key.
4. **Do not carry over pure persona flavor** ("You are a Python code generator", "You are a helpful assistant") — keep the rewritten prompt neutral and instruction-focused.
5. **Do not edit** the `name`, `category`, `tier`, `scorer`, scorer parameters (`expected`/`extract`/`constraints`/`testFile`), companion `*.test.py` files, or `tags`. Only `prompt:` changes and `system:` is removed.
6. **Hash is automatic** — `promptHash` is computed at load, not stored in YAML. No manual hashing.

**Per-scorer output-contract checklist (Rule 2):**
- `exact_match`: the prompt must make the model emit text the `extract` regex captures. If `extract` is `ANSWER:\s*(\d+)`, the prompt text must instruct "…then write `ANSWER:` followed by the number." If `extract` is a bare `\b([A-Z][a-z]?)\b`-style answer grab, the prompt must demand a terse answer ("Reply with just the symbol.").
- `constraint`: the exact format the checks validate must be stated in the prompt text ("Output a JSON object with exactly the keys… Output only the JSON, nothing else.").
- `code_exec`: the prompt must instruct "Output only the function — no explanation, no markdown, no tests." (This is the framing that lived in `code_direct`/`code_tdd`/`code_bugfix`/`code_docstring` and is the most common genuine fold.)

**Worked examples:**

_Example A — `code_exec` (genuine fold; framing was system-only):_
```yaml
# BEFORE  (prompts/code_two_sum_direct.yaml)
name: code_two_sum_direct
category: code
tier: 1
system: code_direct
prompt: 'Write a Python function `two_sum(nums: list[int], target: int) -> list[int]` that returns the indices of two numbers that add up to target. Each input has exactly one solution.'
scorer: code_exec
testFile: code_two_sum.test.py
tags: [TODO, code-synthesis]
```
```yaml
# AFTER
name: code_two_sum_direct
category: code
tier: 1
prompt: |-
  Write a Python function `two_sum(nums: list[int], target: int) -> list[int]` that returns the indices of two numbers that add up to target. Each input has exactly one solution.

  Output only the function — no explanations, no examples, no tests, no markdown. Start directly with `def `.
scorer: code_exec
testFile: code_two_sum.test.py
tags: [TODO, code-synthesis]
```

_Example B — `exact_match` cot (already self-contained; just drop `system:`):_
```yaml
# BEFORE  (prompts/logic_ages_cot.yaml) — prompt ALREADY says "write ANSWER: ..."
system: cot
prompt: 'Alice is twice as old as Bob. In 10 years, Alice will be 1.5 times as old as Bob. How old is Bob now? Think step by step, then write ANSWER: followed by the number.'
extract: ANSWER:\s*(\d+)
```
```yaml
# AFTER — system removed; prompt unchanged (the ANSWER: contract is already in the text)
prompt: 'Alice is twice as old as Bob. In 10 years, Alice will be 1.5 times as old as Bob. How old is Bob now? Think step by step, then write ANSWER: followed by the number.'
extract: ANSWER:\s*(\d+)
```

_Example C — `constraint` structured (format already in text; drop `system:`):_
```yaml
# BEFORE  (prompts/constraint_json.yaml) — prompt already says "Output only the JSON"
system: structured
prompt: 'Output a JSON object with exactly 3 keys: "name", "age", "city". All values must be strings. Output only the JSON, nothing else.'
```
```yaml
# AFTER — system removed; prompt unchanged
prompt: 'Output a JSON object with exactly 3 keys: "name", "age", "city". All values must be strings. Output only the JSON, nothing else.'
```

**Per-batch verification (every batch task ends with this):**
- [ ] `npx vitest run src/config/prompt-corpus.test.ts` — corpus still loads (no `UnknownSystemPrompt`, no schema decode error for the rewritten files).
- [ ] Full suite + lint + typecheck green.
- [ ] **Adversarial review** (the SDD review stage for this task): a fresh reviewer confirms, per rewritten file — (a) semantically equivalent to original `system + prompt` combined; (b) self-contained, with the scorer's output contract present in the text per the checklist; (c) `system:` removed; (d) only `prompt:` changed. Files failing review are returned for fix before the task is accepted.

---

## Task 1: Loader — make `system:` optional (omitted ⇒ neutral sentinel)

**Files:**
- Modify: `src/config/prompt-corpus.ts` — 4 input structs (`ExactMatchInput`, `ConstraintInput`, `CodeExecInput`, `GameInput`), `buildCorpusEntry`
- Modify: `src/config/prompt-corpus.test.ts`
- Create: `src/config/__fixtures__/prompts/no_system.yaml` (new fixture exercising the omit path)

**Interfaces:**
- Consumes: `computePromptHash(promptText, systemText)` (`src/config/hashing.ts`), `SystemPrompt` type (`src/schema/prompt.js`), `UnknownSystemPrompt` (`src/errors/config.js`).
- Produces: unchanged public signature of `loadPromptCorpus`. New behavior: a prompt YAML may omit `system:`; resulting `PromptCorpusEntry.system === { key: "none", text: "" }` and `promptHash === computePromptHash(promptText, "")`.

- [ ] **Step 1: Write the failing test**

Add to `src/config/prompt-corpus.test.ts` (reuse the file's existing `envLayer`/`fixturePath` helpers):

```ts
it("loads a prompt that omits system:, using a neutral sentinel + empty-system hash", async () => {
  const exit = await Effect.runPromiseExit(
    loadPromptCorpus(fixturePath("prompts")).pipe(Effect.provide(envLayer)),
  );
  expect(exit._tag).toBe("Success");
  if (exit._tag !== "Success") return;
  const entry = exit.value.find((p) => p.name === "no_system")!;
  expect(entry).toBeDefined();
  expect(entry.system).toEqual({ key: "none", text: "" });
  expect(entry.promptHash).toBe(computePromptHash(entry.promptText, ""));
});
```

Create `src/config/__fixtures__/prompts/no_system.yaml`:

```yaml
name: no_system
category: factual
tier: 1
prompt: What is the chemical symbol for gold? Reply with just the symbol.
scorer: exact_match
expected: Au
extract: \b([A-Z][a-z]?)\b
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/config/prompt-corpus.test.ts -t "omits system"`
Expected: FAIL — schema decode rejects the missing `system` field (required), before the assertions run.

- [ ] **Step 3: Make `system` optional in the four input structs**

In `src/config/prompt-corpus.ts`, change `system: Schema.String,` to `system: Schema.optional(Schema.String),` in each of `ExactMatchInput`, `ConstraintInput`, `CodeExecInput`, `GameInput`.

- [ ] **Step 4: Resolve the sentinel in `buildCorpusEntry`**

Replace the system-resolution head of `buildCorpusEntry` (currently lines ~155–165) with:

```ts
import type { SystemPrompt } from "../schema/prompt.js"; // add to imports if absent

// inside Effect.gen, before computing promptHash:
let system: SystemPrompt;
if (input.system === undefined) {
  // Omitted system: prompt is self-contained / system-agnostic.
  system = { key: "none", text: "" };
} else {
  const text = registry[input.system];
  if (text === undefined) {
    return yield* Effect.fail(
      new UnknownSystemPrompt({ key: input.system, availableKeys: Object.keys(registry) }),
    );
  }
  system = { key: input.system, text };
}
const promptHash = computePromptHash(input.prompt, system.text);
```

Then the existing `const scorer = yield* resolveScorer(...)` and the returned object (which already spreads `system`, `promptText: input.prompt`, `promptHash`, …) stay as-is.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/config/prompt-corpus.test.ts`
Expected: PASS — both the new omit-path test and the existing `system`-present regression tests (e.g. `math.system.key === "cot"`) are green.

- [ ] **Step 6: Lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/config/prompt-corpus.ts src/config/prompt-corpus.test.ts src/config/__fixtures__/prompts/no_system.yaml
git commit -m "feat(corpus): make prompt system: optional — omitted ⇒ neutral sentinel"
```

---

## Task 2: `challengeHash` golden-value regression test (carried fast-follow)

Lands before the challenge set so the drift guarantee the challenges depend on is pinned independently of corpus content. Uses **synthetic** corpus entries with fixed `promptHash`es so the test pins the `resolveChallenge` hashing *formula*, not live prompt hashes.

**Files:**
- Modify: `src/config/challenges.test.ts`

**Interfaces:**
- Consumes: `resolveChallenge(challenge, corpus)` (`src/config/challenges.ts`) → `ResolvedChallenge` with `challengeHash`. Hash formula: `shortSha256(items.map(i => `${promptHash}:${JSON.stringify(scorer)}`).join("|"))`.

- [ ] **Step 1: Write the golden + drift test**

Add to `src/config/challenges.test.ts` (build minimal `PromptCorpusEntry` stubs — only the fields `resolveChallenge` reads: `name`, `promptHash`, `scorer`; fill the rest with valid placeholders):

```ts
const stub = (name: string, promptHash: string, scorer: PromptCorpusEntry["scorer"]): PromptCorpusEntry => ({
  name, category: "x", tier: 1,
  system: { key: "none", text: "" },
  promptText: "irrelevant to challengeHash",
  scorer, promptHash,
});

it("challengeHash is stable for fixed item prompt-hashes + scorers (golden)", async () => {
  const corpus = [
    stub("a", "aaaaaaaaaaaa", { type: "exact_match", expected: "4", extract: "(\\d+)" }),
    stub("b", "bbbbbbbbbbbb", { type: "constraint", constraints: [{ check: "valid_json", name: "j" }] }),
  ];
  const challenge = { id: "g", version: 1, passThreshold: 0.8, items: [{ prompt: "a" }, { prompt: "b" }] };
  const exit = await Effect.runPromiseExit(resolveChallenge(challenge as never, corpus));
  expect(exit._tag).toBe("Success");
  if (exit._tag !== "Success") return;
  expect(exit.value.challengeHash).toBe("PIN_ME"); // ← see Step 2
});

it("challengeHash drifts when an item prompt-hash changes", async () => {
  const scorer = { type: "exact_match" as const, expected: "4", extract: "(\\d+)" };
  const challenge = { id: "g", version: 1, passThreshold: 0.8, items: [{ prompt: "a" }] };
  const h1 = await Effect.runPromise(resolveChallenge(challenge as never, [stub("a", "aaaaaaaaaaaa", scorer)]));
  const h2 = await Effect.runPromise(resolveChallenge(challenge as never, [stub("a", "cccccccccccc", scorer)]));
  expect(h1.challengeHash).not.toBe(h2.challengeHash);
});
```

- [ ] **Step 2: Run to derive the golden value, then pin it**

Run: `npx vitest run src/config/challenges.test.ts -t "golden"`
Expected: FAIL with a diff showing the actual 12-char hash. Copy that actual value and replace `"PIN_ME"` with it. (Deriving a golden literal once from observed output is the intended workflow — the frozen literal is what catches a future change to the join format or separator.)

- [ ] **Step 3: Re-run to confirm green**

Run: `npx vitest run src/config/challenges.test.ts`
Expected: PASS (both golden + drift).

- [ ] **Step 4: Commit**

```bash
git add src/config/challenges.test.ts
git commit -m "test(challenges): pin challengeHash golden value + drift regression"
```

---

## Tasks 3–8: Corpus rewrite by category batch

Each task applies the **Rewrite Protocol** (above) to one category's prompt files. These six tasks are **mutually independent and parallelizable** (one file per prompt, no shared edits). Each ends with the per-batch verification block from the protocol. Commit message per batch: `refactor(corpus): self-contained <category> prompts (drop system:, fold framing)`.

> Note for all six: most non-`code` prompts already state their output contract in the prompt text (the `direct`/`structured`/`cot` framing was duplicated), so many edits are just deleting the `system:` line. The genuine folds concentrate in `code` (output-only framing) and the `*_structured` / `*_noisy` / `*_adversarial` / few-shot cases. The adversarial review is the gate that catches a silently-broken output contract.

### Task 3: `code` batch (12 files)

**Files (Modify):** `prompts/{code_caesar_cipher_bugfix, code_caesar_cipher_direct, code_fibonacci_direct, code_fibonacci_docstring, code_flatten, code_is_palindrome_direct, code_is_palindrome_tdd, code_lru_cache, code_matrix_rotate, code_two_sum_direct, code_two_sum_noisy, code_word_frequency_tdd}.yaml`

**Category notes:** Every file is `code_exec`. Apply the `code_exec` checklist — fold "Output only the function — no explanation, no markdown, no tests." into each `prompt:` (this is Worked Example A). For `*_tdd` (`code_is_palindrome_tdd`, `code_word_frequency_tdd`) the test cases are already in the prompt text; add the output-only line. For `code_fibonacci_docstring` keep the docstring/skeleton, add "Output only the complete function (def line + body), no markdown." For `code_caesar_cipher_bugfix` keep the buggy function in the prompt, add "Output only the corrected function, no explanation, no markdown." Do **not** touch the `*.test.py` files.

- [ ] Apply the Rewrite Protocol to all 12 files.
- [ ] Run per-batch verification (corpus loads, suite+lint+typecheck green, adversarial review).
- [ ] Commit.

### Task 4: `constraint` batch (10 files)

**Files (Modify):** `prompts/{constraint_capitals, constraint_format_switch_decomposed, constraint_gauntlet_structured, constraint_json, constraint_json_nested_structured, constraint_json_transform_decomposed, constraint_keywords_adversarial, constraint_keywords_direct, constraint_no_letter_e_adversarial, constraint_no_letter_e_direct}.yaml`

**Category notes:** All `constraint`. Apply the `constraint` checklist — confirm the exact output format the checks validate is stated in `prompt:`; fold it in where the old `structured` system carried it. Most already say "Output only the …". Drop `system:`.

- [ ] Apply the Rewrite Protocol to all 10 files.
- [ ] Run per-batch verification.
- [ ] Commit.

### Task 5: `effect-ts` batch (26 files)

**Files (Modify):** `prompts/{effect_anti_pattern, effect_catch_specific, effect_constructors_structured, effect_error_class, effect_fiber_fork, effect_gen_pattern, effect_layer, effect_layer_merge, effect_option_either, effect_parallel, effect_pipe_vs_gen, effect_queue_bounded, effect_queue_operations_structured, effect_ref, effect_resource_management, effect_schedule_types, effect_schema, effect_service_3_parts_structured, effect_service_pattern, effect_sink, effect_stream_create, effect_stream_pipeline_structured, effect_top_level_exports, effect_try_promise, effect_type_params, effect_yield_star}.yaml`

**Category notes:** All `constraint` scorer. 22 used `direct`, 4 used `structured` (`effect_constructors_structured`, `effect_queue_operations_structured`, `effect_service_3_parts_structured`, `effect_stream_pipeline_structured`). For the 4 `*_structured`, ensure the required output format is in `prompt:`. For the 22 `direct`, the answer expectation is generally already in the prompt; verify the constraint checks' expected shape is stated, then drop `system:`. Largest batch by count but mostly mechanical.

- [ ] Apply the Rewrite Protocol to all 26 files.
- [ ] Run per-batch verification.
- [ ] Commit.

### Task 6: `factual` batch (9 files)

**Files (Modify):** `prompts/{fact_boiling_few_shot, fact_chromosomes_adversarial, fact_chromosomes_direct, fact_elements_structured, fact_gold_direct, fact_gold_noisy, fact_planck, fact_treaty_direct, fact_treaty_structured}.yaml`

**Category notes:** Mostly `exact_match` (+ `fact_elements_structured` is `constraint`). For `*_noisy` (`fact_gold_noisy`) fold "Ignore irrelevant details." into the prompt (it materially frames the task). For `*_adversarial` (`fact_chromosomes_adversarial`) fold "Read carefully — this may be trickier than it looks." For `*_few_shot` (`fact_boiling_few_shot`) the examples are in the prompt; just drop `system:`. For `*_structured` (`fact_treaty_structured`, `fact_elements_structured`) ensure the format is in the prompt. Confirm each `extract` regex is satisfiable from the instructed answer shape ("Reply with just the …").

- [ ] Apply the Rewrite Protocol to all 9 files.
- [ ] Run per-batch verification.
- [ ] Commit.

### Task 7: `logic` batch (10 files)

**Files (Modify):** `prompts/{logic_ages_cot, logic_bat_ball_direct, logic_bat_ball_noisy, logic_door_structured, logic_sequence, logic_sheep_cot, logic_sheep_direct, logic_sheep_few_shot, logic_widgets_adversarial, logic_widgets_direct}.yaml`

**Category notes:** Mostly `exact_match` (+ `logic_door_structured` is `constraint`). **`cot` cases (`logic_ages_cot`, `logic_sheep_cot`) are the load-bearing ones:** their `extract` keys off `ANSWER:`. Verify the prompt text already says "write `ANSWER:` followed by …" (Worked Example B shows `logic_ages_cot` already does); if any cot prompt lacks it, **add it** — this is the single most important fold in the phase. `noisy`/`adversarial`/`few_shot` per the Task 6 notes. Drop `system:`.

- [ ] Apply the Rewrite Protocol to all 10 files.
- [ ] Run per-batch verification.
- [ ] Commit.

### Task 8: `math` batch (13 files)

**Files (Modify):** `prompts/{math_chain_direct, math_chain_noisy, math_combinatorics_cot, math_compound_interest, math_modular_structured, math_multiply_cot, math_multiply_direct, math_multiply_few_shot, math_primes_sum_adversarial, math_primes_sum_direct, math_word_problem_decomposed, math_word_problem_direct, math_word_problem_structured}.yaml`

**Category notes:** Mostly `exact_match` (+ `math_modular_structured` is `constraint`). **`cot` cases (`math_combinatorics_cot`, `math_multiply_cot`)** — same `ANSWER:` requirement as Task 7; verify/fold. `few_shot` (`math_multiply_few_shot`) examples are in the prompt (Q/A block) — just drop `system:`. `noisy`/`adversarial` per Task 6 notes. `*_structured` ensure format in text.

- [ ] Apply the Rewrite Protocol to all 13 files.
- [ ] Run per-batch verification.
- [ ] Commit.

---

## Task 9: Trim `system-prompts.yaml` + repoint `configs.yaml`

Runs **after** Tasks 3–8 (no prompt references the deleted keys anymore).

**Files:**
- Modify: `prompts/system-prompts.yaml`
- Modify: `configs.yaml`
- Modify: `src/config/system-prompts.test.ts` (if it pins the old key set), `src/config/configurations.test.ts` (if it pins `smoke-config`'s `configHash`)

**Interfaces:**
- Consumes: `loadSystemPrompts(path)` → `Record<string,string>`; `loadConfigurations` resolves `systemPrompt` keys against the registry to fill `systemPromptText` + `configHash`.

- [ ] **Step 1: Trim the menu**

Replace `prompts/system-prompts.yaml` entirely with:

```yaml
# Config-selectable system-prompt personas. A configuration picks one key via
# its `systemPrompt:` field; it applies uniformly across every challenge. Prompts
# are self-contained and no longer reference these keys.
default: "You are a helpful assistant."
concise: "You are a helpful assistant. Be concise. Answer with just the answer unless told otherwise."
cot: "You are a helpful assistant. Think step by step to solve problems."
```

- [ ] **Step 2: Repoint the smoke config**

In `configs.yaml`, change `systemPrompt: direct` to `systemPrompt: concise`.

- [ ] **Step 3: Run the affected loader tests; re-pin if needed**

Run: `npx vitest run src/config/system-prompts.test.ts src/config/configurations.test.ts`
Expected: if `system-prompts.test.ts` asserts the old 10-key set, update it to expect `{default, concise, cot}`. If `configurations.test.ts` pins `smoke-config`'s `configHash`, re-derive (run, copy actual, pin) — the hash changes because `systemPromptText` changed.

- [ ] **Step 4: Full suite + lint + typecheck**

Run: `npm test && npm run lint && npm run typecheck`
Expected: green. (Watch for any *other* test referencing a deleted system key — e.g. a run-loop fixture using `systemPrompts: { direct: ... }`; those are test-local maps and unaffected, but if a test loads the real `system-prompts.yaml` and expects `direct`, update it.)

- [ ] **Step 5: Commit**

```bash
git add prompts/system-prompts.yaml configs.yaml src/config/system-prompts.test.ts src/config/configurations.test.ts
git commit -m "feat(config): trim system-prompt menu to personas; repoint smoke-config"
```

---

## Task 10: Author the six challenge YAMLs

Depends on Tasks 3–8 (rewritten corpus) being loadable.

**Files:**
- Create: `challenges/{code,constraint,effect-ts,factual,logic,math}.yaml`
- Modify: `src/config/challenges.test.ts` (add a real-corpus load test)

**Interfaces:**
- Consumes: `loadChallenge(path, corpus)` → resolves every `prompt:` against the corpus, computes `challengeHash`. A challenge referencing an unknown prompt fails with `ConfigError`.

- [ ] **Step 1: Write the six challenge files**

`challenges/code.yaml`:
```yaml
id: code
version: 1
passThreshold: 0.8
items:
  - prompt: code_caesar_cipher_bugfix
  - prompt: code_caesar_cipher_direct
  - prompt: code_fibonacci_direct
  - prompt: code_fibonacci_docstring
  - prompt: code_flatten
  - prompt: code_is_palindrome_direct
  - prompt: code_is_palindrome_tdd
  - prompt: code_lru_cache
  - prompt: code_matrix_rotate
  - prompt: code_two_sum_direct
  - prompt: code_two_sum_noisy
  - prompt: code_word_frequency_tdd
```

`challenges/constraint.yaml`:
```yaml
id: constraint
version: 1
passThreshold: 0.8
items:
  - prompt: constraint_capitals
  - prompt: constraint_format_switch_decomposed
  - prompt: constraint_gauntlet_structured
  - prompt: constraint_json
  - prompt: constraint_json_nested_structured
  - prompt: constraint_json_transform_decomposed
  - prompt: constraint_keywords_adversarial
  - prompt: constraint_keywords_direct
  - prompt: constraint_no_letter_e_adversarial
  - prompt: constraint_no_letter_e_direct
```

`challenges/effect-ts.yaml`:
```yaml
id: effect-ts
version: 1
passThreshold: 0.8
items:
  - prompt: effect_anti_pattern
  - prompt: effect_catch_specific
  - prompt: effect_constructors_structured
  - prompt: effect_error_class
  - prompt: effect_fiber_fork
  - prompt: effect_gen_pattern
  - prompt: effect_layer
  - prompt: effect_layer_merge
  - prompt: effect_option_either
  - prompt: effect_parallel
  - prompt: effect_pipe_vs_gen
  - prompt: effect_queue_bounded
  - prompt: effect_queue_operations_structured
  - prompt: effect_ref
  - prompt: effect_resource_management
  - prompt: effect_schedule_types
  - prompt: effect_schema
  - prompt: effect_service_3_parts_structured
  - prompt: effect_service_pattern
  - prompt: effect_sink
  - prompt: effect_stream_create
  - prompt: effect_stream_pipeline_structured
  - prompt: effect_top_level_exports
  - prompt: effect_try_promise
  - prompt: effect_type_params
  - prompt: effect_yield_star
```

`challenges/factual.yaml`:
```yaml
id: factual
version: 1
passThreshold: 0.8
items:
  - prompt: fact_boiling_few_shot
  - prompt: fact_chromosomes_adversarial
  - prompt: fact_chromosomes_direct
  - prompt: fact_elements_structured
  - prompt: fact_gold_direct
  - prompt: fact_gold_noisy
  - prompt: fact_planck
  - prompt: fact_treaty_direct
  - prompt: fact_treaty_structured
```

`challenges/logic.yaml`:
```yaml
id: logic
version: 1
passThreshold: 0.8
items:
  - prompt: logic_ages_cot
  - prompt: logic_bat_ball_direct
  - prompt: logic_bat_ball_noisy
  - prompt: logic_door_structured
  - prompt: logic_sequence
  - prompt: logic_sheep_cot
  - prompt: logic_sheep_direct
  - prompt: logic_sheep_few_shot
  - prompt: logic_widgets_adversarial
  - prompt: logic_widgets_direct
```

`challenges/math.yaml`:
```yaml
id: math
version: 1
passThreshold: 0.8
items:
  - prompt: math_chain_direct
  - prompt: math_chain_noisy
  - prompt: math_combinatorics_cot
  - prompt: math_compound_interest
  - prompt: math_modular_structured
  - prompt: math_multiply_cot
  - prompt: math_multiply_direct
  - prompt: math_multiply_few_shot
  - prompt: math_primes_sum_adversarial
  - prompt: math_primes_sum_direct
  - prompt: math_word_problem_decomposed
  - prompt: math_word_problem_direct
  - prompt: math_word_problem_structured
```

- [ ] **Step 2: Write a real-corpus resolution test**

Add to `src/config/challenges.test.ts` (load the real corpus + each challenge; assert it resolves and the item count matches):

```ts
it.each([
  ["code", 12], ["constraint", 10], ["effect-ts", 26],
  ["factual", 9], ["logic", 10], ["math", 13],
])("resolves challenges/%s.yaml against the real corpus (%i items)", async (id, count) => {
  const program = Effect.gen(function* () {
    const corpus = yield* loadPromptCorpus("prompts");
    return yield* loadChallenge(`challenges/${id}.yaml`, corpus);
  }).pipe(Effect.provide(/* SystemPromptRegistry from real prompts/system-prompts.yaml + NodeFileSystem */ realCorpusLayer));
  const exit = await Effect.runPromiseExit(program);
  expect(exit._tag).toBe("Success");
  if (exit._tag !== "Success") return;
  expect(exit.value.items).toHaveLength(count);
  expect(exit.value.challengeHash).toMatch(/^[0-9a-f]{12}$/);
});
```

(For `realCorpusLayer`: provide `NodeFileSystem.layer` + a `SystemPromptRegistry` built from the real `prompts/system-prompts.yaml` via `Layer.effect(SystemPromptRegistry, loadSystemPrompts("prompts/system-prompts.yaml"))`, mirroring `src/cli/commands/run.ts:226`. If the existing test file already has a real-FS helper, reuse it.)

- [ ] **Step 3: Run it**

Run: `npx vitest run src/config/challenges.test.ts`
Expected: PASS — all six challenges resolve, counts match, hashes are 12-hex.

- [ ] **Step 4: Full suite + lint + typecheck**

Run: `npm test && npm run lint && npm run typecheck`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add challenges/ src/config/challenges.test.ts
git commit -m "feat(challenges): author six per-category challenge sets (v1, threshold 0.8)"
```

---

## Task 11: Carried fast-follows — scorer spawn tag, submit double-read, writer early-return

Three small independent fixes from the Phase 0–1 review. Bundled because each is a few lines.

**Files:**
- Modify: `src/scoring/custom.ts` + `src/scoring/custom.test.ts`
- Modify: `src/cli/commands/submit.ts`
- Modify: `src/archive/attempt-writer.ts`

**Interfaces:**
- Consumes/Produces: error-tag surface of `scoreCustom`. New behavior: a spawn failure (e.g. `python3` not found) surfaces as a distinct tagged error, not folded into `CodeExecFailed`.

- [ ] **Step 1 (spawn tag) — write the failing test**

In `src/scoring/custom.test.ts`, add a test that points `scoreCustom` at a non-existent interpreter (`pythonBin: "definitely-not-a-real-binary-xyz"`) and asserts the failure carries the new spawn-failure tag (e.g. `ScorerSpawnFailed`) rather than `CodeExecFailed`.

Run: `npx vitest run src/scoring/custom.test.ts -t "spawn"` → Expected: FAIL (currently `CodeExecFailed`).

- [ ] **Step 2 — add the tag and branch**

Add a `ScorerSpawnFailed` tagged error (alongside the existing scorer errors in `src/errors/`), and in `custom.ts` distinguish spawn/ENOENT failures from non-zero-exit/malformed-output failures in the `catchAll`, mapping spawn failures to `ScorerSpawnFailed`. Thread the new error through `scoreCustom`'s and `scoreByConfig`'s error channel types. Run the test → Expected: PASS.

- [ ] **Step 3 (submit double-read) — single load**

In `src/cli/commands/submit.ts`, `loadSystemPrompts` is read twice. Load it once and provide it via `Layer.succeed(SystemPromptRegistry, loaded)` to both consumers. Verify `npx vitest run` over the submit/integration smoke tests stays green.

- [ ] **Step 4 (writer early-return) — explicit fail**

In `src/archive/attempt-writer.ts`, the `firstNewline < 0` branch should explicitly `return yield* Effect.fail(...)` (mirroring `writer.ts`) rather than falling through. Make the change; confirm `attempt-writer` tests stay green.

- [ ] **Step 5: Full suite + lint + typecheck**

Run: `npm test && npm run lint && npm run typecheck`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/scoring/custom.ts src/scoring/custom.test.ts src/errors src/cli/commands/submit.ts src/archive/attempt-writer.ts
git commit -m "fix: distinct scorer spawn-failure tag; single system-prompt load; explicit writer early-return"
```

---

## Self-Review

**Spec coverage:**
- Part A (challenge set: 6 per-category, uniform 0.8, built-in scorers, game prompts excluded) → Task 10. ✓
- Part B (self-contained corpus; `system:` optional + sentinel; menu trim; `configs.yaml` repoint; ordering constraint) → Tasks 1, 3–9. ✓
- `challengeHash` golden test → Task 2. ✓
- Part C (authoring; no `scorers/*.py`) → Task 10. ✓
- Carried fast-follows (spawn tag, submit double-read, writer early-return) → Task 11. ✓
- Self-containment invariant + `cot`/`ANSWER:` straggler → Rewrite Protocol + Task 7/Task 8 category notes. ✓

**Placeholder scan:** The only deliberate "fill-in" literals are the golden-hash pin (Task 2 Step 2) and the re-pinned `configHash` (Task 9 Step 3) — both are derive-once-from-observed-output workflows with explicit instructions, not unresolved TODOs. The corpus-rewrite tasks are prose transformations governed by the Rewrite Protocol + worked examples + adversarial review (the highest fidelity possible for semantic content work). No `TBD`/`implement later`.

**Type consistency:** `system` sentinel is `{ key: "none", text: "" }` everywhere (Task 1 loader, Task 2 stub). `PromptCorpusEntry.system` stays required (sentinel populated), so no `.system.text`/`.system.key` call site changes. `challengeHash` formula referenced in Task 2 matches `challenges.ts:53`. Challenge item counts in Task 10 match the Task 3–8 file lists and the spec table (12/10/26/9/10/13 = 80 items).

**Parallelism:** Task 1 → Task 2 (independent, can interleave) → Tasks 3–8 (parallel fan-out, all depend on Task 1) → Task 9 (depends on 3–8) → Task 10 (depends on 3–8) → Task 11 (independent; can run any time after Task 1).
