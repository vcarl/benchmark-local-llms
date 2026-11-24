# Freeform Spacemolt Sandbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace most scripted spacemolt scenarios with one freeform sandbox scenario that runs until its token budget is exhausted, then reads its score directly from the gameserver via `/api/admin/benchmark/player-stats`.

**Architecture:** Split the shared `Score` type into a `PromptScore | ScenarioScore` discriminated union along the seam that already exists at every consumer (`scoreExecution`, `aggregate.ts`, webapp record builder). Add an `api_field` game scorer that reads one numeric field from `finalPlayerStats`. Delete scripted scenarios except two retained as smoke tests. The watchdog already tracks tokens and the runner already fetches `finalPlayerStats` post-termination, so no runtime changes are needed.

**Tech Stack:** TypeScript (strict), Effect-TS (`effect`, `@effect/platform`), Vitest, Biome, YAML scenarios, React webapp (`webapp/src/`).

**Spec:** `docs/superpowers/specs/2026-05-07-freeform-spacemolt-sandbox-design.md`

---

## File Structure

**Created:**
- `prompts/scenarios/sandbox.md` — freeform directive (goal + orienting hints)
- `prompts/scenarios/sandbox.yaml` — scenario config (`scorer: api_field`, 500k token budget, tier 3)

**Modified:**
- `src/scoring/score-result.ts` — replace `Score` with `PromptScore | ScenarioScore | ScoreResult` union; update `scoreExecution` return type
- `src/scoring/game.ts` — delete 9 scorer functions and their entries; add `api_field`; change `ScorerFn` return type to `ScenarioScore`
- `src/scoring/exact-match.ts`, `src/scoring/code-exec.ts`, `src/scoring/constraint.ts` — update return type to `PromptScore` (no logic change)
- `src/report/webapp-contract.ts` — split `WebappRecord` into `PromptWebappRecord | ScenarioWebappRecord`; update `toWebappRecord`
- `src/report/aggregate.ts` — propagate the union through callers
- `webapp/src/lib/data.ts` — type-narrow on the discriminated union
- `webapp/src/lib/pipeline.ts` — pass-rate filters on prompt records only
- `webapp/src/lib/run-summary.ts` — same
- `webapp/src/components/{ScenarioView,ScenarioList,ResultRow,Scatter,RunRowItem}.tsx` — read scenario `value` (instead of `score`) where appropriate
- `src/scoring/game.test.ts` — delete tests for orphaned scorers; add `api_field` tests

**Deleted:**
- `prompts/scenarios/{bootstrap_grind,combat_pirate,craft_item,equip_ship,market_buy_sell,navigation_route,refuel_loop,scan_and_survey,storage_management}.{md,yaml}` — 9 scenarios × 2 files = 18 files

---

## Task 1: Delete scripted scenarios except smoke tests

**Files:**
- Delete: 18 files in `prompts/scenarios/` (9 `.md` + 9 `.yaml`)
- Keep: `dock_and_sell.{md,yaml}` (tier 1 smoke), `accept_complete_mission.{md,yaml}` (tier 2 smoke)

- [ ] **Step 1: Delete the nine scripted scenario file pairs**

```bash
cd /Users/vcarl/workspace/testbench/llms/.claude/worktrees/spacemolt
rm prompts/scenarios/bootstrap_grind.md prompts/scenarios/bootstrap_grind.yaml
rm prompts/scenarios/combat_pirate.md prompts/scenarios/combat_pirate.yaml
rm prompts/scenarios/craft_item.md prompts/scenarios/craft_item.yaml
rm prompts/scenarios/equip_ship.md prompts/scenarios/equip_ship.yaml
rm prompts/scenarios/market_buy_sell.md prompts/scenarios/market_buy_sell.yaml
rm prompts/scenarios/navigation_route.md prompts/scenarios/navigation_route.yaml
rm prompts/scenarios/refuel_loop.md prompts/scenarios/refuel_loop.yaml
rm prompts/scenarios/scan_and_survey.md prompts/scenarios/scan_and_survey.yaml
rm prompts/scenarios/storage_management.md prompts/scenarios/storage_management.yaml
```

- [ ] **Step 2: Verify only smoke tests remain**

Run: `ls prompts/scenarios/`
Expected output: exactly four files — `accept_complete_mission.md`, `accept_complete_mission.yaml`, `dock_and_sell.md`, `dock_and_sell.yaml`.

