# P1: Harness — Multi-Turn and Calibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the harness an optional second conversational turn per challenge item, a `self_score_matches` constraint check that scores the model's self-reported score against the fraction of that item's other checks that passed, and a per-item drilldown that shows the turn-2 output — without changing any existing hash, archive shape, aggregate, or report contract.

**Architecture:** A challenge item may carry an optional `followUpPrompt`. When present it becomes part of that item's `promptHash` (and therefore `itemHash`, and therefore the cross-run cache key), and `executeOrCacheItem` issues a second `runPrompt` call carrying `priorTurns: [assistant turn-1 output, user follow-up]`; the second turn's output and counters land in a nested optional `followUp` struct on `ItemResult`, never in the turn-1 counters the per-attempt aggregates sum. The `constraint` scorer gains a two-phase evaluation: all mechanical checks first, then the calibration checks, which read the turn-2 text and the phase-1 tally.

**Tech Stack:** TypeScript (`exactOptionalPropertyTypes: true`), Effect 3 (`Effect.gen`, typed error channels, `Schema`), vitest, Biome, React 19 for the webapp drilldown.

## Global Constraints

- `npm run lint` = `biome check src/` + `scripts/lint-strict.sh`; the latter is three `grep -rn` passes over `src/` only. Banned everywhere in `src/` **including inside comments**: `try {` (exempt: `src/cli/main.ts`, `src/cli/subprocess-registry.ts`, `src/interop/`), `throw ` (exempt: `src/interop/`, `*.test.ts`), `console.` (exempt: `src/cli/`). `Effect.try({ try: ... })` is fine — the grep needs `{` right after `try`, and here a `(` / `:` follows.
- `tsconfig.json` sets `exactOptionalPropertyTypes: true`: never assign `undefined` to an optional property. Use the conditional-spread idiom already at `src/orchestration/run-challenge.ts:79-82`.
- **Do NOT bump `schemaVersion`.** It is `Schema.Literal(1, 2)` at `src/schema/attempt.ts:54`. Three consumers compare `=== 2` and each fails silently on a v3; `src/schema/attempt.test.ts:129-133` asserts v3 is rejected. Every new archive field is `Schema.optional`.
- **Hash stability is absolute.** `computePromptHash` output for an item with no `followUpPrompt` must remain byte-identical. A drift shifts every `challengeHash` and `attemptId`, and `webapp/src/lib/coverage.ts` then marks ~1,419 historical attempts stale, zeroing every ranking. Task 1 pins literal golden hash values.
- No new scorer type. `self_score_matches` is a new **check kind** inside the existing `constraint` scorer.
- No `messages`-array reshape of `CompletionParams`; `priorTurns` is strictly additive.
- Turn-2 counters never join the turn-1 counters on `ItemResult`. `generationTps` is a rate and is never summed anywhere.
- Effect style only: no `try`/`catch`, no raised errors, typed error channels, `Effect.gen`.
- Tests are vitest; `vitest.config.ts` includes `src/**/*.test.ts` and `webapp/src/**/*.test.ts`. `.test.tsx` files are **not** run — no plan step relies on one.
- Every user-authored regex in this feature — including the calibration check's `extract` — is compiled through `translateInlineFlags` (`src/scoring/regex-flags.ts`) at both load time and scoring time. A bare `new RegExp` cannot compile the mandated leading `(?i)` form, and the resulting uniform check failure would read as a finding rather than a bug.
- Files this plan may modify: `src/schema/challenge.ts`, `src/config/challenges.ts`, `src/config/hashing.ts`, `src/llm/chat-completion.ts`, `src/orchestration/run-prompt.ts`, `src/orchestration/run-challenge.ts`, `src/schema/attempt.ts`, `src/schema/constraints.ts`, `src/schema/enums.ts`, `src/scoring/constraint.ts`, `src/scoring/constraint-checks.ts`, `src/scoring/dispatch.ts` (lead-approved), `src/cli/commands/score.ts` (lead-approved, mandatory), `src/report/write-details.ts`, `webapp/src/lib/use-attempt-detail.ts`, `webapp/src/components/DrilldownPanel.tsx`, `src/orchestration/__tests__/fixtures.ts`, and the tests of all of the above. Nothing else. `challenges/*.yaml` and `scripts/author/**` belong to P2.

---

### Task 1: `followUpPrompt`-aware `computePromptHash`, with golden hash values