- [ ] **Step 3: Commit**

```bash
git add -A prompts/scenarios/
git commit -m "chore(scenarios): delete scripted scenarios except tier-1/tier-2 smoke tests"
```

---

## Task 2: Remove orphaned scorers and tests

`GAME_SCORERS` in `src/scoring/game.ts:292-307` currently has 14 entries. After deletion only three are referenced: `dock_and_sell`, `generic` (used by `accept_complete_mission`), and the new `api_field` (added in Task 5).

**Files:**
- Modify: `src/scoring/game.ts:292-307` (registry) and the per-scorer function definitions higher in the same file
- Modify: `src/scoring/game.test.ts` (remove tests for deleted scorers)

- [ ] **Step 1: Remove orphaned scorer functions and registry entries**

Delete the function definitions for these scorers in `src/scoring/game.ts`: `bootstrap_grind`, `navigation`, `trading`, `combat`, `refuel_loop`, `navigation_route`, `market_buy_sell`, `equip_ship`, `craft_item`, `combat_pirate`, `storage_management`, `scan_and_survey`. Keep `dock_and_sell` and `generic`.

Update the registry to:

```ts
export const GAME_SCORERS: Readonly<Record<string, ScorerFn>> = {
  dock_and_sell,
  generic,
};
```

(The `api_field` entry is added in Task 5.)

If any helper function (`stat`, `topStat`, `toolMetrics`, `clamp1`) becomes unused after the deletions, leave it — Tasks 3 and 5 still use them.

- [ ] **Step 2: Delete tests for orphaned scorers**

In `src/scoring/game.test.ts`, delete every `describe`/`it` block that targets a deleted scorer. Keep only blocks for `dock_and_sell` and `generic`.

- [ ] **Step 3: Run scoring tests to confirm nothing imports the deleted scorers**

Run: `pnpm vitest run src/scoring/game.test.ts`
(If the project uses `npm`/`yarn`, substitute accordingly — check `package.json` "scripts": `npm run test src/scoring/game.test.ts` or `npx vitest run src/scoring/game.test.ts`.)
Expected: tests pass; no "is not defined" errors.

- [ ] **Step 4: Run typecheck to surface any other consumers of the deleted scorers**

Run: `npm run typecheck`
Expected: PASS. If anything else imports a deleted scorer by name, that reference must be removed too.

- [ ] **Step 5: Commit**

```bash
git add src/scoring/game.ts src/scoring/game.test.ts
git commit -m "refactor(scoring): drop scorer functions for deleted scenarios"
```

---

## Task 3: Split `Score` into `PromptScore | ScenarioScore`

**Files:**
- Modify: `src/scoring/score-result.ts` (full file rewrite of types + dispatch)
- Modify: `src/scoring/exact-match.ts`, `src/scoring/code-exec.ts`, `src/scoring/constraint.ts` — return type only
- Modify: `src/scoring/game.ts` — change `ScorerFn` return type and update `dock_and_sell` + `generic` to return `ScenarioScore` shape

- [ ] **Step 1: Write the new types and dispatch in `src/scoring/score-result.ts`**

Replace the file contents with:

```ts
import type { CommandExecutor } from "@effect/platform";
import { Effect } from "effect";
import { type CodeExecFailed, type CodeExecTimeout, ScorerNotFound } from "../errors/index.js";
import type { ExecutionResult, PromptCorpusEntry, ScenarioCorpusEntry } from "../schema/index.js";
import { scoreCodeExec } from "./code-exec.js";
import { scoreConstraints } from "./constraint.js";
import { scoreExactMatch } from "./exact-match.js";
import { GAME_SCORERS } from "./game.js";

export interface PromptScore {
  readonly kind: "prompt";
  readonly score: number; // [0, 1]
  readonly details: string;
  readonly breakdown?: ConstraintBreakdown;
}

export interface ScenarioScore {
  readonly kind: "scenario";
  readonly value: number; // raw, from finalPlayerStats[scoreField]; no coercion
  readonly scoreField: string;
  readonly details: string;
}

export type ScoreResult = PromptScore | ScenarioScore;

export interface ConstraintBreakdown {
  readonly passed: ReadonlyArray<string>;
  readonly failed: ReadonlyArray<string>;
  readonly errored: ReadonlyArray<string>;
}

export type CorpusEntry = PromptCorpusEntry | ScenarioCorpusEntry;

const isPromptEntry = (e: CorpusEntry): e is PromptCorpusEntry =>
  "scorer" in e && typeof (e as PromptCorpusEntry).scorer === "object";

export const scoreExecution = (
  result: ExecutionResult,
  entry: CorpusEntry,
): Effect.Effect<
  ScoreResult,
  ScorerNotFound | CodeExecTimeout | CodeExecFailed,
  CommandExecutor.CommandExecutor
> => {
  if (isPromptEntry(entry)) {
    const cfg = entry.scorer;
    switch (cfg.type) {
      case "exact_match":
        return scoreExactMatch(result.output, cfg);
      case "constraint":
        return scoreConstraints(result.output, cfg);
      case "code_exec":
        return scoreCodeExec(result.output, cfg.testCode);
      case "game":
        return Effect.fail(new ScorerNotFound({ scorerName: cfg.gameScorer }));
    }
  }
  const fn = GAME_SCORERS[entry.scorer];
  if (fn === undefined) {
    return Effect.fail(new ScorerNotFound({ scorerName: entry.scorer }));
  }
  return Effect.sync(() => fn(result, entry.scorerParams));
};
```

The change vs. before: the single `Score` interface became two interfaces with a `kind` discriminator, and `scoreExecution` returns `ScoreResult` instead of `Score`. The header docstring mentioning "[0, 1] in all cases" is gone.

- [ ] **Step 2: Update prompt scorers to return `PromptScore`**

In each of `src/scoring/exact-match.ts`, `src/scoring/code-exec.ts`, `src/scoring/constraint.ts`, find every place that returns or constructs the old `Score` shape and:

1. Change the imported type from `Score` to `PromptScore`.
2. Change return-type annotations from `Effect<Score, ...>` to `Effect<PromptScore, ...>`.
3. Add `kind: "prompt" as const` to every returned object literal.

Concrete pattern — every existing return like:

```ts
return { score: 1, details: "exact match" };
```

becomes:

```ts
return { kind: "prompt", score: 1, details: "exact match" };
```

(The `as const` is unnecessary here because the field is typed via the return-type annotation.)

- [ ] **Step 3: Update `ScorerFn` and remaining scorers in `src/scoring/game.ts`**

Change the `ScorerFn` type (currently around line 21) from `(result, params) => Score` to `(result, params) => ScenarioScore`. Update the import: replace `import type { Score }` with `import type { ScenarioScore }` from `./score-result.js`.

Then update the `dock_and_sell` and `generic` scorer return statements to include `kind: "scenario"` and `scoreField`. For `generic` (the simpler one), find the existing return and rewrite as:

```ts
return {
  kind: "scenario",
  value: <existing numeric expression>,   // keep the existing computation
  scoreField: "<computed-or-named>",       // use a descriptive label like "credits_earned"
  details: <existing details string>,
};
```

For these legacy scorers `value` is a derived metric, not a literal API field — set `scoreField` to whatever the scorer is conceptually computing (e.g., `"composite"` for `dock_and_sell` if it weighs multiple stats, `"generic"` for `generic`). The field is descriptive metadata, not a contract.

**Important:** the legacy `dock_and_sell` and `generic` scorers compute a `[0, 1]` composite. Keep that math — they are smoke tests against existing harness behavior, not freeform scenarios. Only the type wrapper changes.

- [ ] **Step 4: Run typecheck to find remaining call sites**

Run: `npm run typecheck`
Expected: type errors at every site that still references the old `Score` shape — `aggregate.ts`, `webapp-contract.ts`, all webapp files, and tests. These are fixed in Tasks 4 and 6.

If you see errors *outside* of those files (e.g. inside `src/scoring/`), fix them now — the scoring layer should compile cleanly before moving on.

- [ ] **Step 5: Run scoring tests**

Run: `npm test -- src/scoring/`
Expected: tests pass for `exact-match`, `code-exec`, `constraint`, and `game` (the two surviving scorers). Tests that import `Score` directly will fail to compile — update them to import `PromptScore` or `ScenarioScore` as appropriate, and add `kind` to expected values.

- [ ] **Step 6: Commit**

```bash
git add src/scoring/
git commit -m "refactor(scoring): split Score into PromptScore | ScenarioScore union"
```

---