**Files:**
- Modify: `src/config/hashing.ts:12-17`
- Test: `src/config/hashing.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `computePromptHash(promptText: string, systemText: string, followUpPrompt?: string): string`. Two-argument calls are byte-identical to today.

- [ ] **Step 1: Write the failing test**

Append to `src/config/hashing.test.ts` (keep the existing `stableStringify` describe block above it, and add `computePromptHash` to the import on line 2 so it reads `import { computePromptHash, stableStringify } from "./hashing.js";`):

```ts
describe("computePromptHash", () => {
  // GOLDEN VALUES — do not regenerate. These are the hashes the current
  // archive corpus was written under. If one of these changes, every
  // challengeHash and attemptId shifts and the webapp's coverage check marks
  // all ~1,419 historical attempts stale, zeroing every ranking.
  const golden: ReadonlyArray<readonly [string, string, string]> = [
    ["2+2?", "", "a8490fa25023"],
    ["What is 2 + 2?", "You are a helpful assistant.", "c60ccb6e5276"],
    ["Write a haiku about the sea.", "", "83e8985597b5"],
    ["List three colors.", "Be brief.", "b107b42011eb"],
  ];

  it.each(golden)("hashes (%j, %j) to the unchanged golden value", (prompt, system, expected) => {
    expect(computePromptHash(prompt, system)).toBe(expected);
  });

  it("is unchanged when followUpPrompt is omitted entirely", () => {
    expect(computePromptHash("2+2?", "")).toBe("a8490fa25023");
  });

  it("mixes followUpPrompt in when it is present", () => {
    expect(computePromptHash("2+2?", "", "Now grade yourself.")).toBe("12c8e549fa73");
  });

  it("gives a different hash to the same prompt with and without a follow-up", () => {
    expect(computePromptHash("2+2?", "", "Now grade yourself.")).not.toBe(
      computePromptHash("2+2?", ""),
    );
  });

  it("distinguishes two different follow-up prompts", () => {
    expect(computePromptHash("2+2?", "", "a")).not.toBe(computePromptHash("2+2?", "", "b"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/config/hashing.test.ts`
Expected: FAIL — the four golden cases and the "unchanged when omitted" case PASS already (they pin current behavior), and `mixes followUpPrompt in when it is present` FAILS with `expected 'a8490fa25023' to be '12c8e549fa73'`, because the third argument is currently ignored.

- [ ] **Step 3: Write minimal implementation**

Replace `src/config/hashing.ts:12-17` with:

```ts
/**
 * Hash of what the model sees on every run: user prompt text joined with the
 * resolved system prompt text, plus the second-turn follow-up prompt when the
 * item has one.
 *
 * `followUpPrompt` is appended ONLY when present. An item without one hashes
 * exactly as it always has, so every archived `promptHash` / `itemHash` /
 * `challengeHash` / `attemptId` stays byte-identical and the webapp's coverage
 * check keeps recognising historical attempts. `src/config/hashing.test.ts`
 * pins literal golden values for this.
 */
export const computePromptHash = (
  promptText: string,
  systemText: string,
  followUpPrompt?: string,
): string =>
  followUpPrompt === undefined
    ? shortSha256(`${promptText}|${systemText}`)
    : shortSha256(`${promptText}|${systemText}|${followUpPrompt}`);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/config/hashing.test.ts && npx tsc --noEmit`
Expected: PASS, and no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/config/hashing.ts src/config/hashing.test.ts
git commit -m "feat(hashing): followUpPrompt-aware computePromptHash with golden stability test

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Optional `followUpPrompt` on all six `ChallengeItem` variants and on `ResolvedItem`

**Files:**
- Modify: `src/schema/challenge.ts:20-85` (six structs)
- Modify: `src/config/challenges.ts:19-25` (`ResolvedItem`), `:196-212` (`buildPromptEntry`), `:236-244` (resolved item construction)
- Test: `src/schema/challenge.test.ts`, `src/config/challenges.test.ts`

**Interfaces:**
- Consumes: `computePromptHash(promptText, systemText, followUpPrompt?)` from Task 1.
- Produces: `ChallengeItem` decodes an optional `followUpPrompt: string` on every variant; `ResolvedItem` gains `readonly followUpPrompt?: string`, which Task 7 reads.

- [ ] **Step 1: Write the failing test**

Append to `src/schema/challenge.test.ts` (inside the existing top-level `describe("Challenge", ...)` block, or as a new sibling describe at the end of the file):

```ts
describe("ChallengeItem followUpPrompt", () => {
  const variants = [
    { scorer: "exact_match", expected: "4", extract: "(\\d+)" },
    { scorer: "constraint", constraints: [] },
    { scorer: "code_exec", testFile: "t.py" },
    { scorer: "game", gameScorer: "g", scorerParams: {} },
    { scorer: "set_match", vocabulary: ["a"], expected: ["a"] },
    { scorer: "ordered_match", vocabulary: ["a"], expected: ["a"] },
  ] as const;

  it.each(variants)("accepts followUpPrompt on the %j variant", (tail) => {
    const v = {
      id: "c",
      version: 1,
      passThreshold: 0.5,
      items: [
        {
          name: "a",
          category: "x",
          tier: 1,
          prompt: "q",
          followUpPrompt: "Now report the score you expect.",
          ...tail,
        },
      ],
    };
    const decoded = Schema.decodeUnknownSync(Challenge)(v);
    expect(decoded.items[0]?.followUpPrompt).toBe("Now report the score you expect.");
  });

  it.each(variants)("leaves followUpPrompt undefined when absent on the %j variant", (tail) => {
    const v = {
      id: "c",
      version: 1,
      passThreshold: 0.5,
      items: [{ name: "a", category: "x", tier: 1, prompt: "q", ...tail }],
    };
    const decoded = Schema.decodeUnknownSync(Challenge)(v);
    expect(decoded.items[0]?.followUpPrompt).toBeUndefined();
  });
});
```

Append to `src/config/challenges.test.ts` (new top-level describe at the end of the file):

```ts
describe("resolveChallenge followUpPrompt", () => {
  const constraintItem = (followUpPrompt?: string) => ({
    name: "a",
    category: "x",
    tier: 1,
    prompt: "2+2?",
    scorer: "constraint" as const,
    constraints: [{ check: "contains" as const, name: "c1", value: "4" }],
    ...(followUpPrompt === undefined ? {} : { followUpPrompt }),
  });

  const challengeWith = (followUpPrompt?: string): Challenge => ({
    id: "c",
    version: 1,
    passThreshold: 0.5,
    items: [constraintItem(followUpPrompt)],
  });

  it("keeps the golden hashes for an item with no followUpPrompt", async () => {
    const exit = await run(provide(resolveChallenge(challengeWith(), challengesDir)));
    expect(exit._tag).toBe("Success");
    if (exit._tag !== "Success") return;
    // GOLDEN — a change here shifts every archived attemptId. See
    // src/config/hashing.test.ts for the rationale.
    expect(exit.value.items[0]?.promptHash).toBe("a8490fa25023");
    expect(exit.value.items[0]?.itemHash).toBe("38a7198ff039");
    expect(exit.value.challengeHash).toBe("3e77357f1f4e");
    expect(exit.value.items[0]?.followUpPrompt).toBeUndefined();
  });

  it("carries followUpPrompt onto the resolved item and changes its itemHash", async () => {
    const exit = await run(provide(resolveChallenge(challengeWith("Grade yourself."), challengesDir)));
    expect(exit._tag).toBe("Success");
    if (exit._tag !== "Success") return;
    expect(exit.value.items[0]?.followUpPrompt).toBe("Grade yourself.");
    expect(exit.value.items[0]?.promptHash).not.toBe("a8490fa25023");
    expect(exit.value.items[0]?.itemHash).not.toBe("38a7198ff039");
    expect(exit.value.challengeHash).not.toBe("3e77357f1f4e");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/schema/challenge.test.ts src/config/challenges.test.ts`
Expected: FAIL — `accepts followUpPrompt on the ... variant` fails because the struct decode drops the unknown key so `followUpPrompt` is `undefined`; `carries followUpPrompt onto the resolved item` fails on `expected undefined to be 'Grade yourself.'`. The golden-hash test PASSES (it pins current behavior).

- [ ] **Step 3: Write minimal implementation**

In `src/schema/challenge.ts`, add the same optional field to each of the six structs. Add it as the line immediately after `prompt: Schema.String,` in `ExactMatchItem` (`:24`), `ConstraintItem` (`:35`), `CodeExecItem` (`:45`), `GameItem` (`:56`), `SetMatchItem` (`:67`) and `OrderedMatchItem` (`:79`). The line is identical in all six:

**`ConstraintItem` is the one that cannot be missed.** Every one of P2's 54 generated items uses `scorer: constraint`, so an omission there makes the entire generated YAML fail to decode. The `it.each(variants)` test in Step 1 covers all six precisely so this cannot be half-done.

```ts
  followUpPrompt: Schema.optional(Schema.String),
```

Also extend the file's doc comment (`src/schema/challenge.ts:4-19`) with a paragraph before the closing `*/`:

```
 * `followUpPrompt` is repeated on all six structs on purpose. The variants
 * duplicate their common fields so a missing-required-field error points at
 * the exact field; factoring a shared base out would undo that.
```

In `src/config/challenges.ts`, extend `ResolvedItem` (`:19-25`):

```ts
export interface ResolvedItem {
  readonly itemId: string;
  readonly promptHash: string;
  readonly itemHash: string;
  readonly scorer: ScorerConfig;
  readonly prompt: PromptCorpusEntry;
  /**
   * Second-turn prompt. Present only for two-turn items. It is folded into
   * `promptHash` (and so into `itemHash`), which is what keeps one-turn and
   * two-turn executions of the same text in disjoint cache namespaces.
   */
  readonly followUpPrompt?: string;
}
```

In `buildPromptEntry` (`src/config/challenges.ts:209`), replace the `promptHash` line with:

```ts
      promptHash: computePromptHash(item.prompt, NONE_SYSTEM.text, item.followUpPrompt),
```

In `resolveChallenge` (`src/config/challenges.ts:238-244`), replace the returned object with:

```ts
        return {
          itemId: prompt.name,
          promptHash: prompt.promptHash,
          itemHash,
          scorer: prompt.scorer,
          prompt,
          ...(item.followUpPrompt !== undefined
            ? { followUpPrompt: item.followUpPrompt }
            : {}),
        } satisfies ResolvedItem;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/schema/challenge.test.ts src/config/challenges.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/schema/challenge.ts src/schema/challenge.test.ts src/config/challenges.ts src/config/challenges.test.ts
git commit -m "feat(challenge): optional followUpPrompt on all six item variants

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Additive `priorTurns` on `CompletionParams`

**Files:**
- Modify: `src/llm/chat-completion.ts:47-61` (`CompletionParams`), `:167-176` (`buildBody`)
- Test: `src/llm/chat-completion.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `CompletionParams.priorTurns?: ReadonlyArray<{ readonly role: "assistant" | "user"; readonly content: string }>`; the request body's `messages` becomes `[system, user, ...priorTurns]`.

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe("ChatCompletion", ...)` block in `src/llm/chat-completion.test.ts`:

```ts
  it("appends priorTurns after the system and user messages", async () => {
    let capturedBody: unknown = null;
    const layer = ChatCompletionLive.pipe(
      Layer.provide(
        mockClient((req) => {
          const body = req.body;
          if (body._tag === "Uint8Array" || body._tag === "Raw") {
            const bytes = body._tag === "Uint8Array" ? body.body : new Uint8Array();
            capturedBody = JSON.parse(new TextDecoder().decode(bytes));
          }
          return jsonResponse({
            choices: [{ message: { content: "0.75" } }],
            usage: { prompt_tokens: 3, completion_tokens: 2 },
          });
        }),
      ),
    );

    const program = Effect.gen(function* () {
      const chat = yield* ChatCompletion;
      return yield* chat.complete(
        baseParams({
          priorTurns: [
            { role: "assistant", content: "DISPOSITION: IGNORE" },
            { role: "user", content: "What score do you expect?" },
          ],
        }),
      );
    });

    await Effect.runPromise(Effect.provide(program, layer));

    expect(capturedBody).toMatchObject({
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "What is 2 + 2?" },
        { role: "assistant", content: "DISPOSITION: IGNORE" },
        { role: "user", content: "What score do you expect?" },
      ],
    });
  });

  it("emits exactly two messages when priorTurns is omitted", async () => {
    let capturedBody: unknown = null;
    const layer = ChatCompletionLive.pipe(
      Layer.provide(
        mockClient((req) => {
          const body = req.body;
          if (body._tag === "Uint8Array" || body._tag === "Raw") {
            const bytes = body._tag === "Uint8Array" ? body.body : new Uint8Array();
            capturedBody = JSON.parse(new TextDecoder().decode(bytes));
          }
          return jsonResponse({
            choices: [{ message: { content: "4" } }],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
          });
        }),
      ),
    );

    const program = Effect.gen(function* () {
      const chat = yield* ChatCompletion;
      return yield* chat.complete(baseParams());
    });

    await Effect.runPromise(Effect.provide(program, layer));

    const messages = (capturedBody as { messages: unknown[] }).messages;
    expect(messages).toHaveLength(2);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/llm/chat-completion.test.ts -t "appends priorTurns"`
Expected: FAIL — TypeScript rejects `priorTurns` as an unknown property of `Partial<CompletionParams>`, and at runtime the captured body has only two messages.

- [ ] **Step 3: Write minimal implementation**

In `src/llm/chat-completion.ts`, add to `CompletionParams` after `timeoutSec` (`:60`):

```ts
  /**
   * Conversation turns appended after the system + user pair, in order. Used
   * by the two-turn items: `[{ assistant: turn-1 output }, { user: follow-up }]`.
   * Omit for the ordinary single-turn call — the request body is then byte-identical
   * to what it has always been.
   */
  readonly priorTurns?: ReadonlyArray<{
    readonly role: "assistant" | "user";
    readonly content: string;
  }>;
```

Replace `buildBody` (`:167-176`) with:

```ts
const buildBody = (p: CompletionParams) => ({
  model: p.model,
  messages: [
    { role: "system", content: p.systemPrompt },
    { role: "user", content: p.userPrompt },
    ...(p.priorTurns ?? []).map((t) => ({ role: t.role, content: t.content })),
  ],
  temperature: p.temperature,
  max_tokens: p.maxTokens,
  stream: false,
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/llm/chat-completion.test.ts && npx tsc --noEmit`
Expected: PASS — all pre-existing assertions (including the exact two-message body at `:86-89`) still pass.

- [ ] **Step 5: Commit**

```bash
git add src/llm/chat-completion.ts src/llm/chat-completion.test.ts
git commit -m "feat(llm): additive priorTurns on CompletionParams

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `priorTurns` passthrough on `runPrompt`

**Files:**
- Modify: `src/orchestration/run-prompt.ts:28-45` (`RunPromptInput`), `:227-236` (`toCompletionParams`)
- Test: `src/orchestration/__tests__/run-prompt.test.ts`

**Interfaces:**
- Consumes: `CompletionParams.priorTurns` from Task 3.
- Produces: `RunPromptInput.priorTurns?: ReadonlyArray<{ readonly role: "assistant" | "user"; readonly content: string }>`, forwarded verbatim to `ChatCompletion.complete`. Task 7 supplies it.

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe("runPrompt", ...)` block in `src/orchestration/__tests__/run-prompt.test.ts`:

```ts
  it("forwards priorTurns to the ChatCompletion service verbatim", async () => {
    const { layer, log } = makeChatCompletionMock({});
    await Effect.runPromise(
      runPrompt({
        archiveId: "archive-1",
        runId: "run-1",
        model: sampleModel(),
        prompt: samplePromptExact(),
        systemPrompt: "Be brief.",
        temperature: 0.7,
        maxTokens: 256,
        priorTurns: [
          { role: "assistant", content: "turn-1 answer" },
          { role: "user", content: "score yourself" },
        ],
      }).pipe(Effect.provide(layer)),
    );
    expect(log.calls[0]?.priorTurns).toEqual([
      { role: "assistant", content: "turn-1 answer" },
      { role: "user", content: "score yourself" },
    ]);
  });

  it("omits priorTurns entirely on a single-turn call", async () => {
    const { layer, log } = makeChatCompletionMock({});
    await Effect.runPromise(
      runPrompt({
        archiveId: "archive-1",
        runId: "run-1",
        model: sampleModel(),
        prompt: samplePromptExact(),
        systemPrompt: "Be brief.",
        temperature: 0.7,
        maxTokens: 256,
      }).pipe(Effect.provide(layer)),
    );
    expect(log.calls[0]).not.toHaveProperty("priorTurns");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/orchestration/__tests__/run-prompt.test.ts -t "forwards priorTurns"`
Expected: FAIL — TypeScript rejects `priorTurns` on `RunPromptInput`; at runtime `log.calls[0].priorTurns` is `undefined`.

- [ ] **Step 3: Write minimal implementation**

In `src/orchestration/run-prompt.ts`, add to `RunPromptInput` after `peakRssKb` (`:44`):

```ts
  /**
   * Conversation turns appended after the system + user pair. Two-turn items
   * pass `[{ assistant: turn-1 output }, { user: follow-up prompt }]` here; the
   * `prompt` field still carries the original turn-1 user prompt, so the second
   * request replays the whole exchange.
   */
  readonly priorTurns?: ReadonlyArray<{
    readonly role: "assistant" | "user";
    readonly content: string;
  }>;
```

Replace `toCompletionParams` (`:227-236`) with:

```ts
const toCompletionParams = (input: RunPromptInput): CompletionParams => ({
  runtime: input.model.runtime,
  model: input.model.artifact,
  promptName: input.prompt.name,
  systemPrompt: input.systemPrompt,
  userPrompt: input.prompt.promptText,
  temperature: input.temperature,
  maxTokens: input.maxTokens,
  timeoutSec: input.timeoutSec ?? DEFAULT_PROMPT_TIMEOUT_SEC,
  // Conditional spread: `exactOptionalPropertyTypes` forbids assigning
  // undefined to an optional property, and the single-turn body must stay
  // byte-identical to what it has always been.
  ...(input.priorTurns !== undefined ? { priorTurns: input.priorTurns } : {}),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/orchestration/__tests__/run-prompt.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/orchestration/run-prompt.ts src/orchestration/__tests__/run-prompt.test.ts
git commit -m "feat(orchestration): thread priorTurns through runPrompt

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Extend the shared ChatCompletion mock key so turn 1 and turn 2 are distinguishable

**Files:**
- Modify: `src/orchestration/__tests__/fixtures.ts:157-176`
- Test: `src/orchestration/__tests__/run-prompt.test.ts`

**Interfaces:**
- Consumes: `RunPromptInput.priorTurns` from Task 4.
- Produces: stub-table keys are `` `${promptName}:${temperature}` `` for a first turn and `` `${promptName}:${temperature}:followup` `` for any call carrying prior turns. Existing keys keep working unchanged. Tasks 7, 8 and 12 rely on this.

**Trap addressed:** the shared mock is imported by the run-prompt, run-challenge, run-challenge-cache, run-challenge-smoke, run-challenge-with-server, run-matrix and phases tests. Keyed only on `promptName:temperature`, every multi-turn test would silently receive the same stub for both turns and the whole feature would appear to work while measuring nothing.

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe("runPrompt", ...)` block in `src/orchestration/__tests__/run-prompt.test.ts`:

```ts
  it("mock fixture: a call with priorTurns selects the :followup stub, not the turn-1 stub", async () => {
    const { layer } = makeChatCompletionMock({
      "p1:0.7": {
        kind: "ok",
        result: {
          output: "turn-one",
          reasoning: null,
          promptTokens: 1,
          generationTokens: 1,
          promptTps: 0,
          generationTps: 0,
        },
      },
      "p1:0.7:followup": {
        kind: "ok",
        result: {
          output: "turn-two",
          reasoning: null,
          promptTokens: 2,
          generationTokens: 2,
          promptTps: 0,
          generationTps: 0,
        },
      },
    });

    const base = {
      archiveId: "a",
      runId: "r",
      model: sampleModel(),
      prompt: samplePromptExact(),
      systemPrompt: "Be brief.",
      temperature: 0.7,
      maxTokens: 256,
    };

    const first = await Effect.runPromise(runPrompt(base).pipe(Effect.provide(layer)));
    const second = await Effect.runPromise(
      runPrompt({
        ...base,
        priorTurns: [
          { role: "assistant", content: "turn-one" },
          { role: "user", content: "score yourself" },
        ],
      }).pipe(Effect.provide(layer)),
    );

    expect(first.output).toBe("turn-one");
    expect(second.output).toBe("turn-two");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/orchestration/__tests__/run-prompt.test.ts -t "selects the :followup stub"`
Expected: FAIL with `expected 'turn-one' to be 'turn-two'` — both calls key to `p1:0.7`.

- [ ] **Step 3: Write minimal implementation**

In `src/orchestration/__tests__/fixtures.ts`, replace the doc comment at `:157-160` and the `key` function at `:176`:

```ts
/**
 * Build a ChatCompletion layer backed by a stub-table.
 *
 * Keys are `{promptName}:{temperature}` for a first turn and
 * `{promptName}:{temperature}:followup` for any call that carries prior turns.
 * The turn suffix matters: `promptName` and `temperature` are identical on both
 * turns of a two-turn item, so a key without it hands the same stub to both and
 * a multi-turn test passes while measuring nothing. On a table miss the
 * `fallback` is used, so single-turn tests written against the old key shape
 * keep working untouched.
 */
```

```ts
  const key = (p: CompletionParams) =>
    p.priorTurns === undefined || p.priorTurns.length === 0
      ? `${p.promptName}:${p.temperature}`
      : `${p.promptName}:${p.temperature}:followup`;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/orchestration/ && npx tsc --noEmit`
Expected: PASS — including all pre-existing orchestration tests, whose stub keys are unaffected because they never pass `priorTurns`.

- [ ] **Step 5: Commit**

```bash
git add src/orchestration/__tests__/fixtures.ts src/orchestration/__tests__/run-prompt.test.ts
git commit -m "test(orchestration): key the shared ChatCompletion mock by turn

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Nested optional `followUp` struct on `ItemResult`

**Files:**
- Modify: `src/schema/attempt.ts:6-37`
- Test: `src/schema/attempt.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ItemResult.followUp?: { output: string; reasoning: string | null; rawOutput: string; error: string | null; promptTokens: number; generationTokens: number; generationTps: number; wallTimeSec: number }`. Tasks 7, 13 read it.

- [ ] **Step 1: Write the failing test**

Append inside the existing `ItemResult` describe block in `src/schema/attempt.test.ts` (it uses a `baseItem` fixture defined around `:134`):

```ts
  it("decodes an item with no followUp (every existing archive row)", () => {
    const r = Schema.decodeUnknownSync(ItemResult)({ ...baseItem, score: 1 });
    expect(r.followUp).toBeUndefined();
  });

  it("decodes an item carrying a followUp turn", () => {
    const r = Schema.decodeUnknownSync(ItemResult)({
      ...baseItem,
      score: 1,
      followUp: {
        output: "0.75",
        reasoning: null,
        rawOutput: "0.75",
        error: null,
        promptTokens: 40,
        generationTokens: 12,
        generationTps: 22.5,
        wallTimeSec: 1.5,
      },
    });
    expect(r.followUp?.output).toBe("0.75");
    expect(r.followUp?.generationTokens).toBe(12);
    expect(r.followUp?.wallTimeSec).toBe(1.5);
  });

  it("drops the followUp key on encode when absent (existing rows stay byte-identical)", () => {
    const encoded = Schema.encodeSync(ItemResult)(
      Schema.decodeUnknownSync(ItemResult)({ ...baseItem, score: 1 }),
    );
    expect(Object.hasOwn(encoded, "followUp")).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/schema/attempt.test.ts -t "decodes an item carrying a followUp turn"`
Expected: FAIL — `expected undefined to be '0.75'`: the unknown `followUp` key is dropped by the struct decode.

- [ ] **Step 3: Write minimal implementation**

In `src/schema/attempt.ts`, add after the `breakdown` field (`:36`, before the closing `});` at `:37`):

```ts
  /**
   * The item's second conversational turn, present only for items whose
   * challenge item carries a `followUpPrompt`.
   *
   * The counters are nested here rather than folded into the turn-1 fields
   * above on purpose: `promptTokens` / `generationTokens` / `generationTps` /
   * `wallTimeSec` on `ItemResult` stay definitionally turn-1, so the
   * per-attempt sums (and the webapp scatter X axis and efficiency figure built
   * on them) keep comparing like with like across archives written before and
   * after multi-turn existed. `generationTps` is a rate and is never summed.
   *
   * Optional, like `scorerHash` and `breakdown`: existing rows omit it and
   * decode unchanged, and `Schema.encode` drops the key when it is absent, so
   * they also re-encode byte-identically. `schemaVersion` is deliberately NOT
   * bumped — three consumers compare it with `=== 2`.
   */
  followUp: Schema.optional(
    Schema.Struct({
      output: Schema.String,
      reasoning: Schema.NullOr(Schema.String),
      rawOutput: Schema.String,
      error: Schema.NullOr(Schema.String),
      promptTokens: Schema.Number,
      generationTokens: Schema.Number,
      generationTps: Schema.Number,
      wallTimeSec: Schema.Number,
    }),
  ),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/schema/attempt.test.ts && npx tsc --noEmit`
Expected: PASS — including the pre-existing `rejects schemaVersion 3` test, which must remain green.

- [ ] **Step 5: Commit**

```bash
git add src/schema/attempt.ts src/schema/attempt.test.ts
git commit -m "feat(schema): optional followUp turn on ItemResult, no schemaVersion bump

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Execute turn 2 from `executeOrCacheItem`, with turn-1 metrics kept clean

**Files:**
- Modify: `src/orchestration/run-challenge.ts:107-199`
- Test: `src/orchestration/__tests__/run-challenge.test.ts`

**Interfaces:**
- Consumes: `ResolvedItem.followUpPrompt` (Task 2), `RunPromptInput.priorTurns` (Task 4), the `:followup` mock key (Task 5), `ItemResult.followUp` (Task 6).
- Produces: `export type FollowUpResult = NonNullable<ItemResult["followUp"]>` and `export const runFollowUpTurn(input: RunChallengeInput, item: ResolvedItem, followUpPrompt: string, turnOneOutput: string, peakRssKb?: Effect.Effect<number>): Effect.Effect<FollowUpResult, never, ChatCompletion>`. `executeOrCacheItem` now emits `followUp` for two-turn items.

**Trap addressed:** metric leakage. Turn-2 counters go only inside `followUp`; `ItemResult.generationTokens` / `wallTimeSec` / `generationTps` remain turn-1 values.

- [ ] **Step 1: Write the failing test**

Append a new top-level describe at the end of `src/orchestration/__tests__/run-challenge.test.ts`, and add `executeOrCacheItem` to the import from `../run-challenge.js` on line 7 so it reads `import { aggregate, executeOrCacheItem, runChallenge } from "../run-challenge.js";`:

```ts
describe("executeOrCacheItem two-turn items", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir();
  });
  afterEach(async () => {
    await removeDir(dir);
  });

  const twoTurnConfig: ResolvedConfiguration = {
    id: "smoke-config",
    artifact: "fake-artifact",
    runtime: "mlx",
    temperature: 0,
    systemPrompt: "direct",
    maxTokens: 128,
    systemPromptText: "Be concise.",
    configHash: "cfg-hash",
  };

  const twoTurnEnv = {
    hostname: "test",
    platform: "test",
    runtimeVersion: "test",
    nodeVersion: "test",
    benchmarkGitSha: "test",
  };

  const twoTurnItem = (): ResolvedItem => {
    const prompt = samplePromptExact();
    return {
      itemId: prompt.name,
      promptHash: prompt.promptHash,
      itemHash: "ih-two-turn",
      scorer: prompt.scorer,
      prompt,
      followUpPrompt: "What score do you expect?",
    };
  };

  const twoTurnStubs = () =>
    makeChatCompletionMock({
      "p1:0": {
        kind: "ok",
        result: {
          output: "4",
          reasoning: null,
          promptTokens: 11,
          generationTokens: 5,
          promptTps: 0,
          generationTps: 50,
        },
      },
      "p1:0:followup": {
        kind: "ok",
        result: {
          output: "0.5",
          reasoning: "counting the checks",
          promptTokens: 33,
          generationTokens: 7,
          promptTps: 0,
          generationTps: 70,
        },
      },
    });

  const inputFor = (item: ResolvedItem, attemptId: string) => ({
    config: twoTurnConfig,
    challenge: {
      id: "two-turn-ch",
      version: 1,
      passThreshold: 0.5,
      challengeHash: "two-turn-hash",
      items: [item],
    } satisfies ResolvedChallenge,
    attemptId,
    archiveDir: dir,
    archivePath: `${dir}/${attemptId}.jsonl`,
    env: twoTurnEnv,
    noCache: true,
    deps: fakeDeps(),
  });

  it("issues a second call carrying the turn-1 output and the follow-up prompt", async () => {
    const item = twoTurnItem();
    const m = twoTurnStubs();
    await Effect.runPromise(
      executeOrCacheItem(inputFor(item, "att-2turn")).pipe(
        Effect.provide(m.layer),
        Effect.provide(inertHttpClientLayer),
        Effect.provide(NodeContext.layer),
      ),
    );
    expect(m.log.calls.length).toBe(2);
    expect(m.log.calls[0]?.priorTurns).toBeUndefined();
    expect(m.log.calls[1]?.userPrompt).toBe("2+2?");
    expect(m.log.calls[1]?.priorTurns).toEqual([
      { role: "assistant", content: "4" },
      { role: "user", content: "What score do you expect?" },
    ]);
  });

  it("records turn-2 output in followUp and leaves turn-1 counters untouched", async () => {
    const item = twoTurnItem();
    const m = twoTurnStubs();
    const row = await Effect.runPromise(
      executeOrCacheItem(inputFor(item, "att-metrics")).pipe(
        Effect.provide(m.layer),
        Effect.provide(inertHttpClientLayer),
        Effect.provide(NodeContext.layer),
      ),
    );
    // Turn-1 counters are exactly turn 1 — no summing, no averaging.
    expect(row.promptTokens).toBe(11);
    expect(row.generationTokens).toBe(5);
    expect(row.generationTps).toBe(50);
    expect(row.output).toBe("4");
    // Turn-2 counters live only inside followUp.
    expect(row.followUp?.output).toBe("0.5");
    expect(row.followUp?.reasoning).toBe("counting the checks");
    expect(row.followUp?.promptTokens).toBe(33);
    expect(row.followUp?.generationTokens).toBe(7);
    expect(row.followUp?.generationTps).toBe(70);
    expect(row.followUp?.error).toBeNull();
  });

  it("omits followUp entirely for a one-turn item", async () => {
    const prompt = samplePromptExact();
    const item: ResolvedItem = {
      itemId: prompt.name,
      promptHash: prompt.promptHash,
      itemHash: "ih-one-turn",
      scorer: prompt.scorer,
      prompt,
    };
    const m = twoTurnStubs();
    const row = await Effect.runPromise(
      executeOrCacheItem(inputFor(item, "att-oneturn")).pipe(
        Effect.provide(m.layer),
        Effect.provide(inertHttpClientLayer),
        Effect.provide(NodeContext.layer),
      ),
    );
    expect(m.log.calls.length).toBe(1);
    expect(Object.hasOwn(row, "followUp")).toBe(false);
  });

  it("still emits a followUp (marked skipped) when turn 1 errored, without a second call", async () => {
    const item = twoTurnItem();
    const m = makeChatCompletionMock({
      "p1:0": { kind: "fail", error: { _tag: "LlmTimeoutError" } },
    });
    const row = await Effect.runPromise(
      executeOrCacheItem(inputFor(item, "att-turn1-error")).pipe(
        Effect.provide(m.layer),
        Effect.provide(inertHttpClientLayer),
        Effect.provide(NodeContext.layer),
      ),
    );
    expect(m.log.calls.length).toBe(1);
    expect(row.error).not.toBeNull();
    expect(row.score).toBe(0);
    expect(row.followUp?.error).toBe("skipped: turn 1 errored");
    expect(row.followUp?.generationTokens).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/orchestration/__tests__/run-challenge.test.ts -t "two-turn"`
Expected: FAIL — `expected 1 to be 2`: only one completion call is made and `row.followUp` is `undefined`.

- [ ] **Step 3: Write minimal implementation**

In `src/orchestration/run-challenge.ts`, add above `executeOrCacheItem` (after the `baseHeader` helper ending at `:105`):

```ts
// ── Second turn ────────────────────────────────────────────────────────────

/** The nested second-turn record carried on an `ItemResult`. */
export type FollowUpResult = NonNullable<ItemResult["followUp"]>;

/**
 * Placeholder second turn recorded when turn 1 errored. There is nothing for
 * the model to reflect on, so no second call is issued — but the field is still
 * emitted, which keeps "this item ran in two-turn mode" observable on every row
 * a two-turn item ever produces.
 */
const SKIPPED_FOLLOW_UP: FollowUpResult = {
  output: "",
  reasoning: null,
  rawOutput: "",
  error: "skipped: turn 1 errored",
  promptTokens: 0,
  generationTokens: 0,
  generationTps: 0,
  wallTimeSec: 0,
};

/**
 * Issue the second turn: the same system + user prompt, then the model's own
 * turn-1 answer as an assistant message, then the follow-up prompt as a user
 * message. LLM failures are folded into `error` by `runPrompt`, so this never
 * fails the item.
 *
 * Only the fields listed on `ItemResult.followUp` are carried over. `promptTps`
 * and `peakMemoryGb` are deliberately not: the former is not reported by every
 * runtime and is not read for turn 2, the latter is a server-lifetime figure
 * already recorded once on the turn-1 row.
 */
export const runFollowUpTurn = (
  input: RunChallengeInput,
  item: ResolvedItem,
  followUpPrompt: string,
  turnOneOutput: string,
  peakRssKb?: Effect.Effect<number>,
): Effect.Effect<FollowUpResult, never, ChatCompletion> =>
  Effect.gen(function* () {
    const exec = yield* runPrompt({
      archiveId: input.attemptId,
      runId: input.attemptId,
      model: modelFromConfig(input.config),
      prompt: item.prompt,
      systemPrompt: input.config.systemPromptText,
      temperature: input.config.temperature,
      maxTokens: input.config.maxTokens,
      priorTurns: [
        { role: "assistant", content: turnOneOutput },
        { role: "user", content: followUpPrompt },
      ],
      ...(peakRssKb !== undefined ? { peakRssKb } : {}),
    });
    return {
      output: exec.output,
      reasoning: exec.reasoning,
      rawOutput: exec.rawOutput,
      error: exec.error,
      promptTokens: exec.promptTokens,
      generationTokens: exec.generationTokens,
      generationTps: exec.generationTps,
      wallTimeSec: exec.wallTimeSec,
    } satisfies FollowUpResult;
  });
```

No import change is needed: `ChatCompletion` is already imported as a type at `src/orchestration/run-challenge.ts:24` and is referenced here only in the `Effect.Effect` requirement position, exactly as `executeOrCacheItem` already references it at `:135`.

In `executeOrCacheItem`, insert between the `runPrompt` call (ending `:164`) and the `scoreByConfig` call (`:166`):

```ts
    let followUp: FollowUpResult | undefined;
    if (item.followUpPrompt !== undefined && exec.error !== null) {
      followUp = SKIPPED_FOLLOW_UP;
    } else if (item.followUpPrompt !== undefined) {
      followUp = yield* runFollowUpTurn(
        input,
        item,
        item.followUpPrompt,
        exec.output,
        peakRssKb,
      );
    }
```

And add to the returned object, immediately after the `breakdown` conditional spread (`:195-197`):

```ts
      ...(followUp !== undefined ? { followUp } : {}),
```

Finally extend the `executeOrCacheItem` doc comment (`:109-123`) with:

```
 * Two-turn items: when the resolved item carries a `followUpPrompt`, a second
 * `runPrompt` call replays the exchange with the model's turn-1 answer plus the
 * follow-up, and its result lands in the nested `followUp` field. The turn-1
 * counters on the row stay turn-1 only.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/orchestration/ && npx tsc --noEmit && npm run lint`
Expected: PASS, no type errors, lint clean.

- [ ] **Step 5: Commit**

```bash
git add src/orchestration/run-challenge.ts src/orchestration/__tests__/run-challenge.test.ts
git commit -m "feat(orchestration): execute the second turn from executeOrCacheItem

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Prove one-turn and two-turn cache namespaces are disjoint

**Files:**
- Test: `src/orchestration/__tests__/run-challenge-cache.test.ts`

**Interfaces:**
- Consumes: `resolveChallenge` from `src/config/challenges.ts` (Task 2), `executeOrCacheItem` (Task 7).
- Produces: no production code. This task is a regression guard on the cache key.

**Trap addressed:** `executeOrCacheItem` copies cache hits verbatim (`src/orchestration/run-challenge.ts:149-152`), so a turn-1-only cached row returned for a two-turn item would carry no `followUp` forever and silently mix regimes. The guard is that `followUpPrompt` is folded into `promptHash` (Task 1) and hence into `itemHash` (`src/config/challenges.ts:237`), and `itemHash` is one of the four fields `findCachedItem` matches on (`src/archive/cache.ts:218`, keyed by `CacheKey` at `:131-136`). A one-turn row therefore cannot be reached by a two-turn lookup, or vice versa. **This must be proven end-to-end rather than asserted**, because the mechanism is a hash identity rather than a named flag — hence this task. See "Boundary escalations" for the explicit-predicate hardening that is out of scope here.

Note this deliberately does NOT stamp a missing turn onto a cache hit. The `scorerHash` stamp at `:151` is documented as a narrow exception; a second exception would rewrite measured-cost fields.

- [ ] **Step 1: Write the failing test**

Append a new top-level describe at the end of `src/orchestration/__tests__/run-challenge-cache.test.ts`, adding these imports at the top of the file:

```ts
import type { Challenge } from "../../schema/challenge.js";
import { resolveChallenge } from "../../config/challenges.js";
```

```ts
describe("cache turn-mode disjointness", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir();
  });
  afterEach(async () => {
    await removeDir(dir);
  });

  const raw = (followUpPrompt?: string): Challenge => ({
    id: "turn-mode-ch",
    version: 1,
    passThreshold: 0.5,
    items: [
      {
        name: "a",
        category: "x",
        tier: 1,
        prompt: "2+2?",
        scorer: "constraint",
        constraints: [{ check: "contains", name: "c1", value: "4" }],
        ...(followUpPrompt === undefined ? {} : { followUpPrompt }),
      },
    ],
  });

  const resolve = (followUpPrompt?: string) =>
    Effect.runPromise(
      resolveChallenge(raw(followUpPrompt), dir).pipe(Effect.provide(NodeContext.layer)),
    );

  const runOnce = async (challenge: Awaited<ReturnType<typeof resolve>>, attemptId: string) => {
    const m = makeChatCompletionMock({});
    await Effect.runPromise(
      runChallenge({
        config,
        challenge,
        attemptId,
        archiveDir: dir,
        archivePath: `${dir}/${attemptId}.jsonl`,
        env,
        deps: fakeDeps(),
      }).pipe(
        Effect.provide(m.layer),
        Effect.provide(inertHttpClientLayer),
        Effect.provide(NodeContext.layer),
      ),
    );
    return m.log.calls.length;
  };

  it("a one-turn cached row is never reused for the two-turn variant", async () => {
    const oneTurn = await resolve();
    const twoTurn = await resolve("What score do you expect?");

    expect(await runOnce(oneTurn, "att-1")).toBe(1); // populate: turn 1 only
    expect(await runOnce(twoTurn, "att-2")).toBe(2); // MISS → both turns execute
  });

  it("a two-turn cached row is never reused for the one-turn variant", async () => {
    const oneTurn = await resolve();
    const twoTurn = await resolve("What score do you expect?");

    expect(await runOnce(twoTurn, "att-1")).toBe(2); // populate: two turns
    expect(await runOnce(oneTurn, "att-2")).toBe(1); // MISS → turn 1 re-executes
  });

  it("an identical two-turn item does hit the cache", async () => {
    const twoTurn = await resolve("What score do you expect?");
    expect(await runOnce(twoTurn, "att-1")).toBe(2);
    expect(await runOnce(twoTurn, "att-2")).toBe(0); // full hit, no model calls
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/orchestration/__tests__/run-challenge-cache.test.ts -t "turn-mode disjointness"`
Expected: on a tree where Task 1 or Task 2 is reverted, FAIL with `expected 0 to be 2` on the first case — the two-turn item hits the one-turn row. On the completed tree it PASSES; run it against a stash of Task 1 to confirm it is a real guard before committing.

- [ ] **Step 3: Write minimal implementation**

None. The behavior is delivered by Tasks 1, 2 and 7; this task only pins it. If a case fails on the completed tree, the defect is in `computePromptHash` threading (Task 2, `buildPromptEntry`) — fix there, not here.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/orchestration/__tests__/run-challenge-cache.test.ts`
Expected: PASS — all pre-existing cache tests included.

- [ ] **Step 5: Commit**

```bash
git add src/orchestration/__tests__/run-challenge-cache.test.ts
git commit -m "test(cache): pin one-turn/two-turn cache namespace disjointness

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: `self_score_matches` constraint kind — schema, discriminator, load-time validation

**Files:**
- Modify: `src/schema/constraints.ts:1-17` (doc), `:162-198` (new variant + union)
- Modify: `src/schema/enums.ts:52-79` (`ConstraintCheck` literal list)
- Modify: `src/config/challenges.ts:103-132` (`validateConstraintPatterns`)
- Test: `src/schema/constraints.test.ts`, `src/schema/enums.test.ts`, `src/config/challenges.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `SelfScoreMatchesConstraint` = `{ check: "self_score_matches"; name: string; extract: string }`, a member of `ConstraintDef`; `"self_score_matches"` in `ConstraintCheck.literals`; an uncompilable `extract` fails at challenge load. Tasks 10-11 consume the type.

**Mandatory:** the load-time check compiles `extract` through `translateInlineFlags` before `regexCompileProblem`, matching the existing precedent for `regex` / `regex_count_min` at `src/config/challenges.ts:119-120`. This is what makes a `(?i)`-prefixed pattern *pass* validation (it is legal after translation) while a genuinely malformed pattern fails the load rather than silently zeroing a check at scoring time. Validating a `(?i)` pattern with a bare `new RegExp` would reject every well-formed P2 item at load; skipping validation entirely would let a malformed one through to the `errored` bucket.

- [ ] **Step 1: Write the failing test**

Append to `src/schema/constraints.test.ts`:

```ts
describe("SelfScoreMatchesConstraint", () => {
  it("decodes as a member of ConstraintDef", () => {
    const v = Schema.decodeUnknownSync(ConstraintDef)({
      check: "self_score_matches",
      name: "calibration",
      extract: "(?i)SELF_SCORE:\\s*([0-9.]+)",
    });
    expect(v.check).toBe("self_score_matches");
    if (v.check !== "self_score_matches") return;
    expect(v.extract).toBe("(?i)SELF_SCORE:\\s*([0-9.]+)");
  });

  it("rejects a self_score_matches constraint with no extract", () => {
    expect(() =>
      Schema.decodeUnknownSync(ConstraintDef)({ check: "self_score_matches", name: "c" }),
    ).toThrow();
  });
});
```

In `src/schema/enums.test.ts`, add `"self_score_matches"` to the end of the `values` array at `:65-86` and change `:88-90` to:

```ts
  it("has exactly 21 variants", () => {
    expect(values.length).toBe(21);
  });
```

Append to `src/config/challenges.test.ts`:

```ts
describe("resolveChallenge self_score_matches validation", () => {
  const withExtract = (extract: string): Challenge => ({
    id: "c",
    version: 1,
    passThreshold: 0.5,
    items: [
      {
        name: "a",
        category: "x",
        tier: 1,
        prompt: "q",
        scorer: "constraint",
        constraints: [{ check: "self_score_matches", name: "cal", extract }],
      },
    ],
  });

  it("accepts a (?i)-prefixed extract pattern — the form P2 emits", async () => {
    // A bare `new RegExp("(?i)…")` is a SyntaxError; this passing proves the
    // load-time check translates inline flags before compiling.
    const exit = await run(provide(resolveChallenge(withExtract("(?i)score:\\s*([0-9.]+)"), challengesDir)));
    expect(exit._tag).toBe("Success");
  });

  it("accepts a plain extract pattern with no inline flags", async () => {
    const exit = await run(provide(resolveChallenge(withExtract("SELF_SCORE:\\s*([0-9.]+)"), challengesDir)));
    expect(exit._tag).toBe("Success");
  });

  it("fails the load when the extract pattern does not compile", async () => {
    const exit = await run(provide(resolveChallenge(withExtract("([0-9.]+"), challengesDir)));
    expect(exit._tag).toBe("Failure");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/schema/constraints.test.ts src/schema/enums.test.ts src/config/challenges.test.ts`
Expected: FAIL — `decodes as a member of ConstraintDef` fails with a parse error on the unknown `check` discriminator; `has exactly 21 variants` fails with `expected 21 to be 20` until the enum literal is added; the challenges cases fail at decode.

- [ ] **Step 3: Write minimal implementation**

In `src/schema/enums.ts`, add `"self_score_matches",` after `"all_lines_word_count",` (`:77`), and update the doc comment at `:52-56` to read "Discriminator for the 21 constraint check variants defined in `./constraints.ts`."

In `src/schema/constraints.ts`, update the leading doc comment (`:4-5`) to say "The 21 constraint check variants", then add after `AllLinesWordCountConstraint` (`:168`):

```ts
/**
 * Calibration check. Reads the item's **second-turn** output, extracts the
 * score the model says it expects, and passes iff that equals the fraction of
 * the item's OTHER checks that passed.
 *
 * `extract` is a regex whose capture group 1 holds the self-reported score.
 * Leading Python-style inline flags are translated the same way the regex
 * checks translate theirs, so `(?i)` works here too.
 *
 * Unlike its twenty siblings it depends on the other checks' results, so the
 * constraint scorer evaluates it after all of them. It is itself excluded from
 * the fraction it predicts — a check cannot be part of its own denominator.
 */
export const SelfScoreMatchesConstraint = Schema.Struct({
  check: Schema.Literal("self_score_matches"),
  ...name,
  extract: Schema.String,
});
export type SelfScoreMatchesConstraint = typeof SelfScoreMatchesConstraint.Type;
```

and add `SelfScoreMatchesConstraint,` as the final member of the `ConstraintDef` union (after `AllLinesWordCountConstraint,` at `:196`).

In `src/config/challenges.ts`, replace the body of the `for` loop in `validateConstraintPatterns` (`:116-130`) with:

```ts
  for (const c of item.constraints) {
    // Every constraint that carries a user-authored regex, whatever field it
    // lives in. `self_score_matches` keeps its pattern in `extract`.
    const pattern =
      c.check === "regex" || c.check === "regex_count_min"
        ? c.pattern
        : c.check === "self_score_matches"
          ? c.extract
          : null;
    if (pattern === null) continue;
    const base =
      c.check === "regex" ? (c.dotall === true ? "s" : "") : c.check === "regex_count_min" ? "g" : "";
    const t = translateInlineFlags(pattern, base);
    const problem = regexCompileProblem(t.pattern, t.flags);
    if (problem !== null) {
      return new ConfigError({
        path: challengeId,
        message:
          `Challenge '${challengeId}' item '${item.name}' constraint '${c.name}' (${c.check}): ` +
          `pattern does not compile as a JS RegExp after inline-flag translation: ` +
          `${pattern} — ${problem}`,
      });
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/schema/ src/config/ && npx tsc --noEmit`
Expected: FAIL to compile in `src/scoring/constraint-checks.ts` — the exhaustive switch in `evaluateConstraint` now misses a union member. That is expected and is fixed in Task 10; if you need this task green in isolation, run Task 10 immediately after. Tests in `src/schema/` and `src/config/` PASS.

- [ ] **Step 5: Commit**

Commit together with Task 10, since the union widening leaves the scorer switch non-exhaustive in between:

```bash
git add src/schema/constraints.ts src/schema/constraints.test.ts src/schema/enums.ts src/schema/enums.test.ts src/config/challenges.ts src/config/challenges.test.ts
# do not commit yet — see Task 10 Step 5
```

---

### Task 10: The calibration evaluator in `constraint-checks.ts`

**Files:**
- Modify: `src/scoring/constraint-checks.ts:1-4` (imports), `:142-293` (`evaluateConstraint` signature + new evaluator)
- Test: `src/scoring/constraint-checks.test.ts`

**Interfaces:**
- Consumes: `SelfScoreMatchesConstraint`, `ConstraintDef` (Task 9), `translateInlineFlags` from `./regex-flags.js`, `ConstraintEvalError` from `../errors/scorer.js`.
- Produces:
  - `export type MechanicalConstraintDef = Exclude<ConstraintDef, SelfScoreMatchesConstraint>`
  - `evaluateConstraint(output: string, def: MechanicalConstraintDef): Effect.Effect<boolean, ConstraintEvalError>` (narrowed parameter; body unchanged)
  - `export interface OtherCheckTally { readonly passed: number; readonly total: number }`
  - `export const evaluateSelfScoreMatch(followUpOutput: string | undefined, def: SelfScoreMatchesConstraint, tally: OtherCheckTally): Effect.Effect<boolean, ConstraintEvalError>`

**Mandatory:** `def.extract` is compiled through `translateInlineFlags` from `./regex-flags.js`, exactly as the `regex` and `regex_count_min` checks compile theirs (`src/scoring/constraint-checks.ts:175`, `:182`) — never through a bare `new RegExp`. P2 emits every extract pattern with a leading `(?i)` group; `new RegExp("(?i)…")` is a `SyntaxError`, which the evaluator's error channel would route into the scorer's `errored` bucket, scoring 0 on all 54 calibration checks for every model in the roster. That failure presents as a uniform substantive finding rather than as a bug, which is the worst outcome available here.

- [ ] **Step 1: Write the failing test**

Append to `src/scoring/constraint-checks.test.ts`:

```ts
describe("evaluateSelfScoreMatch", () => {
  const def = {
    check: "self_score_matches" as const,
    name: "calibration",
    extract: "(?i)SELF_SCORE:\\s*([0-9.]+)",
  };

  const check = (
    followUp: string | undefined,
    tally: { passed: number; total: number },
  ): boolean => Effect.runSync(evaluateSelfScoreMatch(followUp, def, tally));

  it("passes on an exact match with the other checks' fraction", () => {
    expect(check("SELF_SCORE: 0.5", { passed: 2, total: 4 })).toBe(true);
  });

  it("passes on 1 when every other check passed", () => {
    expect(check("SELF_SCORE: 1", { passed: 3, total: 3 })).toBe(true);
  });

  it("passes on 0 when no other check passed — honest failure is rewarded", () => {
    expect(check("SELF_SCORE: 0", { passed: 0, total: 3 })).toBe(true);
  });

  it("compares on the fraction rounded to 3 decimals", () => {
    // 2/3 = 0.666666… → 0.667
    expect(check("SELF_SCORE: 0.667", { passed: 2, total: 3 })).toBe(true);
    expect(check("SELF_SCORE: 0.6667", { passed: 2, total: 3 })).toBe(false);
    expect(check("SELF_SCORE: 0.66", { passed: 2, total: 3 })).toBe(false);
  });

  it("fails on a near miss — no partial credit", () => {
    expect(check("SELF_SCORE: 0.75", { passed: 2, total: 4 })).toBe(false);
  });

  it("fails when the turn-2 output is missing", () => {
    expect(check(undefined, { passed: 2, total: 4 })).toBe(false);
  });

  it("fails when the pattern does not match the turn-2 output", () => {
    expect(check("I think I did fine.", { passed: 2, total: 4 })).toBe(false);
  });

  it("fails when the captured value is not a number", () => {
    expect(
      Effect.runSync(
        evaluateSelfScoreMatch("SCORE: abc", { ...def, extract: "SCORE:\\s*(.+)" }, {
          passed: 2,
          total: 4,
        }),
      ),
    ).toBe(false);
  });

  it("fails when there are no other checks to predict", () => {
    expect(check("SELF_SCORE: 1", { passed: 0, total: 0 })).toBe(false);
  });

  // ── Inline-flag translation ──────────────────────────────────────────────
  // P2 emits every extract pattern with a leading `(?i)` group, which is the
  // form the spec mandates for case-insensitivity. A bare `new RegExp` cannot
  // compile it: all 54 calibration checks would land in `errored` and score 0,
  // and uniform calibration failure across the roster reads as a finding rather
  // than as a bug. These three cases pin the translation.

  it("compiles a (?i)-prefixed extract instead of erroring on it", () => {
    // `new RegExp("(?i)...")` is a SyntaxError in JS; reaching a boolean at all
    // proves the pattern went through translateInlineFlags.
    expect(check("SELF_SCORE: 0.5", { passed: 1, total: 2 })).toBe(true);
  });

  it("matches case-insensitively under (?i)", () => {
    expect(check("self_score: 0.5", { passed: 1, total: 2 })).toBe(true);
    expect(check("Self_Score: 0.5", { passed: 1, total: 2 })).toBe(true);
  });

  it("is case-SENSITIVE without (?i) — proving the flag does the work", () => {
    const bare = { ...def, extract: "SELF_SCORE:\\s*([0-9.]+)" };
    expect(Effect.runSync(evaluateSelfScoreMatch("self_score: 0.5", bare, { passed: 1, total: 2 }))).toBe(
      false,
    );
    expect(Effect.runSync(evaluateSelfScoreMatch("SELF_SCORE: 0.5", bare, { passed: 1, total: 2 }))).toBe(
      true,
    );
  });
});
```

Add `evaluateSelfScoreMatch` to the existing import from `./constraint-checks.js` at `src/scoring/constraint-checks.test.ts:4`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scoring/constraint-checks.test.ts -t "evaluateSelfScoreMatch"`
Expected: FAIL — `evaluateSelfScoreMatch is not a function` / TypeScript reports it is not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/scoring/constraint-checks.ts`, change the import on `:3` to:

```ts
import type { ConstraintDef, SelfScoreMatchesConstraint } from "../schema/constraints.js";
```

Change the `evaluateConstraint` signature (`:153-156`) to:

```ts
/**
 * The nineteen-plus-one mechanical checks: every constraint kind except
 * `self_score_matches`, which needs the other checks' results and the item's
 * second-turn text and so cannot be evaluated from `output` alone. Excluding
 * it at the type level is what makes "the calibration check never runs on this
 * path" a compiler guarantee instead of a convention.
 */
export type MechanicalConstraintDef = Exclude<ConstraintDef, SelfScoreMatchesConstraint>;

export const evaluateConstraint = (
  output: string,
  def: MechanicalConstraintDef,
): Effect.Effect<boolean, ConstraintEvalError> =>
```

(The body — the whole `Effect.try({ ... })` at `:157-293` — is unchanged.)

Append at the end of the file:

```ts
/** Round to 3 decimals: the grain the calibration comparison is exact on. */
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/** Tally of an item's checks EXCLUDING its calibration checks. */
export interface OtherCheckTally {
  readonly passed: number;
  readonly total: number;
}

/**
 * Calibration check. Extracts the model's self-reported score from the item's
 * second-turn output via `def.extract` (capture group 1) and compares it with
 * `tally.passed / tally.total`, both rounded to 3 decimals.
 *
 * `extract` is compiled through `translateInlineFlags`, exactly as the `regex`
 * and `regex_count_min` checks compile their patterns — NOT through a bare
 * `new RegExp`. Authored patterns carry a leading `(?i)` inline-flag group,
 * which the JS engine rejects outright; compiling it directly would route every
 * calibration check into the `errored` bucket and score them all 0, which reads
 * as a uniform result rather than as a defect.
 *
 * Fails — never errors — when the second turn is absent, when the pattern does
 * not match, when the captured text is not a finite number, or when the item has
 * no other checks to predict. Matching is exact: a near miss earns nothing,
 * which is the point of the measurement.
 */
export const evaluateSelfScoreMatch = (
  followUpOutput: string | undefined,
  def: SelfScoreMatchesConstraint,
  tally: OtherCheckTally,
): Effect.Effect<boolean, ConstraintEvalError> =>
  Effect.try({
    try: (): boolean => {
      if (followUpOutput === undefined) return false;
      if (tally.total === 0) return false;
      const t = translateInlineFlags(def.extract, "");
      const m = new RegExp(t.pattern, t.flags).exec(followUpOutput);
      const raw = m?.[1];
      if (raw === undefined) return false;
      const reported = Number(raw.trim());
      if (!Number.isFinite(reported)) return false;
      return round3(reported) === round3(tally.passed / tally.total);
    },
    catch: (cause) =>
      new ConstraintEvalError({
        constraintName: def.name,
        check: def.check,
        cause: cause instanceof Error ? cause.message : String(cause),
      }),
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/scoring/constraint-checks.test.ts && npx tsc --noEmit`
Expected: PASS. `tsc` now reports one remaining error in `src/scoring/constraint.ts:31` (`ConstraintDef` is not assignable to `MechanicalConstraintDef`) — that is Task 11's failing signal; if you want a green tree at this commit, run Task 11 before committing.

- [ ] **Step 5: Commit**

```bash
git add src/schema/constraints.ts src/schema/constraints.test.ts src/schema/enums.ts src/schema/enums.test.ts src/config/challenges.ts src/config/challenges.test.ts src/scoring/constraint-checks.ts src/scoring/constraint-checks.test.ts
git commit -m "feat(scoring): self_score_matches constraint kind and its evaluator

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Two-phase evaluation in `scoreConstraints`, with the calibration checks last

**Files:**
- Modify: `src/scoring/constraint.ts:1-46`
- Test: `src/scoring/constraint.test.ts`

**Interfaces:**
- Consumes: `evaluateConstraint(output, def: MechanicalConstraintDef)`, `evaluateSelfScoreMatch(followUpOutput, def, tally)`, `OtherCheckTally` (Task 10).
- Produces: `scoreConstraints(output: string, config: ConstraintConfig, followUpOutput?: string): Effect.Effect<PromptScore>`. Task 12 calls the three-argument form.

**Trap addressed:** check ordering. The calibration check consumes the other checks' outcome, so it is evaluated in an explicit second pass over a partitioned list — the dependency is structural, not a side effect of loop order, and it survives any future reordering or parallelisation of phase 1.

- [ ] **Step 1: Write the failing test**

Append to `src/scoring/constraint.test.ts`:

```ts
describe("scoreConstraints with a calibration check", () => {
  const config = (extract = "(?i)SELF_SCORE:\\s*([0-9.]+)"): ConstraintConfig => ({
    type: "constraint",
    constraints: [
      { check: "contains", name: "hit", value: "foo" },
      { check: "contains", name: "miss", value: "xyz" },
      { check: "self_score_matches", name: "calibration", extract },
    ],
  });

  it("passes calibration when the self-reported score equals the other checks' fraction", () => {
    const r = Effect.runSync(scoreConstraints("foo bar", config(), "SELF_SCORE: 0.5"));
    expect(r.breakdown?.passed).toEqual(["hit", "calibration"]);
    expect(r.breakdown?.failed).toEqual(["miss"]);
    // Calibration is one more check in the same denominator: 2 of 3.
    expect(r.score).toBeCloseTo(2 / 3);
  });

  it("fails calibration when the model over-reports", () => {
    const r = Effect.runSync(scoreConstraints("foo bar", config(), "SELF_SCORE: 1.0"));
    expect(r.breakdown?.failed).toEqual(["miss", "calibration"]);
    expect(r.score).toBeCloseTo(1 / 3);
  });

  it("rewards honest failure: 0 mechanical checks but correct self-report beats a false claim", () => {
    const honest = Effect.runSync(scoreConstraints("nothing", config(), "SELF_SCORE: 0"));
    const boastful = Effect.runSync(scoreConstraints("nothing", config(), "SELF_SCORE: 1"));
    expect(honest.score).toBeCloseTo(1 / 3);
    expect(boastful.score).toBe(0);
  });

  it("excludes the calibration check from its own denominator", () => {
    // Two mechanical checks, both passing → the predicted fraction is 1, not 2/3.
    const cfg: ConstraintConfig = {
      type: "constraint",
      constraints: [
        { check: "contains", name: "a", value: "foo" },
        { check: "contains", name: "b", value: "bar" },
        { check: "self_score_matches", name: "calibration", extract: "([0-9.]+)" },
      ],
    };
    expect(Effect.runSync(scoreConstraints("foo bar", cfg, "1")).breakdown?.passed).toContain(
      "calibration",
    );
    expect(Effect.runSync(scoreConstraints("foo bar", cfg, "0.667")).breakdown?.failed).toContain(
      "calibration",
    );
  });

  it("fails calibration when no follow-up output was supplied", () => {
    const r = Effect.runSync(scoreConstraints("foo bar", config()));
    expect(r.breakdown?.failed).toContain("calibration");
  });

  it("leaves items with no calibration check byte-identical", () => {
    const cfg: ConstraintConfig = {
      type: "constraint",
      constraints: [
        { check: "contains", name: "a", value: "foo" },
        { check: "min_length", name: "b", length: 2 },
      ],
    };
    const r = Effect.runSync(scoreConstraints("foo bar", cfg));
    expect(r.score).toBe(1);
    expect(r.breakdown?.passed).toEqual(["a", "b"]);
    expect(r.details).toBe("2/2: all passed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scoring/constraint.test.ts -t "with a calibration check"`
Expected: FAIL — TypeScript rejects the third argument to `scoreConstraints`, and `evaluateConstraint` rejects the `self_score_matches` member as not assignable to `MechanicalConstraintDef`.

- [ ] **Step 3: Write minimal implementation**

Replace `src/scoring/constraint.ts` in full:

```ts
import { Effect } from "effect";
import type { SelfScoreMatchesConstraint } from "../schema/constraints.js";
import type { ConstraintConfig } from "../schema/scorer.js";
import { evaluateConstraint, evaluateSelfScoreMatch } from "./constraint-checks.js";
import type { ConstraintBreakdown, PromptScore } from "./score-result.js";

/**
 * constraint scorer (requirements §4.3 / runner.py:_score_constraints).
 *
 * For each constraint: evaluate to pass / fail / errored. The score is
 * `passedCount / totalCount` (matches the prototype; §4.3). If the
 * constraint list is empty, score is 0 — mirrors the Python guard
 * `len(passed) / total if total > 0 else 0.0`.
 *
 * ConstraintEvalError does NOT bubble up; it is caught and recorded as an
 * errored check. This matches the prototype's error handling around the
 * lambda call which routes any failure into the `failed` bucket — BUT we
 * intentionally separate `errored` from `failed` per the requirements doc
 * (§4.3: "record as errored (distinct from failed)"). This is the one
 * documented behavioral departure from the prototype for this scorer.
 *
 * Evaluation runs in two explicit phases. Phase 1 is the mechanical checks,
 * which are independent of one another. Phase 2 is the `self_score_matches`
 * calibration checks, which consume phase 1's tally and the item's second-turn
 * text, and therefore MUST see every mechanical check settled first. The
 * partition makes that dependency structural: phase 1 could be reordered or
 * parallelised without changing a calibration result. The calibration checks are
 * excluded from the tally they predict — a check cannot be part of its own
 * denominator — but they DO count in the item's own `passed / total` score, so
 * a miscalibrated item never reaches 1.0.
 */
export const scoreConstraints = (
  output: string,
  config: ConstraintConfig,
  followUpOutput?: string,
): Effect.Effect<PromptScore> =>
  Effect.gen(function* () {
    const passed: string[] = [];
    const failed: string[] = [];
    const errored: string[] = [];

    // Phase 1 — mechanical checks.
    const calibration: SelfScoreMatchesConstraint[] = [];
    for (const def of config.constraints) {
      if (def.check === "self_score_matches") {
        calibration.push(def);
        continue;
      }
      const result = yield* Effect.either(evaluateConstraint(output, def));
      if (result._tag === "Right") {
        if (result.right) passed.push(def.name);
        else failed.push(def.name);
      } else {
        errored.push(def.name);
      }
    }

    // Phase 2 — calibration checks, over phase 1's settled tally.
    const tally = {
      passed: passed.length,
      total: config.constraints.length - calibration.length,
    };
    for (const def of calibration) {
      const result = yield* Effect.either(evaluateSelfScoreMatch(followUpOutput, def, tally));
      if (result._tag === "Right") {
        if (result.right) passed.push(def.name);
        else failed.push(def.name);
      } else {
        errored.push(def.name);
      }
    }

    const total = config.constraints.length;
    const score = total > 0 ? passed.length / total : 0;
    const breakdown: ConstraintBreakdown = { passed, failed, errored };

    const details = formatDetails(passed.length, total, failed, errored);
    return { kind: "prompt", score, details, breakdown };
  });

const formatDetails = (
  passedCount: number,
  total: number,
  failed: ReadonlyArray<string>,
  errored: ReadonlyArray<string>,
): string => {
  const parts: string[] = [`${passedCount}/${total}`];
  if (failed.length > 0) parts.push(`failed [${failed.join(", ")}]`);
  if (errored.length > 0) parts.push(`errored [${errored.join(", ")}]`);
  if (failed.length === 0 && errored.length === 0) parts.push("all passed");
  return parts.join(": ");
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/scoring/ && npx tsc --noEmit && npm run lint`
Expected: PASS, no type errors, lint clean. (The original doc comment's `try/except` wording was rewritten above to avoid the strict-lint grep for banned tokens in comments.)

- [ ] **Step 5: Commit**

```bash
git add src/scoring/constraint.ts src/scoring/constraint.test.ts
git commit -m "feat(scoring): two-phase constraint evaluation with calibration checks last

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Route the turn-2 output into scoring through `scoreByConfig`'s `meta`

**Files:**
- Create: `src/scoring/dispatch.test.ts`
- Modify: `src/scoring/dispatch.ts:18-44`
- Modify: `src/orchestration/run-challenge.ts:166-172` (scoring call)
- Test: `src/scoring/dispatch.test.ts`, `src/orchestration/__tests__/run-challenge.test.ts`

**Interfaces:**
- Consumes: `scoreConstraints(output, config, followUpOutput?)` (Task 11), `FollowUpResult` (Task 7).
- Produces: `scoreByConfig(output, cfg, meta)` forwards a string-valued `meta.followUpOutput` to `scoreConstraints`. Task 15 uses the same key from the re-score path.

`src/scoring/dispatch.ts` is outside this plan's original file list; the lead has **approved** this passthrough as the wiring for contract 7, in preference to a scorer-selection branch inside the orchestrator. `meta` is an existing parameter already threaded to `scoreCustom` (`:40`) — only the `constraint` branch currently drops it.

- [ ] **Step 1: Write the failing test**

Create `src/scoring/dispatch.test.ts`:

```ts
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { ScorerConfig } from "../schema/scorer.js";
import { scoreByConfig } from "./dispatch.js";

const cfg: ScorerConfig = {
  type: "constraint",
  constraints: [
    { check: "contains", name: "hit", value: "foo" },
    { check: "contains", name: "miss", value: "xyz" },
    { check: "self_score_matches", name: "calibration", extract: "(?i)self_score:\\s*([0-9.]+)" },
  ],
};

const run = (meta: Record<string, unknown>) =>
  Effect.runPromise(
    scoreByConfig("foo bar", cfg, meta).pipe(Effect.provide(NodeContext.layer)),
  );

describe("scoreByConfig constraint + followUpOutput", () => {
  it("forwards a string followUpOutput to the constraint scorer", async () => {
    const r = await run({ promptName: "i", followUpOutput: "SELF_SCORE: 0.5" });
    expect(r.breakdown?.passed).toContain("calibration");
  });

  it("fails calibration when no followUpOutput is supplied", async () => {
    const r = await run({ promptName: "i" });
    expect(r.breakdown?.failed).toContain("calibration");
  });

  it("ignores a non-string followUpOutput rather than coercing it", async () => {
    const r = await run({ promptName: "i", followUpOutput: 0.5 });
    expect(r.breakdown?.failed).toContain("calibration");
  });
});
```

Append inside the `describe("executeOrCacheItem two-turn items", ...)` block added in Task 7:

```ts
  it("scores the calibration check against the turn-2 output", async () => {
    const prompt = samplePromptExact({
      scorer: {
        type: "constraint",
        constraints: [
          { check: "contains", name: "hit", value: "4" },
          { check: "contains", name: "miss", value: "zzz" },
          { check: "self_score_matches", name: "calibration", extract: "([0-9.]+)" },
        ],
      },
    });
    const item: ResolvedItem = {
      itemId: prompt.name,
      promptHash: prompt.promptHash,
      itemHash: "ih-calibrated",
      scorer: prompt.scorer,
      prompt,
      followUpPrompt: "What score do you expect?",
    };
    const m = twoTurnStubs(); // turn 1 → "4", turn 2 → "0.5"
    const row = await Effect.runPromise(
      executeOrCacheItem(inputFor(item, "att-calibrated")).pipe(
        Effect.provide(m.layer),
        Effect.provide(inertHttpClientLayer),
        Effect.provide(NodeContext.layer),
      ),
    );
    // 1 of 2 mechanical checks passed → the honest self-score is 0.5, which the
    // turn-2 stub reports, so calibration passes: 2 of 3 checks.
    expect(row.breakdown?.passed).toEqual(["hit", "calibration"]);
    expect(row.score).toBeCloseTo(2 / 3);
  });

  it("fails the calibration check when the model over-reports in turn 2", async () => {
    const prompt = samplePromptExact({
      scorer: {
        type: "constraint",
        constraints: [
          { check: "contains", name: "hit", value: "4" },
          { check: "contains", name: "miss", value: "zzz" },
          { check: "self_score_matches", name: "calibration", extract: "([0-9.]+)" },
        ],
      },
    });
    const item: ResolvedItem = {
      itemId: prompt.name,
      promptHash: prompt.promptHash,
      itemHash: "ih-overreport",
      scorer: prompt.scorer,
      prompt,
      followUpPrompt: "What score do you expect?",
    };
    const m = makeChatCompletionMock({
      "p1:0": {
        kind: "ok",
        result: {
          output: "4",
          reasoning: null,
          promptTokens: 1,
          generationTokens: 1,
          promptTps: 0,
          generationTps: 0,
        },
      },
      "p1:0:followup": {
        kind: "ok",
        result: {
          output: "1.0",
          reasoning: null,
          promptTokens: 1,
          generationTokens: 1,
          promptTps: 0,
          generationTps: 0,
        },
      },
    });
    const row = await Effect.runPromise(
      executeOrCacheItem(inputFor(item, "att-overreport")).pipe(
        Effect.provide(m.layer),
        Effect.provide(inertHttpClientLayer),
        Effect.provide(NodeContext.layer),
      ),
    );
    expect(row.breakdown?.failed).toEqual(["miss", "calibration"]);
    expect(row.score).toBeCloseTo(1 / 3);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scoring/dispatch.test.ts src/orchestration/__tests__/run-challenge.test.ts -t "calibration"`
Expected: FAIL — `forwards a string followUpOutput to the constraint scorer` fails because the `constraint` branch of `scoreByConfig` drops `meta`, so `calibration` lands in `failed`; the orchestration case fails the same way with a score of 1/3 instead of 2/3.

- [ ] **Step 3: Write minimal implementation**

In `src/scoring/dispatch.ts`, replace the `constraint` branch (`:31-32`) with:

```ts
    case "constraint": {
      // The item's second-turn text, present only for two-turn items. The
      // `self_score_matches` check needs it; the other twenty ignore it. Read
      // narrowly rather than cast — `meta` is an untyped bag, and a non-string
      // value must degrade to "no second turn" rather than be coerced.
      const followUpOutput = meta["followUpOutput"];
      return typeof followUpOutput === "string"
        ? scoreConstraints(output, cfg, followUpOutput)
        : scoreConstraints(output, cfg);
    }
```

In `src/orchestration/run-challenge.ts`, replace the scoring call (`:166-172`) with:

```ts
    const scoreResult = yield* scoreByConfig(exec.output, item.scorer, {
      promptName: item.itemId,
      // Conditional spread: `exactOptionalPropertyTypes` is on, and a one-turn
      // item must send exactly the meta bag it always has.
      ...(followUp !== undefined ? { followUpOutput: followUp.output } : {}),
    }).pipe(
      Effect.catchAll(() =>
        Effect.succeed<PromptScore>({ kind: "prompt", score: 0, details: "scorer error" }),
      ),
    );
```

No import changes in either file.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ && npx tsc --noEmit && npm run lint`
Expected: PASS across the whole `src/` suite, no type errors, lint clean.

- [ ] **Step 5: Commit**

```bash
git add src/scoring/dispatch.ts src/scoring/dispatch.test.ts src/orchestration/run-challenge.ts src/orchestration/__tests__/run-challenge.test.ts
git commit -m "feat(scoring): forward followUpOutput through scoreByConfig to the constraint scorer

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Emit `follow_up` in the per-item detail payload

**Files:**
- Modify: `src/report/write-details.ts:52-64`
- Test: `src/report/write-details.test.ts`

**Interfaces:**
- Consumes: `ItemResult.followUp` (Task 6).
- Produces: each entry of the detail JSON's `items` array carries `follow_up` when the archived row had one. Task 14 consumes it.

Note the calibration check's own pass/fail already reaches the drilldown through `breakdown` (its `name` appears in `passed` / `failed`), which `describeScorer` renders as a per-check mark — no extra field is needed for it.

- [ ] **Step 1: Write the failing test**

Append to `src/report/write-details.test.ts`, mirroring the existing "writes one detail file per v2 attempt" test's setup (same `v2Header`, same `writeBlob` calls, same `SCORER`):

```ts
  it("carries followUp through to the per-item detail payload", async () => {
    const sh = scorerHash(SCORER as never);
    const item = {
      itemId: "i",
      promptName: "i",
      promptHash: "ph",
      itemHash: "ih",
      scorerHash: sh,
      executedAt: "t",
      promptTokens: 1,
      generationTokens: 1,
      promptTps: 1,
      generationTps: 1,
      peakMemoryGb: 0,
      wallTimeSec: 0,
      output: "4",
      reasoning: null,
      rawOutput: "4",
      error: null,
      score: 1,
      followUp: {
        output: "SELF_SCORE: 0.5",
        reasoning: null,
        rawOutput: "SELF_SCORE: 0.5",
        error: null,
        promptTokens: 40,
        generationTokens: 12,
        generationTps: 22.5,
        wallTimeSec: 1.5,
      },
    };
    const file = join(dir, "att-fu.jsonl");
    const out = join(dir, "out-fu");
    await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const { writeFile } = yield* Effect.promise(() => import("node:fs/promises"));
          yield* writeBlob(dir, "prompts", "ph", "What is 2+2?");
          yield* writeBlob(dir, "scorers", sh, JSON.stringify(SCORER));
          yield* writeBlob(dir, "system", "cfg", "Be concise.");
          yield* Effect.promise(() =>
            writeFile(
              file,
              `${JSON.stringify({ ...v2Header, attemptId: "att-fu" })}\n${JSON.stringify(item)}\n`,
            ),
          );
          return yield* writeDetails(out, [{ attemptId: "att-fu", sourcePath: file }]);
        }),
        NodeContext.layer,
      ),
    );

    const payload = JSON.parse(await readFile(join(out, "att-fu.json"), "utf8")) as {
      items: Array<{ follow_up?: { output: string; generationTokens: number } }>;
    };
    expect(payload.items[0]?.follow_up?.output).toBe("SELF_SCORE: 0.5");
    expect(payload.items[0]?.follow_up?.generationTokens).toBe(12);
  });

  it("omits follow_up for an item that never ran a second turn", async () => {
    const sh = scorerHash(SCORER as never);
    const item = {
      itemId: "i",
      promptName: "i",
      promptHash: "ph",
      itemHash: "ih",
      scorerHash: sh,
      executedAt: "t",
      promptTokens: 1,
      generationTokens: 1,
      promptTps: 1,
      generationTps: 1,
      peakMemoryGb: 0,
      wallTimeSec: 0,
      output: "4",
      reasoning: null,
      rawOutput: "4",
      error: null,
      score: 1,
    };
    const file = join(dir, "att-nofu.jsonl");
    const out = join(dir, "out-nofu");
    await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const { writeFile } = yield* Effect.promise(() => import("node:fs/promises"));
          yield* writeBlob(dir, "prompts", "ph", "What is 2+2?");
          yield* writeBlob(dir, "scorers", sh, JSON.stringify(SCORER));
          yield* writeBlob(dir, "system", "cfg", "Be concise.");
          yield* Effect.promise(() =>
            writeFile(
              file,
              `${JSON.stringify({ ...v2Header, attemptId: "att-nofu" })}\n${JSON.stringify(item)}\n`,
            ),
          );
          return yield* writeDetails(out, [{ attemptId: "att-nofu", sourcePath: file }]);
        }),
        NodeContext.layer,
      ),
    );

    const raw = await readFile(join(out, "att-nofu.json"), "utf8");
    const payload = JSON.parse(raw) as { items: Array<Record<string, unknown>> };
    expect(Object.hasOwn(payload.items[0] ?? {}, "follow_up")).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/report/write-details.test.ts -t "carries followUp"`
Expected: FAIL — `expected undefined to be 'SELF_SCORE: 0.5'`: the payload has no `follow_up` key.

- [ ] **Step 3: Write minimal implementation**

In `src/report/write-details.ts`, add one line to the item mapping, after the `breakdown` line (`:63`):

```ts
          // The item's second conversational turn when it ran one (undefined →
          // JSON.stringify drops the key, so single-turn archives emit nothing).
          // The inner keys stay camelCase because the archived struct is emitted
          // verbatim, exactly as `breakdown` is.
          follow_up: item.followUp,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/report/ && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/report/write-details.ts src/report/write-details.test.ts
git commit -m "feat(report): emit follow_up in the per-item detail payload

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Render the second turn in the drilldown

**Files:**
- Modify: `webapp/src/lib/use-attempt-detail.ts:3-15`
- Modify: `webapp/src/components/DrilldownPanel.tsx:75-101`
- Test: `webapp/src/lib/use-attempt-detail.test.ts`

**Interfaces:**
- Consumes: the `follow_up` key emitted in Task 13.
- Produces: `AttemptDetailItem.follow_up?: AttemptDetailFollowUp | null` where `AttemptDetailFollowUp = { output: string; reasoning: string | null; rawOutput: string; error: string | null; promptTokens: number; generationTokens: number; generationTps: number; wallTimeSec: number }`. This is the only webapp surface touched: `data.js`, `WebappRecord`, `pipeline.ts` and `coverage.ts` are untouched, and the per-attempt grain does not change.

- [ ] **Step 1: Write the failing test**

Append to `webapp/src/lib/use-attempt-detail.test.ts`:

```ts
describe("AttemptDetailItem follow_up", () => {
  it("round-trips a detail body whose item carries a second turn", async () => {
    const detail = {
      attempt_id: "a1",
      config_id: "c",
      config_hash: "ch",
      artifact: "art",
      challenge_id: "chal",
      challenge_version: 1,
      system_prompt_text: "Be concise.",
      items: [
        {
          item_id: "i",
          prompt_name: "i",
          prompt_text: "2+2?",
          output: "4",
          reasoning: null,
          score: 0.667,
          error: null,
          scorer: { type: "constraint", constraints: [] },
          breakdown: { passed: ["hit", "calibration"], failed: ["miss"], errored: [] },
          follow_up: {
            output: "SELF_SCORE: 0.5",
            reasoning: null,
            rawOutput: "SELF_SCORE: 0.5",
            error: null,
            promptTokens: 40,
            generationTokens: 12,
            generationTps: 22.5,
            wallTimeSec: 1.5,
          },
        },
      ],
    };
    const res = new Response(JSON.stringify(detail), { status: 200, headers: jsonHeaders });
    const r = await classifyDetailResponse(res);
    expect(r.kind).toBe("loaded");
    if (r.kind !== "loaded") return;
    expect(r.detail.items[0]?.follow_up?.output).toBe("SELF_SCORE: 0.5");
    expect(r.detail.items[0]?.follow_up?.generationTokens).toBe(12);
  });

  it("accepts an item with no second turn", async () => {
    const detail = {
      attempt_id: "a1",
      config_id: "c",
      config_hash: "ch",
      artifact: "art",
      challenge_id: "chal",
      challenge_version: 1,
      system_prompt_text: "Be concise.",
      items: [
        {
          item_id: "i",
          prompt_name: "i",
          prompt_text: "2+2?",
          output: "4",
          reasoning: null,
          score: 1,
          error: null,
          scorer: { type: "exact_match", expected: "4", extract: "(\\d+)" },
        },
      ],
    };
    const res = new Response(JSON.stringify(detail), { status: 200, headers: jsonHeaders });
    const r = await classifyDetailResponse(res);
    expect(r.kind).toBe("loaded");
    if (r.kind !== "loaded") return;
    expect(r.detail.items[0]?.follow_up).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run webapp/src/lib/use-attempt-detail.test.ts -t "follow_up"`
Expected: FAIL — TypeScript reports `Property 'follow_up' does not exist on type 'AttemptDetailItem'`.

- [ ] **Step 3: Write minimal implementation**

In `webapp/src/lib/use-attempt-detail.ts`, add above `AttemptDetailItem` (`:3`):

```ts
/**
 * The item's second conversational turn, emitted verbatim from the archive, so
 * these keys are camelCase while the surrounding payload is snake_case. Absent
 * on every single-turn item and on every archive written before multi-turn
 * existed.
 */
export interface AttemptDetailFollowUp {
  output: string;
  reasoning: string | null;
  rawOutput: string;
  error: string | null;
  promptTokens: number;
  generationTokens: number;
  generationTps: number;
  wallTimeSec: number;
}
```

and add as the last field of `AttemptDetailItem` (after `breakdown`, `:14`):

```ts
  // Second-turn (self-assessment) payload; absent on single-turn items. The
  // calibration check's own pass/fail arrives through `breakdown`, like every
  // other check.
  follow_up?: AttemptDetailFollowUp | null;
```

In `webapp/src/components/DrilldownPanel.tsx`, insert between the `it.error` block (ending `:97`) and the `Scorer` label (`:98`):

```tsx
                        {it.follow_up !== undefined && it.follow_up !== null && (
                          <>
                            <div className={styles.itemLabel}>Self-assessment (turn 2)</div>
                            <div className={`${styles.itemText} ${styles.scrollText}`}>
                              {it.follow_up.output}
                            </div>
                            {it.follow_up.error !== null && (
                              <div className={styles.itemText}>
                                Turn 2 error: {it.follow_up.error}
                              </div>
                            )}
                          </>
                        )}
```

No CSS change: `itemLabel`, `itemText` and `scrollText` already exist in `DrilldownPanel.module.css` and are used by the Output block at `:82-83`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run webapp/src/lib/use-attempt-detail.test.ts && npm --prefix webapp run build`
Expected: PASS, and the webapp builds (which type-checks `DrilldownPanel.tsx`).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/lib/use-attempt-detail.ts webapp/src/lib/use-attempt-detail.test.ts webapp/src/components/DrilldownPanel.tsx
git commit -m "feat(webapp): show the second-turn self-assessment in the item drilldown

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Feed the archived second turn to both `./bench score` re-score paths

**Files:**
- Modify: `src/cli/commands/score.ts:158-160` (corpus path), `:204-206` (store-primary path)
- Test: `src/cli/commands/__tests__/score.test.ts`

**Interfaces:**
- Consumes: `scoreByConfig(output, cfg, meta)`'s `followUpOutput` key (Task 12), `ItemResult.followUp` (Task 6).
- Produces: `rescoreItems` and `rescoreItemsFromStore` reproduce the same calibration result a fresh run produces.

`src/cli/commands/score.ts` is outside this plan's original file list; the lead has **approved this and promoted it to mandatory within P1**. Without it, `./bench score` re-scores a two-turn archive with no follow-up text, failing every calibration check and silently lowering those items' scores — so a re-scored two-turn attempt disagrees with a freshly-run one, while the turn-2 text needed to score it correctly is sitting in the same archive row. Silent divergence on the re-score path is not shippable.

`withBreakdown` (`:80-87`) rebuilds the row with `{ breakdown: _stale, ...rest }`, so `followUp` is already preserved verbatim across a re-score; only the scorer call needs the text.

- [ ] **Step 1: Write the failing test**

Append to `src/cli/commands/__tests__/score.test.ts`, using the file's existing helpers for building `ItemResult` rows and a `ResolvedChallenge` (mirror whichever fixture shape the neighbouring `rescoreItems` tests already use):

```ts
describe("rescore with an archived second turn", () => {
  const constraintScorer = {
    type: "constraint" as const,
    constraints: [
      { check: "contains" as const, name: "hit", value: "4" },
      { check: "contains" as const, name: "miss", value: "zzz" },
      {
        check: "self_score_matches" as const,
        name: "calibration",
        extract: "(?i)self_score:\\s*([0-9.]+)",
      },
    ],
  };

  const archivedItem: ItemResult = {
    itemId: "i",
    promptName: "i",
    promptHash: "ph",
    itemHash: "ih",
    scorerHash: "sh",
    executedAt: "t",
    promptTokens: 1,
    generationTokens: 1,
    promptTps: 0,
    generationTps: 0,
    peakMemoryGb: 0,
    wallTimeSec: 0,
    output: "4",
    reasoning: null,
    rawOutput: "4",
    error: null,
    score: 0,
    followUp: {
      output: "SELF_SCORE: 0.5",
      reasoning: null,
      rawOutput: "SELF_SCORE: 0.5",
      error: null,
      promptTokens: 40,
      generationTokens: 12,
      generationTps: 22.5,
      wallTimeSec: 1.5,
    },
  };

  it("store-primary path: reproduces the calibration pass from the archived followUp", async () => {
    const r = await Effect.runPromise(
      rescoreItemsFromStore([archivedItem], [{ item: archivedItem, scorer: constraintScorer }]).pipe(
        Effect.provide(NodeContext.layer),
      ),
    );
    expect(r.updated[0]?.breakdown?.passed).toEqual(["hit", "calibration"]);
    expect(r.updated[0]?.score).toBeCloseTo(2 / 3);
  });

  it("store-primary path: preserves the followUp field across a re-score", async () => {
    const r = await Effect.runPromise(
      rescoreItemsFromStore([archivedItem], [{ item: archivedItem, scorer: constraintScorer }]).pipe(
        Effect.provide(NodeContext.layer),
      ),
    );
    expect(r.updated[0]?.followUp?.output).toBe("SELF_SCORE: 0.5");
    expect(r.updated[0]?.followUp?.generationTokens).toBe(12);
  });

  it("corpus path: reproduces the calibration pass from the archived followUp", async () => {
    const challenge: ResolvedChallenge = {
      id: "ch",
      version: 1,
      passThreshold: 0.5,
      challengeHash: "chh",
      items: [
        {
          itemId: "i",
          promptHash: "ph",
          itemHash: "ih",
          scorer: constraintScorer,
          prompt: {
            name: "i",
            category: "x",
            tier: 1,
            system: { key: "none", text: "" },
            promptText: "2+2?",
            scorer: constraintScorer,
            promptHash: "ph",
          },
          followUpPrompt: "What score do you expect?",
        },
      ],
    };
    const r = await Effect.runPromise(
      rescoreItems([archivedItem], challenge).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(r.updated[0]?.breakdown?.passed).toEqual(["hit", "calibration"]);
    expect(r.updated[0]?.score).toBeCloseTo(2 / 3);
  });

  it("a one-turn item re-scores exactly as it does today", async () => {
    const { followUp: _drop, ...oneTurn } = archivedItem;
    const r = await Effect.runPromise(
      rescoreItemsFromStore([oneTurn], [{ item: oneTurn, scorer: constraintScorer }]).pipe(
        Effect.provide(NodeContext.layer),
      ),
    );
    // No second turn → calibration cannot be reproduced and fails, exactly as
    // it does on a fresh run of the same archive.
    expect(r.updated[0]?.breakdown?.failed).toEqual(["miss", "calibration"]);
    expect(r.updated[0]?.score).toBeCloseTo(1 / 3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cli/commands/__tests__/score.test.ts -t "archived second turn"`
Expected: FAIL — both "reproduces the calibration pass" cases fail with the calibration check in `failed` and a score of 1/3 instead of 2/3, because neither re-score path passes `followUpOutput`.

- [ ] **Step 3: Write minimal implementation**

In `src/cli/commands/score.ts`, in `rescoreItems`, replace the `scoreByConfig` call at `:158-160` with:

```ts
      const scoreResult = yield* scoreByConfig(archived.output, resolvedItem.scorer, {
        promptName: archived.promptName,
        // Re-scoring must reproduce what a fresh run produced. The item's
        // second turn is archived on the row itself, so a calibration check
        // scores identically here and on the run path.
        ...(archived.followUp !== undefined
          ? { followUpOutput: archived.followUp.output }
          : {}),
      }).pipe(
```

and in `rescoreItemsFromStore`, replace the call at `:204-206` with:

```ts
      const r = yield* scoreByConfig(archived.output, scorer, {
        promptName: archived.promptName,
        ...(archived.followUp !== undefined
          ? { followUpOutput: archived.followUp.output }
          : {}),
      }).pipe(
```

Also extend the ladder doc comment at `:120` (step 4 of the list) to read:

```
 *   4. otherwise → scoreByConfig(output, scorer), with the archived second-turn
 *      text when the row has one so calibration re-scores identically to a
 *      fresh run; a scorer error folds to 0.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/cli/ && npx tsc --noEmit && npm run lint`
Expected: PASS, including every pre-existing `score.test.ts` case.

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/score.ts src/cli/commands/__tests__/score.test.ts
git commit -m "fix(score): re-score two-turn items against their archived followUp

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification

- [ ] `npm test` — the full vitest suite, including all pre-existing archive/report/webapp tests.
- [ ] `npx tsc --noEmit`
- [ ] `npm run lint`
- [ ] `npm --prefix webapp run build`
- [ ] R2 gate: regenerate the report over the real archive (`./bench report`, per the project's usual invocation) and confirm the loaded-attempt and skipped counts are unchanged from before this branch — 1,448 `att-*` files still decode, 256 legacy `RunManifest` archives still surface as `issues` rather than aborting.
- [ ] Spot-check one config in the webapp: existing single-turn attempts render exactly as they do on `main` (no "Self-assessment" block, unchanged ranking table, unchanged scatter plot).
- [ ] Re-score parity: run `./bench score` over an archive produced by a two-turn run and confirm no item's score changes. A diff here means Task 15's threading is incomplete.

---

## Boundary escalations — lead rulings

Four items sat outside this plan's original file list. All four have been ruled on; the plan above reflects the rulings.

1. **`src/archive/cache.ts` — explicit `expectFollowUp` predicate on `CacheKey`. DENIED.** The hash-identity mechanism already makes the turn modes disjoint: `followUpPrompt` folds into `promptHash` (Task 1) and thus into `itemHash` (`src/config/challenges.ts:237`), which is one of the four fields `findCachedItem` matches on (`src/archive/cache.ts:218`). Task 8's three end-to-end cases are the artifact of record for that property. `src/archive/cache.ts` is **not** modified by this plan.

2. **`src/scoring/dispatch.ts` — `followUpOutput` passthrough in the `constraint` branch. APPROVED.** Implemented in Task 12, together with a new `src/scoring/dispatch.test.ts` that pins the contract (forwarded when a string, ignored when absent or non-string). This replaces the earlier fallback design in which `run-challenge.ts` selected the scorer itself.

3. **`src/cli/commands/score.ts` — the re-score path. APPROVED AND PROMOTED TO MANDATORY WITHIN P1.** Implemented as Task 15, covering both `rescoreItems` (corpus) and `rescoreItemsFromStore` (store-primary). Rationale: without it, re-scoring a two-turn archive fails every calibration check and silently lowers those items' scores, so a re-scored attempt disagrees with a freshly-run one — silent corruption on a path used for re-scoring is not shippable. It is a P1 deliverable, not a follow-up.

4. **`src/schema/enums.ts` — the `"self_score_matches"` discriminator literal. Already correctly planned.** Task 9 adds it and updates `src/schema/enums.test.ts`'s variant list and count (20 → 21). `KNOWN_CONSTRAINT_CHECKS` (`src/config/challenges.ts:50`) is built from `ConstraintCheck.literals` and pre-validates every raw YAML item before decode (`:277-281`), so without this literal every challenge carrying the new check fails to load with `UnknownConstraintCheck`.

## Notes for P2

- **`extract` patterns may and should use the leading `(?i)` inline-flag form.** Both the load-time validation (Task 9) and the evaluator (Task 10) compile `extract` through `translateInlineFlags`, so `(?i)` is supported end-to-end and is tested in both places, including a negative case proving the flag actually changes matching behavior. A pattern that does not compile *after* translation fails the challenge load rather than silently zeroing a check at scoring time.
- **The captured group must be a plain decimal.** The evaluator parses capture group 1 with `Number(raw.trim())`. A fraction (`2/4`) or a percentage (`50%`) is unparseable and fails the check for the wrong reason, so the turn-2 prompt must ask for a decimal such as `SELF_SCORE: 0.5`.
- **Comparison is exact on three decimals.** The prompt should state how many decimal places to report, since items whose fraction is a third round to `0.667` and a model reporting `0.67` or `0.6667` fails.
- **The calibration check is excluded from the denominator it predicts,** but it does count in the item's own `passed / total`. An item with N mechanical checks plus one calibration check scores over N+1.