## Task 4: Split `WebappRecord` and update `toWebappRecord`

**Files:**
- Modify: `src/report/webapp-contract.ts:52-87` (interface) and `:103-145` (`toWebappRecord`)
- Modify: `src/report/aggregate.ts:164-180` (caller of `toWebappRecord` for scenario branch)

- [ ] **Step 1: Write a failing test for the new union shape**

Open `src/report/webapp-contract.test.ts`. Add a new `describe` block:

```ts
describe("toWebappRecord — discriminated by scenario vs prompt", () => {
  it("produces a ScenarioWebappRecord for scenario entries", () => {
    const result = makeExecution({ scenarioName: "sandbox", finalPlayerStats: { score: 1234 } });
    const entry = makeScenarioEntry({ name: "sandbox", scorer: "api_field" });
    const score: ScenarioScore = {
      kind: "scenario",
      value: 1234,
      scoreField: "score",
      details: "score=1234",
    };
    const rec = toWebappRecord(result, entry, score);
    expect(rec.kind).toBe("scenario");
    if (rec.kind !== "scenario") throw new Error("expected scenario record");
    expect(rec.value).toBe(1234);
    expect(rec.score_field).toBe("score");
  });

  it("produces a PromptWebappRecord for prompt entries", () => {
    const result = makeExecution({ promptName: "p1" });
    const entry = makePromptEntry({ name: "p1" });
    const score: PromptScore = { kind: "prompt", score: 1, details: "ok" };
    const rec = toWebappRecord(result, entry, score);
    expect(rec.kind).toBe("prompt");
    if (rec.kind !== "prompt") throw new Error("expected prompt record");
    expect(rec.score).toBe(1);
  });
});
```

(Helpers `makeExecution`, `makeScenarioEntry`, `makePromptEntry` are already in `__fixtures__/archive-fixtures.ts` per the existing test file — reuse them. If a helper doesn't exist, add a minimal version inline with only the fields the test needs.)

- [ ] **Step 2: Run the failing test**

Run: `npm test -- src/report/webapp-contract.test.ts`
Expected: FAIL — `kind` field doesn't exist on `WebappRecord`.

- [ ] **Step 3: Split `WebappRecord` interface**

Replace the existing `WebappRecord` (lines 52-87) with:

```ts
interface CommonWebappFields {
  readonly model: string;
  readonly runtime: string;
  readonly quant: string;
  readonly prompt_name: string;
  readonly category: string;
  readonly tier: number;
  readonly temperature: number;
  readonly tags: ReadonlyArray<string>;
  readonly score_details: string;
  readonly prompt_tokens: number;
  readonly generation_tokens: number;
  readonly prompt_tps: number;
  readonly generation_tps: number;
  readonly wall_time_sec: number;
  readonly peak_memory_gb: number;
  readonly output: string;
  readonly run_id: string;
  readonly archive_id: string;
  readonly executed_at: string;
}

export interface PromptWebappRecord extends CommonWebappFields {
  readonly kind: "prompt";
  readonly is_scenario: false;
  readonly score: number; // [0, 1]
  readonly score_breakdown: WebappScoreBreakdown | null;
  readonly prompt_text: string;
  readonly scenario_name: null;
  readonly termination_reason: null;
  readonly tool_call_count: null;
  readonly final_player_stats: null;
  readonly events: null;
}

export interface ScenarioWebappRecord extends CommonWebappFields {
  readonly kind: "scenario";
  readonly is_scenario: true;
  readonly value: number;
  readonly score_field: string;
  readonly prompt_text: "";
  readonly scenario_name: string;
  readonly termination_reason: NonNullable<ExecutionResult["terminationReason"]> | null;
  readonly tool_call_count: number | null;
  readonly final_player_stats: Record<string, unknown> | null;
  readonly events: ReadonlyArray<AgentEvent> | null;
}

export type WebappRecord = PromptWebappRecord | ScenarioWebappRecord;
```

`is_scenario` is retained for back-compat with consumers that filter by it. `kind` is the new TypeScript-narrowing discriminator.

- [ ] **Step 4: Update `toWebappRecord` to branch on entry type and produce the right arm**

Replace the function body (lines 103-145) with:

```ts
export const toWebappRecord = (
  result: ExecutionResult,
  entry: PromptCorpusEntry | ScenarioCorpusEntry,
  score: ScoreResult,
): WebappRecord => {
  const common: CommonWebappFields = {
    model: result.model,
    runtime: result.runtime,
    quant: result.quant,
    prompt_name: result.promptName,
    category: "promptText" in entry ? entry.category : "game",
    tier: entry.tier,
    temperature: result.temperature,
    tags: entry.tags ?? [],
    score_details: score.details,
    prompt_tokens: result.promptTokens,
    generation_tokens: result.generationTokens,
    prompt_tps: round2(result.promptTps),
    generation_tps: round2(result.generationTps),
    wall_time_sec: round2(result.wallTimeSec),
    peak_memory_gb: round2(result.peakMemoryGb),
    output: result.output,
    run_id: result.runId,
    archive_id: result.archiveId,
    executed_at: result.executedAt,
  };

  if (score.kind === "prompt") {
    if (!("promptText" in entry)) {
      throw new Error(`prompt score for non-prompt entry ${entry.name}`);
    }
    return {
      ...common,
      kind: "prompt",
      is_scenario: false,
      score: score.score,
      score_breakdown: score.breakdown
        ? {
            passed: score.breakdown.passed,
            failed: score.breakdown.failed,
            errored: score.breakdown.errored,
          }
        : null,
      prompt_text: entry.promptText,
      scenario_name: null,
      termination_reason: null,
      tool_call_count: null,
      final_player_stats: null,
      events: null,
    };
  }

  if ("promptText" in entry) {
    throw new Error(`scenario score for prompt entry ${entry.name}`);
  }
  return {
    ...common,
    kind: "scenario",
    is_scenario: true,
    value: score.value,
    score_field: score.scoreField,
    prompt_text: "",
    scenario_name: entry.name,
    termination_reason: result.terminationReason,
    tool_call_count: result.toolCallCount,
    final_player_stats: result.finalPlayerStats as Record<string, unknown> | null,
    events: result.events,
  };
};
```

- [ ] **Step 5: Update `aggregate.ts` callers**

In `src/report/aggregate.ts`, replace the imported `Score` type with `ScoreResult` (and `PromptScore`, `ScenarioScore` as needed). The function call to `toWebappRecord` already passes the score through; the type system will steer the rest.

If any code in `aggregate.ts` reads `.score` off a scenario score, replace it with `.value` after narrowing on `kind === "scenario"`. (Current code at line 165 dispatches on `result.scenarioName !== null`; cross-check this still lines up with the score's `kind`.)

- [ ] **Step 6: Run tests**

Run: `npm test -- src/report/`
Expected: PASS, including the new `toWebappRecord` test.

- [ ] **Step 7: Run typecheck**

Run: `npm run typecheck`
Expected: type errors only inside `webapp/src/` (handled in Task 5).

- [ ] **Step 8: Commit**

```bash
git add src/report/
git commit -m "refactor(report): split WebappRecord into prompt/scenario discriminated union"
```

---

## Task 5: Add the `api_field` scorer (TDD)

**Files:**
- Modify: `src/scoring/game.ts` — add `api_field` function and registry entry
- Modify: `src/scoring/game.test.ts` — add tests

- [ ] **Step 1: Write failing tests in `src/scoring/game.test.ts`**

Add at the end of the file:

```ts
describe("api_field scorer", () => {
  const score = GAME_SCORERS.api_field;
  if (!score) throw new Error("api_field not registered");

  it("reads the default 'score' field as a number", () => {
    const result = withFinalStats({ score: 4200, leaderboard_rank: 3 });
    const out = score(result, {});
    expect(out.kind).toBe("scenario");
    expect(out.value).toBe(4200);
    expect(out.scoreField).toBe("score");
  });

  it("respects an overridden scoreField param", () => {
    const result = withFinalStats({ score: 4200, leaderboard_rank: 3 });
    const out = score(result, { scoreField: "leaderboard_rank" });
    expect(out.value).toBe(3);
    expect(out.scoreField).toBe("leaderboard_rank");
  });

  it("returns 0 with details when the field is missing", () => {
    const result = withFinalStats({ leaderboard_rank: 3 });
    const out = score(result, { scoreField: "score" });
    expect(out.value).toBe(0);
    expect(out.details).toMatch(/score.*missing|not.*numeric/i);
  });

  it("returns 0 with details when the field is non-numeric", () => {
    const result = withFinalStats({ score: "high" });
    const out = score(result, {});
    expect(out.value).toBe(0);
    expect(out.details).toMatch(/non.*numeric|not.*number/i);
  });

  it("returns 0 with details when finalPlayerStats is null", () => {
    const result = { ...baseResult, finalPlayerStats: null };
    const out = score(result, {});
    expect(out.value).toBe(0);
    expect(out.details).toMatch(/no.*stats|missing/i);
  });
});

const withFinalStats = (stats: Record<string, unknown>): ExecutionResult => ({
  ...baseResult,
  finalPlayerStats: stats,
});
```

(`baseResult` is already defined at the top of `game.test.ts`. Reuse it.)

- [ ] **Step 2: Run the failing tests**

Run: `npm test -- src/scoring/game.test.ts`
Expected: FAIL — `GAME_SCORERS.api_field` is undefined.

- [ ] **Step 3: Implement `api_field` in `src/scoring/game.ts`**

Add this function above the `GAME_SCORERS` registry:

```ts
const api_field: ScorerFn = (r, params) => {
  const scoreField = typeof params?.scoreField === "string" ? params.scoreField : "score";
  if (r.finalPlayerStats === null) {
    return {
      kind: "scenario",
      value: 0,
      scoreField,
      details: `no finalPlayerStats; missing field "${scoreField}"`,
    };
  }
  const raw = r.finalPlayerStats[scoreField];
  if (raw === undefined || raw === null) {
    return {
      kind: "scenario",
      value: 0,
      scoreField,
      details: `field "${scoreField}" missing from finalPlayerStats`,
    };
  }
  const num = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(num)) {
    return {
      kind: "scenario",
      value: 0,
      scoreField,
      details: `field "${scoreField}" is non-numeric: ${JSON.stringify(raw)}`,
    };
  }
  return {
    kind: "scenario",
    value: num,
    scoreField,
    details: `${scoreField}=${num}`,
  };
};
```

Add it to the registry (replacing the registry from Task 2):

```ts
export const GAME_SCORERS: Readonly<Record<string, ScorerFn>> = {
  api_field,
  dock_and_sell,
  generic,
};
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- src/scoring/game.test.ts`
Expected: PASS, all five `api_field` cases.

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS for `src/`. Webapp errors still expected.

- [ ] **Step 6: Commit**

```bash
git add src/scoring/game.ts src/scoring/game.test.ts
git commit -m "feat(scoring): add api_field scorer that reads finalPlayerStats[scoreField]"
```

---

## Task 6: Update webapp consumers

The split makes scenario records carry `value` (raw numeric, no [0,1] bound) and prompt records carry `score`. Pass-rate logic must filter to prompts only. Scenario-display components read `value` and `score_field`.

The `is_scenario` boolean is preserved as a runtime filter; the `kind` field is the type-narrower for TypeScript.

**Files (all under `webapp/src/`):**
- `lib/data.ts:63` — record normalization
- `lib/pipeline.ts:68, 307, 341, 372` — pass-rate, sort, accessor
- `lib/run-summary.ts:94, 98` — pass count and sum
- `components/PromptView.tsx:34, 36` — prompt-only, no semantic change
- `components/ScenarioView.tsx:16` — display value
- `components/ScenarioList.tsx:40, 41` — display value
- `components/ResultRow.tsx:23, 54, 61` — needs to handle both
- `components/RunRowItem.tsx:31, 111, 112` — per-run summary
- `components/Scatter.tsx:180, 206, 235` — chart data

- [ ] **Step 1: Update `webapp/src/lib/data.ts`**

The record normalization at line 63 (`score: raw.score ?? 0`) currently assumes one shape. Update to preserve the union:

```ts
// at line 63 (or wherever the normalization lives)
if (raw.kind === "scenario") {
  return { ...raw, value: raw.value ?? 0, score_field: raw.score_field ?? "" };
}
return { ...raw, score: raw.score ?? 0 };
```

(Adjust to match the surrounding code style — this is the shape, not the literal diff.)

- [ ] **Step 2: Filter pass-rate logic to prompt records in `webapp/src/lib/pipeline.ts`**

Every place that calls `isPass(r.score)` must first guard `r.kind === "prompt"`. Concrete pattern:

```ts
// before:
const passed = rows.filter(r => isPass(r.score)).length;

// after:
const passed = rows.filter(r => r.kind === "prompt" && isPass(r.score)).length;
```

Apply at lines 68, 307, 341, 372. For sort/accessor sites: scenario rows should sort/accessor by `value`, prompt rows by `score`. If a single sort needs to combine them, decide one of:
- Two separate views: scenario panel sorts by `value`, prompt panel by `score`.
- Combined view: project both to a common axis (e.g., scenario rows ranked, prompts as score%); leave a TODO if ambiguous and ask the spec author.

Given the spec says scenario cells render `value` and prompts retain pass-rate, the *separate-views* interpretation is correct. Don't try to merge them in one sort.

- [ ] **Step 3: Update `webapp/src/lib/run-summary.ts`**

```ts
// line 94/98 — before:
if (isPass(r.score)) passCount += 1;
scoreSum += r.score;

// after:
if (r.kind === "prompt" && isPass(r.score)) passCount += 1;
if (r.kind === "prompt") scoreSum += r.score;
```

If `scoreSum` is used to compute a per-run mean, scope it to prompt records only — scenarios shouldn't inflate or deflate the mean since they're a different scale.

- [ ] **Step 4: Update scenario-display components**

In `components/ScenarioView.tsx:16` and `components/ScenarioList.tsx:40-41`:

```tsx
// before: rec.score.toFixed(2), scoreBand(rec.score)
// after:  rec.kind === "scenario" ? rec.value.toFixed(0) : rec.score.toFixed(2)
```

`scoreBand` is a [0,1]-aware coloring function — for scenarios, either:
- Drop the band coloring (render plain number), or
- Add a new band scheme based on rank-within-run if you want visual treatment. **Recommend dropping for now** per the spec ("just show the score obtained").

Format scenarios as integer (`toFixed(0)`) since they're raw counts (credits, kills, etc.); prompts stay at two decimals (they're percentages-of-1).

- [ ] **Step 5: Update `ResultRow.tsx`, `RunRowItem.tsx`, and `Scatter.tsx`**

These components likely render *either* a prompt or a scenario row. Use the discriminated union to branch:

```tsx
// ResultRow.tsx pattern (apply the same shape at each call site):
const numericScore = v.kind === "prompt" ? v.score : v.value;
const isPositive = numericScore > 0;
const widthPct = v.kind === "prompt" ? Math.min(100, v.score * 100) : null; // no width bar for scenarios
```

For `Scatter.tsx`, the y-axis presumably maps `score`. For mixed-kind data, scope the chart to prompts only:

```tsx
const chartData = rows.filter(r => r.kind === "prompt");
// then yScale(d.score) etc. as today
```

If the user has a scenario-specific chart, build it as a separate component reading `r.value`. Don't try to pack both shapes into one scatter.

- [ ] **Step 6: Run typecheck and dev build**

```bash
npm run typecheck
cd webapp && npm run build
```

Expected: PASS. Type errors flag any remaining `.score` access on a non-narrowed record.

- [ ] **Step 7: Manual smoke check**

```bash
cd webapp && npm run dev
```

Open the dev URL in a browser. Verify:
- Prompt rows render and pass-rate displays as before
- Scenario rows render numeric values (sandbox isn't built yet, but `dock_and_sell` and `accept_complete_mission` should still appear if archives exist)
- No console errors

If you can't run the dev server in this environment, say so explicitly in the commit message — type-checking + build is the floor.

- [ ] **Step 8: Commit**

```bash
git add webapp/
git commit -m "refactor(webapp): consume PromptWebappRecord | ScenarioWebappRecord union"
```

---

## Task 7: Add the sandbox scenario files

**Files:**
- Create: `prompts/scenarios/sandbox.md`
- Create: `prompts/scenarios/sandbox.yaml`

- [ ] **Step 1: Create the directive markdown**

Write to `prompts/scenarios/sandbox.md`:

```markdown
# Sandbox

You are an admiral. Maximize your score before your token budget runs out.

The galaxy has missions, markets that fluctuate, ore to mine, and pirates to fight. How you spend your time is up to you.
```

That's the entire file. No step list, no rubric, no examples.

- [ ] **Step 2: Create the scenario YAML**

Write to `prompts/scenarios/sandbox.yaml`:

```yaml
name: sandbox
fixture: benchmark
scenarioMd: sandbox.md
players:
  - id: admiral
    controlledBy: llm
scorer: api_field
scorerParams:
  scoreField: score
cutoffs:
  totalTokens: 500000
  toolCalls: 10000
  wallClockSec: 1800
tier: 3
tags:
  - freeform
  - sandbox
```

The `benchmark` fixture is the only fixture in current use across all scenario YAMLs (verified at extraction time). Token budget exhaustion is the expected exit; the other cutoffs are runaway-loop backstops.

- [ ] **Step 3: Verify the corpus loader picks it up**

Run a typecheck-then-test pass:

```bash
npm run typecheck && npm test -- src/config/
```

Expected: PASS. The corpus loader globs `prompts/scenarios/*.yaml`; no registration code change is needed.

- [ ] **Step 4: Verify the scorer name resolves**

Add a quick sanity test in `src/config/scenario-corpus.test.ts` (or wherever corpus loading is tested) that loads `sandbox.yaml` and asserts `entry.scorer === "api_field"`. If a similar "loads a known scenario" test already exists, just add an assertion line.

- [ ] **Step 5: Commit**

```bash
git add prompts/scenarios/sandbox.md prompts/scenarios/sandbox.yaml src/config/scenario-corpus.test.ts
git commit -m "feat(scenarios): add freeform sandbox scenario at tier 3"
```

---

## Task 8: End-to-end verification

- [ ] **Step 1: Full lint, typecheck, test**

```bash
npm run lint && npm run typecheck && npm test
```

Expected: all PASS.

- [ ] **Step 2: Smoke-run the kept scripted scenarios**

Use the CLI to dry-run `dock_and_sell` and `accept_complete_mission` against the gameserver fixture. The exact command depends on the harness CLI surface — typical pattern is `npx tsx src/cli/run-scenario.ts --name dock_and_sell --model <fast-model>`. Check `scripts/` and `src/cli/` for the entry point and pick a cheap local model (one of the smaller mlx or llamacpp targets in `models.yaml`) so you don't burn API credits validating a refactor.

Expected: both produce a `ScenarioWebappRecord` with a numeric `value` and the report aggregates without errors.

- [ ] **Step 3: Smoke-run the sandbox**

Same harness command but with `--name sandbox`. Expected: agent runs until either it stops on its own or the watchdog trips on `cutoffs.totalTokens`. Final record has `score_field: "score"` and `value` matching `result.finalPlayerStats.score`.

If the gameserver returns no `score` field for the chosen fixture, the sandbox record will have `value: 0` with a "missing" details string. That's a deployment / fixture issue, not a code issue — flag it to the user; do not paper over it in code.

- [ ] **Step 4: Final commit if anything was tweaked**

If smoke-run revealed small adjustments (e.g. cutoff numbers), commit them as a follow-up rather than amending earlier commits.

```bash
git status
# only commit if there are real changes
```

---

## Self-review checklist

After implementing all tasks, verify:

1. `prompts/scenarios/` contains exactly 6 files: `sandbox.{md,yaml}`, `dock_and_sell.{md,yaml}`, `accept_complete_mission.{md,yaml}`.
2. `GAME_SCORERS` has exactly 3 entries: `api_field`, `dock_and_sell`, `generic`.
3. No `.score` access exists on a non-narrowed `WebappRecord` (typecheck enforces this).
4. Pass-rate aggregations exclude scenario rows (`r.kind === "prompt"` guard).
5. `scoreExecution` returns `ScoreResult`, not `Score`. `Score` symbol no longer exists.
6. The `is_scenario` boolean still works as a runtime filter (back-compat).
7. The sandbox scenario loads, runs, terminates on token budget, and reports `value` from `finalPlayerStats.score`.

---

## Risks and notes for the implementer

- **Old archives.** Per the spec, no compat shim is provided. Archives written before this change carry `score: number ∈ [0,1]` on scenario rows; they will fail to parse under the new union. Regenerate by re-running. This is consistent with the project's recent legacy-cleanup posture.
- **Webapp dev environment.** If the webapp dev server can't be started in your environment, the typecheck + production build is the verification floor — call this out explicitly in the Task 6 commit message. Do not claim "verified in browser" if you didn't open one.
- **Fixture surface.** The `benchmark` fixture is the only one in current use. If it doesn't expose the full mining/market/missions/combat surface the freeform directive promises, the sandbox will be uninteresting (models hit dead ends and the score is uniformly low). Flag this back to the user — it's a fixture-design question, not an implementation question.
