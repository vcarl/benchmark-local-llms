# Data Visualization Revival Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revive a scatter chart above the home route and replace `ResultRow`/`ResultTable` with a richer listview featuring per-variant bars, tokens/point efficiency, and hover-expanded capability profile.

**Architecture:** The scatter is a new SVG component fed by a new pure aggregator (`aggregateForScatter`). The listview row is a rewrite of `ResultRow` using `aggregateForList`. A tiny `hover-store` (plain `useSyncExternalStore`, no new deps) powers cross-highlight between chart and list when `groupBy=model`. An `executed_at` ISO timestamp is plumbed through the data contract so scatter trajectories can order chronologically.

**Tech Stack:** React 19, TanStack Router, TypeScript, plain SVG (no D3), Vitest (node env), Effect Schema (source side only).

**Palette note:** `webapp/public/styles.css` is dark-themed with hardcoded hex values (no CSS variables). All new CSS in this plan uses the existing palette: backgrounds `#0a0a0a` / `#111` / `#151515` / `#1a1a1a`, borders `#222` / `#333`, text `#ddd` / `#888` / `#666`, accent `#6bf`. Do not introduce `var(--)` declarations.

**Old class replacement:** The existing `.result-row`, `.result-header`, `.result-score`, `.result-label`, `.result-pass`, `.result-arrow`, `.top-models`, `.top-model` rules at lines ~85–106 of `styles.css` are from the old `ResultRow`. The new ResultRow (Task 8) uses mostly new class names and overrides grid layout via later cascade. Leave the old rules in place for now — a cleanup task removes them at the end.

---

## Task 1: Add `executed_at` to data contract

**Why first:** The scatter's trajectory line requires a chronological order. `ExecutionResult.executedAt` already exists upstream; we just need to plumb it through `toWebappRecord`, `WebappRecord`, `BenchmarkResult`, and `normalizeRecord`.

**Files:**
- Modify: `src/report/webapp-contract.ts`
- Modify: `webapp/src/lib/data.ts`
- Test: `src/report/webapp-contract.test.ts` (existing)
- Test: `webapp/src/lib/data.test.ts` (existing)

- [ ] **Step 1: Write failing test in `webapp/src/lib/data.test.ts`**

Add this test case at the end of the existing `normalizeRecord` describe block:

```typescript
it("preserves executed_at when present", () => {
  const r = normalizeRecord({ executed_at: "2026-04-01T12:00:00Z" } as Partial<BenchmarkResult>);
  expect(r.executed_at).toBe("2026-04-01T12:00:00Z");
});

it("defaults executed_at to empty string when missing", () => {
  const r = normalizeRecord({});
  expect(r.executed_at).toBe("");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run webapp/src/lib/data.test.ts`
Expected: FAIL — `executed_at` not in interface / not set by normalizer.

- [ ] **Step 3: Add `executed_at` to `BenchmarkResult` interface and normalizer**

In `webapp/src/lib/data.ts`, add the field to the interface (alphabetical-ish, next to `events` / timestamps):

```typescript
export interface BenchmarkResult {
  model: string;
  runtime: string;
  quant: string;
  prompt_name: string;
  category: string;
  tier: number;
  temperature: number;
  tags: string[];
  is_scenario: boolean;
  score: number;
  score_details: string;
  prompt_tokens: number;
  generation_tokens: number;
  prompt_tps: number;
  generation_tps: number;
  wall_time_sec: number;
  peak_memory_gb: number;
  output: string;
  prompt_text: string;
  scenario_name: string | null;
  termination_reason:
    | "completed" | "wall_clock" | "tokens" | "tool_calls" | "error" | null;
  tool_call_count: number | null;
  final_player_stats: Record<string, unknown> | null;
  events: AgentEvent[] | null;
  executed_at: string;
}
```

And in `normalizeRecord`, add a line (place it right before the closing `});`):

```typescript
  executed_at: raw.executed_at ?? "",
```

- [ ] **Step 4: Run the webapp data test**

Run: `npx vitest run webapp/src/lib/data.test.ts`
Expected: PASS.

- [ ] **Step 5: Write failing test in `src/report/webapp-contract.test.ts`**

Read the existing test file to pick up the helper signature, then add a test that `toWebappRecord` includes `executed_at` from `ExecutionResult.executedAt`. The existing fixtures already set `executedAt: "2026-04-14T12:34:56.000Z"` — assert the webapp record's `executed_at` equals that string.

```typescript
it("copies executedAt to executed_at", () => {
  const record = toWebappRecord(fixtureResult(), fixturePromptEntry(), fixtureScore());
  expect(record.executed_at).toBe("2026-04-14T12:34:56.000Z");
});
```

Use whatever fixture helpers the test file already has — the existing tests in this file will show you the pattern.

- [ ] **Step 6: Run tests to verify new test fails**

Run: `npx vitest run src/report/webapp-contract.test.ts`
Expected: FAIL — `executed_at` missing on `WebappRecord`.

- [ ] **Step 7: Update `WebappRecord` + `toWebappRecord`**

In `src/report/webapp-contract.ts`, add the field to the interface (with other string fields):

```typescript
  readonly executed_at: string;
```

In `toWebappRecord`, add a line inside the returned object literal:

```typescript
    executed_at: result.executedAt,
```

- [ ] **Step 8: Run both test files**

Run: `npx vitest run src/report/webapp-contract.test.ts webapp/src/lib/data.test.ts`
Expected: PASS.

- [ ] **Step 9: Run full test suite to catch contract regressions**

Run: `npm test`
Expected: PASS (526+ tests). If `webapp-contract.test.ts` has a round-trip / snapshot test, update the expectation alongside.

- [ ] **Step 10: Commit**

```bash
git add src/report/webapp-contract.ts src/report/webapp-contract.test.ts webapp/src/lib/data.ts webapp/src/lib/data.test.ts
git commit -m "feat(data): add executed_at ISO timestamp to webapp record"
```

---

## Task 2: `hover-store` for cross-highlight

**Files:**
- Create: `webapp/src/lib/hover-store.ts`
- Test: `webapp/src/lib/hover-store.test.ts`

- [ ] **Step 1: Write failing test**

Create `webapp/src/lib/hover-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { getHoveredModel, setHoveredModel, clearHoveredModel, subscribeHover } from "./hover-store";

describe("hover-store", () => {
  beforeEach(() => clearHoveredModel());

  it("starts empty", () => {
    expect(getHoveredModel()).toBeNull();
  });

  it("set/get round-trip", () => {
    setHoveredModel("qwen-2.5-7b");
    expect(getHoveredModel()).toBe("qwen-2.5-7b");
  });

  it("clear resets to null", () => {
    setHoveredModel("qwen-2.5-7b");
    clearHoveredModel();
    expect(getHoveredModel()).toBeNull();
  });

  it("subscribe notifies on change", () => {
    let calls = 0;
    const unsub = subscribeHover(() => { calls += 1; });
    setHoveredModel("llama-3.1-8b");
    setHoveredModel("qwen-2.5-7b");
    clearHoveredModel();
    expect(calls).toBe(3);
    unsub();
  });

  it("setting the same value does not notify twice", () => {
    let calls = 0;
    const unsub = subscribeHover(() => { calls += 1; });
    setHoveredModel("llama-3.1-8b");
    setHoveredModel("llama-3.1-8b");
    expect(calls).toBe(1);
    unsub();
  });

  it("unsubscribe stops notifications", () => {
    let calls = 0;
    const unsub = subscribeHover(() => { calls += 1; });
    unsub();
    setHoveredModel("llama-3.1-8b");
    expect(calls).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run webapp/src/lib/hover-store.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the store**

Create `webapp/src/lib/hover-store.ts`:

```typescript
type Listener = () => void;

let hovered: string | null = null;
const listeners = new Set<Listener>();

export const getHoveredModel = (): string | null => hovered;

export const setHoveredModel = (model: string): void => {
  if (hovered === model) return;
  hovered = model;
  for (const l of listeners) l();
};

export const clearHoveredModel = (): void => {
  if (hovered === null) return;
  hovered = null;
  for (const l of listeners) l();
};

export const subscribeHover = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// React hook helper (exported for component use)
import { useSyncExternalStore } from "react";
export const useHoveredModel = (): string | null =>
  useSyncExternalStore(subscribeHover, getHoveredModel, getHoveredModel);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run webapp/src/lib/hover-store.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/lib/hover-store.ts webapp/src/lib/hover-store.test.ts
git commit -m "feat(webapp): add hover-store for chart/list cross-highlight"
```

---

## Task 3: `aggregateForScatter` — produce scatter dots

**Files:**
- Modify: `webapp/src/lib/pipeline.ts`
- Test: `webapp/src/lib/pipeline.test.ts` (existing)

- [ ] **Step 1: Write failing tests**

Append to `webapp/src/lib/pipeline.test.ts` (use the existing test fixture helpers where present):

```typescript
import { aggregateForScatter, starPointsForTokens } from "./pipeline";

describe("starPointsForTokens", () => {
  it("returns 6 at 500 tokens", () => {
    expect(starPointsForTokens(500)).toBe(6);
  });
  it("returns 6 below 500 tokens (clamped)", () => {
    expect(starPointsForTokens(100)).toBe(6);
  });
  it("returns 8 at 1000 tokens", () => {
    expect(starPointsForTokens(1000)).toBe(8);
  });
  it("returns 10 at 2000 tokens", () => {
    expect(starPointsForTokens(2000)).toBe(10);
  });
  it("returns 13 at 4000 tokens", () => {
    expect(starPointsForTokens(4000)).toBe(13);
  });
  it("returns 15 at 8000 tokens", () => {
    expect(starPointsForTokens(8000)).toBe(15);
  });
  it("returns 18 at 16000 tokens", () => {
    expect(starPointsForTokens(16000)).toBe(18);
  });
  it("clamps to 18 at very high token counts", () => {
    expect(starPointsForTokens(200000)).toBe(18);
  });
});

describe("aggregateForScatter", () => {
  const baseRec = (over: Partial<BenchmarkResult>): BenchmarkResult => ({
    model: "llama-3.1-8b", runtime: "llamacpp", quant: "q8",
    prompt_name: "p1", category: "c", tier: 1, temperature: 0,
    tags: [], is_scenario: false, score: 0.7, score_details: "",
    prompt_tokens: 100, generation_tokens: 400, prompt_tps: 0, generation_tps: 0,
    wall_time_sec: 0, peak_memory_gb: 8.5, output: "", prompt_text: "",
    scenario_name: null, termination_reason: null, tool_call_count: null,
    final_player_stats: null, events: null,
    executed_at: "2026-04-01T00:00:00Z", ...over,
  });

  it("one dot per (model, runtime, quant, temperature) combo", () => {
    const data = [
      baseRec({ score: 0.7 }),
      baseRec({ score: 0.8 }), // same variant → same dot
      baseRec({ runtime: "mlx", score: 0.6 }),
      baseRec({ quant: "q4", score: 0.5 }),
      baseRec({ temperature: 0.7, score: 0.65 }),
    ];
    const dots = aggregateForScatter(data);
    expect(dots).toHaveLength(4);
  });

  it("averages score and tokens within a variant", () => {
    const data = [
      baseRec({ score: 0.6, prompt_tokens: 100, generation_tokens: 400 }), // 500 total
      baseRec({ score: 0.8, prompt_tokens: 100, generation_tokens: 600 }), // 700 total
    ];
    const [dot] = aggregateForScatter(data);
    expect(dot.score).toBeCloseTo(70); // (60+80)/2 as percentage
    expect(dot.tokens).toBe(600); // (500+700)/2
  });

  it("uses max peak_memory_gb across runs in the variant", () => {
    const data = [
      baseRec({ peak_memory_gb: 4.0 }),
      baseRec({ peak_memory_gb: 8.5 }),
    ];
    const [dot] = aggregateForScatter(data);
    expect(dot.mem).toBe(8.5);
  });

  it("falls back to sibling-variant memory when a variant lacks it", () => {
    const data = [
      baseRec({ runtime: "llamacpp", peak_memory_gb: 8.5 }),
      baseRec({ runtime: "mlx", peak_memory_gb: 0 }), // missing
    ];
    const dots = aggregateForScatter(data);
    const mlxDot = dots.find((d) => d.runtime === "mlx");
    expect(mlxDot?.mem).toBe(8.5);
  });

  it("omits a dot when no variant has memory data for the base model", () => {
    const data = [
      baseRec({ runtime: "llamacpp", peak_memory_gb: 0 }),
      baseRec({ runtime: "mlx", peak_memory_gb: 0 }),
    ];
    const dots = aggregateForScatter(data);
    expect(dots).toHaveLength(0);
  });

  it("uses earliest executed_at when variant has multiple runs", () => {
    const data = [
      baseRec({ executed_at: "2026-04-05T00:00:00Z" }),
      baseRec({ executed_at: "2026-04-01T00:00:00Z" }),
    ];
    const [dot] = aggregateForScatter(data);
    expect(dot.executedAt).toBe("2026-04-01T00:00:00Z");
  });
});
```

Also add this at the top of the file if not already present:

```typescript
import type { BenchmarkResult } from "./data";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run webapp/src/lib/pipeline.test.ts`
Expected: FAIL — `aggregateForScatter` and `starPointsForTokens` not defined.

- [ ] **Step 3: Implement `starPointsForTokens` and `aggregateForScatter`**

Append to `webapp/src/lib/pipeline.ts`:

```typescript
export interface ScatterDot {
  baseModel: string;   // same as record.model
  family: string;
  runtime: string;
  quant: string;
  temperature: number;
  executedAt: string;  // earliest run's timestamp for this variant
  score: number;       // 0..100 pass percentage (mean * 100)
  tokens: number;      // mean (prompt+generation) per run
  mem: number;         // max peak_memory_gb, with fallback to sibling variants
}

export const starPointsForTokens = (tokens: number): number => {
  const t = Math.max(tokens, 500);
  const n = 6 + Math.floor(Math.log2(t / 500) * 2.4);
  return Math.max(6, Math.min(18, n));
};

export const aggregateForScatter = (data: BenchmarkResult[]): ScatterDot[] => {
  // Group by (model, runtime, quant, temperature)
  const key = (r: BenchmarkResult) => `${r.model}|${r.runtime}|${r.quant}|${r.temperature}`;
  const groups = new Map<string, BenchmarkResult[]>();
  for (const r of data) {
    const k = key(r);
    const arr = groups.get(k);
    if (arr) arr.push(r);
    else groups.set(k, [r]);
  }

  // Compute per-base-model memory fallback (max of any variant that has data)
  const memByBaseModel = new Map<string, number>();
  for (const r of data) {
    const existing = memByBaseModel.get(r.model) ?? 0;
    if (r.peak_memory_gb > existing) memByBaseModel.set(r.model, r.peak_memory_gb);
  }

  const dots: ScatterDot[] = [];
  for (const [, runs] of groups) {
    const first = runs[0];
    if (first === undefined) continue;
    const n = runs.length;
    const meanScore = runs.reduce((s, r) => s + r.score, 0) / n;
    const meanTokens = runs.reduce((s, r) => s + (r.prompt_tokens + r.generation_tokens), 0) / n;
    const variantMem = runs.reduce((m, r) => Math.max(m, r.peak_memory_gb), 0);
    const mem = variantMem > 0 ? variantMem : (memByBaseModel.get(first.model) ?? 0);
    if (mem <= 0) continue; // cannot size a dot without memory info
    const executedAt = runs.reduce(
      (min, r) => (r.executed_at !== "" && (min === "" || r.executed_at < min) ? r.executed_at : min),
      "",
    );
    dots.push({
      baseModel: first.model,
      family: modelFamily(first.model),
      runtime: first.runtime,
      quant: first.quant,
      temperature: first.temperature,
      executedAt,
      score: meanScore * 100,
      tokens: meanTokens,
      mem,
    });
  }
  return dots;
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run webapp/src/lib/pipeline.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/lib/pipeline.ts webapp/src/lib/pipeline.test.ts
git commit -m "feat(webapp): add aggregateForScatter + starPointsForTokens"
```

---

## Task 4: `aggregateForList` — per-variant breakdown for listview

**Files:**
- Modify: `webapp/src/lib/pipeline.ts`
- Test: `webapp/src/lib/pipeline.test.ts` (existing)

- [ ] **Step 1: Write failing tests**

Append to `webapp/src/lib/pipeline.test.ts`:

```typescript
import { aggregateForList, type ListRow } from "./pipeline";
import { CAPABILITY_TAGS } from "./constants";

describe("aggregateForList", () => {
  const mkRec = (over: Partial<BenchmarkResult>): BenchmarkResult => ({
    model: "llama-3.1-8b", runtime: "llamacpp", quant: "q8",
    prompt_name: "p", category: "c", tier: 1, temperature: 0,
    tags: [], is_scenario: false, score: 0.7, score_details: "",
    prompt_tokens: 200, generation_tokens: 600, prompt_tps: 0, generation_tps: 0,
    wall_time_sec: 0, peak_memory_gb: 8.5, output: "", prompt_text: "",
    scenario_name: null, termination_reason: null, tool_call_count: null,
    final_player_stats: null, events: null,
    executed_at: "2026-04-01T00:00:00Z", ...over,
  });

  it("bestScore is max across variants", () => {
    const rows = aggregateForList([
      mkRec({ runtime: "llamacpp", score: 0.68 }),
      mkRec({ runtime: "mlx", score: 0.65 }),
    ], "model");
    expect(rows[0].bestScore).toBe(68);
  });

  it("efficiency = round(tokens / score%) for the best variant", () => {
    const rows = aggregateForList([
      mkRec({ score: 0.8, prompt_tokens: 200, generation_tokens: 2600 }), // 2800 total
    ], "model");
    // 2800 / 80 = 35
    expect(rows[0].efficiency).toBe(35);
  });

  it("variants sorted best-first", () => {
    const rows = aggregateForList([
      mkRec({ runtime: "llamacpp", quant: "q4", score: 0.63 }),
      mkRec({ runtime: "llamacpp", quant: "q8", score: 0.68 }),
      mkRec({ runtime: "mlx", quant: "q4", score: 0.65 }),
    ], "model");
    const scores = rows[0].variants.map((v) => v.score);
    expect(scores).toEqual([68, 65, 63]);
  });

  it("capability profile has 10 entries (one per CAPABILITY_TAG)", () => {
    const rows = aggregateForList([mkRec({ tags: ["tool-use"] })], "model");
    expect(rows[0].capability).toHaveLength(CAPABILITY_TAGS.length);
  });

  it("capability entries with zero runs have pass=null", () => {
    const rows = aggregateForList([
      mkRec({ tags: ["tool-use"], score: 0.9 }),
    ], "model");
    const toolUse = rows[0].capability.find((c) => c.tag === "tool-use");
    expect(toolUse?.pass).toBeCloseTo(0.9);
    expect(toolUse?.runs).toBe(1);
    const factualRecall = rows[0].capability.find((c) => c.tag === "factual-recall");
    expect(factualRecall?.pass).toBeNull();
    expect(factualRecall?.runs).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run webapp/src/lib/pipeline.test.ts`
Expected: FAIL — `aggregateForList` not defined.

- [ ] **Step 3: Implement `aggregateForList`**

Append to `webapp/src/lib/pipeline.ts`:

```typescript
import { CAPABILITY_TAGS, PASS_THRESHOLD } from "./constants";

export interface ListVariant {
  runtime: string;
  quant: string;
  temperature: number;
  score: number;   // 0..100 percentage (mean passRate * 100)
  tokens: number;  // mean total tokens per run
}

export interface ListCapability {
  tag: string;
  pass: number | null; // 0..1, null when no runs
  runs: number;
}

export interface ListRow {
  key: string;           // record.model for groupBy=model; otherwise the group key
  baseModel: string | null; // set only when groupBy=model (used by hover-store)
  family: string | null; // populated for model-ish groupings
  bestScore: number;     // 0..100
  bestVariant: { runtime: string; quant: string; temperature: number; tokens: number };
  efficiency: number;    // tokens / score%, lower is better
  variants: ListVariant[];
  capability: ListCapability[];
  mem: number;           // max peak_memory_gb across all rows in the group
  avgTokens: number;     // mean (prompt+generation) across all rows
}

const tokensOf = (r: BenchmarkResult) => r.prompt_tokens + r.generation_tokens;

const computeCapability = (runs: BenchmarkResult[]): ListCapability[] => {
  return CAPABILITY_TAGS.map((tag) => {
    const tagRuns = runs.filter((r) => r.tags.includes(tag));
    if (tagRuns.length === 0) return { tag, pass: null, runs: 0 };
    const pass = tagRuns.filter((r) => r.score >= PASS_THRESHOLD).length / tagRuns.length;
    return { tag, pass, runs: tagRuns.length };
  });
};

const computeVariants = (runs: BenchmarkResult[]): ListVariant[] => {
  // Bucket per (runtime, quant, temperature)
  const key = (r: BenchmarkResult) => `${r.runtime}|${r.quant}|${r.temperature}`;
  const buckets = new Map<string, BenchmarkResult[]>();
  for (const r of runs) {
    const k = key(r);
    const arr = buckets.get(k);
    if (arr) arr.push(r);
    else buckets.set(k, [r]);
  }
  const variants: ListVariant[] = [];
  for (const [, vRuns] of buckets) {
    const first = vRuns[0];
    if (first === undefined) continue;
    const n = vRuns.length;
    const mean = vRuns.reduce((s, r) => s + r.score, 0) / n;
    const tokens = vRuns.reduce((s, r) => s + tokensOf(r), 0) / n;
    variants.push({
      runtime: first.runtime,
      quant: first.quant,
      temperature: first.temperature,
      score: mean * 100,
      tokens,
    });
  }
  variants.sort((a, b) => b.score - a.score);
  return variants;
};

export const aggregateForList = (data: BenchmarkResult[], groupBy: GroupBy): ListRow[] => {
  const groups = groupRows(data, groupBy);
  const rows: ListRow[] = [];
  for (const [key, runs] of groups) {
    if (runs.length === 0) continue;
    const variants = computeVariants(runs);
    const best = variants[0];
    if (best === undefined) continue;
    const bestScore = best.score;
    const efficiency = bestScore > 0 ? Math.round(best.tokens / bestScore) : 0;
    const capability = computeCapability(runs);
    const mem = runs.reduce((m, r) => Math.max(m, r.peak_memory_gb), 0);
    const avgTokens = runs.reduce((s, r) => s + tokensOf(r), 0) / runs.length;

    const isModelGroup = groupBy === "model" || groupBy === "modelOnly";
    const firstRun = runs[0];
    const family = firstRun && (isModelGroup || groupBy === "family" || groupBy === "runtime")
      ? modelFamily(firstRun.model)
      : null;

    rows.push({
      key,
      baseModel: isModelGroup && firstRun ? firstRun.model : null,
      family,
      bestScore,
      bestVariant: { runtime: best.runtime, quant: best.quant, temperature: best.temperature, tokens: best.tokens },
      efficiency,
      variants,
      capability,
      mem,
      avgTokens,
    });
  }
  return rows;
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run webapp/src/lib/pipeline.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/lib/pipeline.ts webapp/src/lib/pipeline.test.ts
git commit -m "feat(webapp): add aggregateForList with per-variant breakdown"
```

---

## Task 5: `CapabilityHoverCard` component

**Files:**
- Create: `webapp/src/components/CapabilityHoverCard.tsx`
- Modify: `webapp/public/styles.css` (append styles)

- [ ] **Step 1: Create the component**

Create `webapp/src/components/CapabilityHoverCard.tsx`:

```typescript
import type { ListCapability } from "../lib/pipeline";
import { scoreBand } from "../lib/constants";

interface Props {
  title: string;
  capability: ListCapability[];
}

export function CapabilityHoverCard({ title, capability }: Props) {
  return (
    <div className="cap-hover-card" role="tooltip">
      <div className="cap-hover-title">{title} · capability profile</div>
      <table className="cap-hover-table">
        <tbody>
          {capability.map((c) => (
            <tr key={c.tag}>
              <td className="ct-tag">{c.tag}</td>
              <td className="ct-bar">
                <div className="ct-bar-track">
                  {c.pass !== null && (
                    <div
                      className={`ct-bar-fill cap-${scoreBand(c.pass)}`}
                      style={{ width: `${c.pass * 100}%` }}
                    />
                  )}
                </div>
              </td>
              <td className="ct-val">
                {c.pass === null ? "—" : `${Math.round(c.pass * 100)}%`}
              </td>
              <td className="ct-runs">
                {c.runs === 0 ? "no data" : `${c.runs} runs`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Append the CSS to `webapp/public/styles.css`**

Append (do not replace) these rules to `webapp/public/styles.css`:

```css
/* Capability hover card — rich per-tag breakdown */
.cap-hover-card {
  position: absolute;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 12px 14px;
  font-size: 12px;
  color: #ddd;
  pointer-events: none;
  z-index: 40;
  line-height: 1.5;
  min-width: 240px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}
.cap-hover-title { font-weight: 600; margin-bottom: 8px; font-size: 13px; }
.cap-hover-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.cap-hover-table td { padding: 3px 0; color: #aaa; }
.cap-hover-table td.ct-tag { color: #ddd; }
.cap-hover-table td.ct-bar { width: 80px; padding-left: 8px; }
.cap-hover-table td.ct-val { text-align: right; font-variant-numeric: tabular-nums; color: #ddd; width: 40px; }
.cap-hover-table td.ct-runs { color: #888; text-align: right; width: 56px; padding-left: 8px; }
.ct-bar-track { height: 6px; background: #333; border-radius: 3px; overflow: hidden; }
.ct-bar-fill { height: 100%; border-radius: 3px; }
```

- [ ] **Step 3: Verify build**

Run: `npm run -C webapp build 2>&1 | tail -20`
Expected: no TypeScript errors. If `ListCapability` isn't re-exported, ensure the import in the component resolves.

- [ ] **Step 4: Commit**

```bash
git add webapp/src/components/CapabilityHoverCard.tsx webapp/public/styles.css
git commit -m "feat(webapp): add CapabilityHoverCard with per-tag pass+runs"
```

---

## Task 6: `ScatterLegend` component

**Files:**
- Create: `webapp/src/components/ScatterLegend.tsx`
- Modify: `webapp/public/styles.css` (append)

- [ ] **Step 1: Create the legend component**

Create `webapp/src/components/ScatterLegend.tsx`:

```typescript
import { starPointsForTokens } from "../lib/pipeline";

interface Props {
  families: Array<{ name: string; color: string }>;
}

const starPath = (cx: number, cy: number, n: number, outerR: number, innerR: number): string => {
  let d = "";
  for (let i = 0; i < 2 * n; i += 1) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (Math.PI / n) * i - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    d += (i === 0 ? "M" : "L") + x.toFixed(2) + "," + y.toFixed(2);
  }
  return `${d}Z`;
};

const TOKEN_REFS: Array<{ tokens: number; label: string }> = [
  { tokens: 500, label: "500" },
  { tokens: 1000, label: "1k" },
  { tokens: 2000, label: "2k" },
  { tokens: 4000, label: "4k" },
  { tokens: 8000, label: "8k" },
  { tokens: 16000, label: "16k+" },
];

export function ScatterLegend({ families }: Props) {
  return (
    <div className="scatter-legend">
      <div className="scatter-legend-row">
        <span className="scatter-legend-group">family:</span>
        {families.map((f) => (
          <span key={f.name} className="scatter-legend-family">
            <span className="scatter-legend-swatch" style={{ background: f.color }} />
            {f.name}
          </span>
        ))}
      </div>
      <div className="scatter-legend-row">
        <span className="scatter-legend-group">memory (area):</span>
        <svg width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="4" fill="currentColor" /></svg>
        <span>1 GB</span>
        <svg width="24" height="24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="currentColor" /></svg>
        <span>5 GB</span>
        <svg width="32" height="32" aria-hidden="true"><circle cx="16" cy="16" r="13" fill="currentColor" /></svg>
        <span>15 GB</span>
      </div>
      <div className="scatter-legend-row">
        <span className="scatter-legend-group">tokens (bumps):</span>
        {TOKEN_REFS.map(({ tokens, label }) => {
          const n = starPointsForTokens(tokens);
          return (
            <span key={tokens} className="scatter-legend-star">
              <svg width="22" height="22" aria-hidden="true">
                <path d={starPath(11, 11, n, 10, 10 * 0.75)} fill="currentColor" />
              </svg>
              <span>{label}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Append CSS to `webapp/public/styles.css`**

```css
/* Scatter legend */
.scatter-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin-top: 12px;
  font-size: 12px;
  color: #888;
  align-items: center;
}
.scatter-legend-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.scatter-legend-group { color: #666; }
.scatter-legend-family { display: flex; align-items: center; gap: 6px; color: #ddd; }
.scatter-legend-swatch { width: 12px; height: 12px; border-radius: 50%; border: 1px solid #333; }
.scatter-legend-star { display: inline-flex; align-items: center; gap: 4px; color: #888; }
```

- [ ] **Step 3: Commit**

```bash
git add webapp/src/components/ScatterLegend.tsx webapp/public/styles.css
git commit -m "feat(webapp): add ScatterLegend"
```

---

## Task 7: `Scatter` component (SVG chart)

**Files:**
- Create: `webapp/src/components/Scatter.tsx`
- Modify: `webapp/public/styles.css` (append)

- [ ] **Step 1: Create the scatter component**

Create `webapp/src/components/Scatter.tsx`:

```typescript
import { useMemo, useState, useRef } from "react";
import type { BenchmarkResult } from "../lib/data";
import { aggregateForScatter, starPointsForTokens, type ScatterDot } from "../lib/pipeline";
import { ScatterLegend } from "./ScatterLegend";
import { setHoveredModel, clearHoveredModel, useHoveredModel } from "../lib/hover-store";

interface Props {
  data: BenchmarkResult[];
}

const FAMILY_COLORS: Record<string, string> = {
  Llama: "#e06666",
  Qwen: "#6fa8dc",
  Mistral: "#93c47d",
  Gemma: "#b996de",
  DeepSeek: "#f6b26b",
  Phi: "#76d7c4",
  GPT: "#ffd966",
  GLM: "#c27ba0",
  Other: "#9aa0a6",
};

const colorFor = (family: string): string => FAMILY_COLORS[family] ?? FAMILY_COLORS.Other;

const W = 860;
const H = 460;
const M = { top: 20, right: 24, bottom: 50, left: 60 };
const IW = W - M.left - M.right;
const IH = H - M.top - M.bottom;

const X_MIN = 500;
const X_MAX = 32000;

const xScale = (v: number): number => {
  const clamped = Math.max(v, X_MIN);
  return M.left + ((Math.log10(clamped) - Math.log10(X_MIN)) / (Math.log10(X_MAX) - Math.log10(X_MIN))) * IW;
};
const yScale = (v: number): number => M.top + (1 - v / 100) * IH;
const rScale = (mem: number): number => 6 + Math.sqrt(Math.max(mem, 0)) * 2.4;

const starPath = (cx: number, cy: number, n: number, outerR: number, innerR: number): string => {
  let d = "";
  for (let i = 0; i < 2 * n; i += 1) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (Math.PI / n) * i - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    d += (i === 0 ? "M" : "L") + x.toFixed(2) + "," + y.toFixed(2);
  }
  return `${d}Z`;
};

const xTicks = [500, 1000, 2000, 5000, 10000, 20000];
const yTicks = [0, 20, 40, 60, 80, 100];

export function Scatter({ data }: Props) {
  const dots = useMemo(() => aggregateForScatter(data), [data]);
  const hovered = useHoveredModel();
  const [tip, setTip] = useState<{ dot: ScatterDot; x: number; y: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const families = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ name: string; color: string }> = [];
    for (const d of dots) {
      if (!seen.has(d.family)) {
        seen.add(d.family);
        out.push({ name: d.family, color: colorFor(d.family) });
      }
    }
    return out;
  }, [dots]);

  // Group dots by base model for trajectory lines
  const trajectories = useMemo(() => {
    const byModel = new Map<string, ScatterDot[]>();
    for (const d of dots) {
      const arr = byModel.get(d.baseModel);
      if (arr) arr.push(d);
      else byModel.set(d.baseModel, [d]);
    }
    return Array.from(byModel.entries()).map(([model, list]) => ({
      model,
      family: list[0].family,
      dots: list.slice().sort((a, b) => {
        if (a.executedAt && b.executedAt) return a.executedAt.localeCompare(b.executedAt);
        return 0;
      }),
    }));
  }, [dots]);

  if (dots.length === 0) {
    return (
      <div className="scatter-wrap" ref={wrapRef}>
        <div className="scatter-empty">No data matches the current filters.</div>
      </div>
    );
  }

  return (
    <div className="scatter-wrap" ref={wrapRef}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="scatter-svg"
      >
        {/* Grid */}
        {yTicks.map((v) => (
          <g key={`y${v}`}>
            <line className="scatter-grid" x1={M.left} x2={M.left + IW} y1={yScale(v)} y2={yScale(v)} />
            <text className="scatter-tick" x={M.left - 8} y={yScale(v) + 4} textAnchor="end">{v}%</text>
          </g>
        ))}
        {xTicks.map((v) => (
          <g key={`x${v}`}>
            <line className="scatter-grid" x1={xScale(v)} x2={xScale(v)} y1={M.top} y2={M.top + IH} />
            <text className="scatter-tick" x={xScale(v)} y={M.top + IH + 18} textAnchor="middle">
              {v >= 1000 ? `${v / 1000}k` : v}
            </text>
          </g>
        ))}
        {/* Axes */}
        <line className="scatter-axis" x1={M.left} x2={M.left} y1={M.top} y2={M.top + IH} />
        <line className="scatter-axis" x1={M.left} x2={M.left + IW} y1={M.top + IH} y2={M.top + IH} />
        <text className="scatter-axis-title" x={M.left + IW / 2} y={H - 10} textAnchor="middle">
          Avg tokens per run (log)
        </text>
        <text
          className="scatter-axis-title"
          x={16}
          y={M.top + IH / 2}
          textAnchor="middle"
          transform={`rotate(-90 16 ${M.top + IH / 2})`}
        >
          Pass rate
        </text>

        {/* Trajectories */}
        {trajectories.map((t) => {
          if (t.dots.length < 2) return null;
          const points = t.dots.map((d) => `${xScale(d.tokens)},${yScale(d.score)}`).join(" ");
          const dim = hovered !== null && hovered !== t.model;
          return (
            <polyline
              key={t.model}
              className="scatter-trajectory"
              points={points}
              stroke={colorFor(t.family)}
              style={{ opacity: dim ? 0.2 : 0.55 }}
            />
          );
        })}

        {/* Dots */}
        {dots.map((d) => {
          const outerR = rScale(d.mem);
          const innerR = outerR * 0.75;
          const n = starPointsForTokens(d.tokens);
          const dim = hovered !== null && hovered !== d.baseModel;
          const active = hovered === d.baseModel;
          return (
            <path
              key={`${d.baseModel}|${d.runtime}|${d.quant}|${d.temperature}`}
              className="scatter-dot"
              d={starPath(xScale(d.tokens), yScale(d.score), n, outerR, innerR)}
              fill={colorFor(d.family)}
              fillOpacity={dim ? 0.35 : active ? 0.95 : 0.85}
              onMouseEnter={(ev) => {
                setHoveredModel(d.baseModel);
                const rect = wrapRef.current?.getBoundingClientRect();
                if (rect) setTip({ dot: d, x: ev.clientX - rect.left, y: ev.clientY - rect.top });
              }}
              onMouseMove={(ev) => {
                const rect = wrapRef.current?.getBoundingClientRect();
                if (rect) setTip((prev) => prev ? { ...prev, x: ev.clientX - rect.left, y: ev.clientY - rect.top } : null);
              }}
              onMouseLeave={() => {
                clearHoveredModel();
                setTip(null);
              }}
            />
          );
        })}
      </svg>

      {tip && (
        <div className="scatter-tip" style={{ left: tip.x + 12, top: tip.y + 12 }}>
          <div className="scatter-tip-title">{tip.dot.baseModel}</div>
          <div className="scatter-tip-meta">
            {tip.dot.quant} · {tip.dot.runtime} · t{tip.dot.temperature}
            {tip.dot.executedAt ? ` · ${tip.dot.executedAt.slice(0, 10)}` : ""}
          </div>
          <div>
            Pass: <strong>{tip.dot.score.toFixed(0)}%</strong> · Tokens: <strong>{Math.round(tip.dot.tokens)}</strong> · Mem: <strong>{tip.dot.mem.toFixed(1)} GB</strong>
          </div>
        </div>
      )}

      <ScatterLegend families={families} />
    </div>
  );
}
```

- [ ] **Step 2: Append CSS to `webapp/public/styles.css`**

```css
/* Scatter chart */
.scatter-wrap {
  position: relative;
  background: #111;
  border: 1px solid #222;
  border-radius: 8px;
  padding: 16px;
  margin: 16px;
}
.scatter-svg { display: block; width: 100%; height: auto; }
.scatter-axis { stroke: #555; stroke-width: 1; }
.scatter-grid { stroke: #1f1f1f; stroke-width: 1; }
.scatter-tick { fill: #888; font-size: 11px; }
.scatter-axis-title { fill: #aaa; font-size: 12px; font-weight: 500; }
.scatter-trajectory { fill: none; stroke-dasharray: 3 3; stroke-width: 1.2; transition: opacity 0.1s; }
.scatter-dot { stroke: #0a0a0a; stroke-width: 1.2; cursor: pointer; transition: fill-opacity 0.1s, stroke-width 0.1s; }
.scatter-dot:hover { stroke: #fff; stroke-width: 2.2; }
.scatter-tip {
  position: absolute;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 12px;
  color: #ddd;
  pointer-events: none;
  line-height: 1.5;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  z-index: 10;
}
.scatter-tip-title { font-weight: 600; margin-bottom: 4px; }
.scatter-tip-meta { color: #aaa; font-size: 11px; margin-bottom: 4px; }
.scatter-empty { text-align: center; padding: 40px 20px; color: #666; }
```

- [ ] **Step 3: Verify build + typecheck**

Run: `npm run -C webapp build 2>&1 | tail -15`
Expected: no TypeScript errors. Resolve any type import issues (e.g., if `ScatterDot` isn't exported from `pipeline.ts`, add it).

- [ ] **Step 4: Commit**

```bash
git add webapp/src/components/Scatter.tsx webapp/public/styles.css
git commit -m "feat(webapp): add Scatter chart component"
```

---

## Task 8: Rewrite `ResultRow`

**Files:**
- Modify: `webapp/src/components/ResultRow.tsx` (full rewrite)
- Modify: `webapp/public/styles.css` (append)
- Modify: `webapp/src/components/ResultTable.tsx` (update Props to pass `ListRow`)

- [ ] **Step 1: Rewrite `ResultRow.tsx`**

Replace the entire contents of `webapp/src/components/ResultRow.tsx`:

```typescript
import { useRef, useState } from "react";
import type { ListRow } from "../lib/pipeline";
import { scoreBand } from "../lib/constants";
import { CapabilityHoverCard } from "./CapabilityHoverCard";
import { setHoveredModel, clearHoveredModel, useHoveredModel } from "../lib/hover-store";

interface Props {
  row: ListRow;
  rank: number;
  onClick: () => void;
}

const FAMILY_COLORS: Record<string, string> = {
  Llama: "#e06666",
  Qwen: "#6fa8dc",
  Mistral: "#93c47d",
  Gemma: "#b996de",
  DeepSeek: "#f6b26b",
  Phi: "#76d7c4",
  GPT: "#ffd966",
  GLM: "#c27ba0",
  Other: "#9aa0a6",
};

const colorFor = (family: string | null): string => {
  if (family === null) return FAMILY_COLORS.Other;
  return FAMILY_COLORS[family] ?? FAMILY_COLORS.Other;
};

const abbrevRuntime = (runtime: string): string =>
  runtime === "llamacpp" ? "lcpp" : runtime;

export function ResultRow({ row, rank, onClick }: Props) {
  const hovered = useHoveredModel();
  const isHovered = row.baseModel !== null && hovered === row.baseModel;
  const isDimmed = hovered !== null && !isHovered && row.baseModel !== null;

  const [capTip, setCapTip] = useState<{ x: number; y: number } | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const familyColor = colorFor(row.family);

  const handleMouseEnter = () => {
    if (row.baseModel !== null) setHoveredModel(row.baseModel);
  };
  const handleMouseLeave = () => {
    if (row.baseModel !== null) clearHoveredModel();
  };

  return (
    <div
      ref={rowRef}
      className={`result-row${isHovered ? " result-row--hovered" : ""}${isDimmed ? " result-row--dimmed" : ""}`}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="button"
    >
      <div className="result-rank">{rank}</div>

      <div className="result-model">
        <div className="result-model-name">{row.key}</div>
        {row.family !== null && <div className="result-model-family">{row.family}</div>}
      </div>

      <div className="result-score-cell">
        <div className={`result-score cap-${scoreBand(row.bestScore / 100)}`}>
          {row.bestScore.toFixed(0)}%
        </div>
        <div className="result-efficiency">{row.efficiency} tok/pt</div>
      </div>

      <div className="result-variants">
        {row.variants.map((v, i) => {
          const opacity = 0.55 + 0.45 * (1 - i / Math.max(1, row.variants.length - 1));
          return (
            <div key={`${v.runtime}|${v.quant}|${v.temperature}`} className="result-variant">
              <span className="result-variant-label">{abbrevRuntime(v.runtime)} {v.quant} t{v.temperature}</span>
              <span className="result-variant-track">
                <span
                  className="result-variant-fill"
                  style={{ width: `${Math.max(0, Math.min(100, v.score))}%`, background: familyColor, opacity }}
                />
              </span>
              <span className="result-variant-score">{v.score.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>

      <div
        className="result-capability"
        onMouseEnter={(ev) => {
          const rect = rowRef.current?.getBoundingClientRect();
          if (rect) setCapTip({ x: ev.clientX - rect.left, y: ev.clientY - rect.top });
        }}
        onMouseMove={(ev) => {
          const rect = rowRef.current?.getBoundingClientRect();
          if (rect) setCapTip({ x: ev.clientX - rect.left, y: ev.clientY - rect.top });
        }}
        onMouseLeave={() => setCapTip(null)}
      >
        {row.capability.map((c) => (
          <div
            key={c.tag}
            className={c.pass === null ? "result-cap-cell cap-absent" : `result-cap-cell cap-${scoreBand(c.pass)}`}
            title={c.pass === null ? `${c.tag}: no runs` : `${c.tag}: ${Math.round(c.pass * 100)}%`}
          />
        ))}
        {capTip !== null && (
          <div style={{ position: "absolute", left: capTip.x + 12, top: capTip.y + 12, pointerEvents: "none" }}>
            <CapabilityHoverCard title={row.key} capability={row.capability} />
          </div>
        )}
      </div>

      <div className="result-numeric">
        <span>{row.mem.toFixed(1)} GB</span>
        <span className="result-numeric-sub">{row.bestVariant.quant}</span>
      </div>

      <div className="result-numeric">
        <span>{Math.round(row.avgTokens).toLocaleString()}</span>
        <span className="result-numeric-sub">avg/run</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Append CSS to `webapp/public/styles.css`**

```css
/* Rewritten result row — overrides the old .result-row grid via cascade */
.result-row {
  display: grid;
  grid-template-columns: 28px 1fr 100px minmax(260px, 2fr) auto 72px 72px;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid #222;
  cursor: pointer;
  position: relative;
  transition: background 0.1s, opacity 0.1s;
  font-size: 13px;
  color: #ddd;
}
.result-row:hover { background: #1a1a1a; }
.result-row--hovered { background: #1f1f1f; }
.result-row--dimmed { opacity: 0.45; }
.result-rank { text-align: right; color: #666; font-variant-numeric: tabular-nums; font-size: 12px; }
.result-model-name { font-weight: 500; color: #ddd; }
.result-model-family { font-size: 11px; color: #888; }
.result-score-cell { text-align: right; }
.result-score { font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1; }
.result-efficiency { font-size: 11px; color: #888; font-variant-numeric: tabular-nums; margin-top: 3px; }
.result-variants { display: flex; flex-direction: column; gap: 3px; }
.result-variant { display: flex; align-items: center; gap: 8px; font-size: 10px; color: #888; font-variant-numeric: tabular-nums; }
.result-variant-label { flex: 0 0 96px; white-space: nowrap; text-align: right; font-family: ui-monospace, SFMono-Regular, monospace; overflow: hidden; text-overflow: ellipsis; }
.result-variant-track { flex: 1 1 auto; height: 10px; background: #0a0a0a; border: 1px solid #1a1a1a; border-radius: 2px; overflow: hidden; min-width: 60px; }
.result-variant-fill { display: block; height: 100%; border-radius: 2px; }
.result-variant-score { flex: 0 0 34px; text-align: right; color: #ddd; }
.result-capability { display: flex; gap: 2px; position: relative; }
.result-cap-cell { width: 14px; height: 20px; border-radius: 2px; cursor: default; background: #333; }
.result-cap-cell.cap-absent {
  background: transparent;
  background-image: repeating-linear-gradient(45deg, #333 0 2px, transparent 2px 4px);
}
.result-numeric { text-align: right; display: flex; flex-direction: column; font-variant-numeric: tabular-nums; font-size: 13px; color: #ddd; }
.result-numeric-sub { font-size: 10px; color: #888; }
```

- [ ] **Step 3: Commit (will still typecheck-fail until Task 9)**

```bash
git add webapp/src/components/ResultRow.tsx webapp/public/styles.css
git commit -m "feat(webapp): rewrite ResultRow with per-variant bars + efficiency"
```

---

## Task 9: Update `ResultTable`

**Files:**
- Modify: `webapp/src/components/ResultTable.tsx` (full rewrite)
- Modify: `webapp/public/styles.css` (append table styles)

- [ ] **Step 1: Rewrite `ResultTable.tsx`**

Replace full contents:

```typescript
import type { ListRow } from "../lib/pipeline";
import { ResultRow } from "./ResultRow";

export type ListSortKey = "best" | "efficiency" | "memory";

interface Props {
  rows: ListRow[];
  sortKey: ListSortKey;
  onSortChange: (key: ListSortKey) => void;
  onRowClick: (row: ListRow) => void;
}

const sortRows = (rows: ListRow[], key: ListSortKey): ListRow[] => {
  const copy = rows.slice();
  if (key === "best") copy.sort((a, b) => b.bestScore - a.bestScore);
  else if (key === "efficiency") copy.sort((a, b) => a.efficiency - b.efficiency);
  else copy.sort((a, b) => a.mem - b.mem);
  return copy;
};

export function ResultTable({ rows, sortKey, onSortChange, onRowClick }: Props) {
  if (rows.length === 0) {
    return <div className="result-empty">No results match the current filters.</div>;
  }
  const sorted = sortRows(rows, sortKey);
  return (
    <div className="result-table">
      <div className="result-controls">
        <span className="result-count">{rows.length} rows</span>
        <div className="result-sort">
          <span className="result-sort-label">sort by:</span>
          <button
            className={`result-sort-btn${sortKey === "best" ? " result-sort-btn--active" : ""}`}
            onClick={() => onSortChange("best")}
            type="button"
          >
            best
          </button>
          <button
            className={`result-sort-btn${sortKey === "efficiency" ? " result-sort-btn--active" : ""}`}
            onClick={() => onSortChange("efficiency")}
            type="button"
          >
            efficiency
          </button>
          <button
            className={`result-sort-btn${sortKey === "memory" ? " result-sort-btn--active" : ""}`}
            onClick={() => onSortChange("memory")}
            type="button"
          >
            memory
          </button>
        </div>
      </div>
      <div className="result-header">
        <div className="result-rank">#</div>
        <div>Model</div>
        <div className="result-score-header">Score / efficiency</div>
        <div>Pass rate by variant</div>
        <div>Capabilities</div>
        <div className="result-numeric-header">Memory</div>
        <div className="result-numeric-header">Tokens</div>
      </div>
      {sorted.map((r, i) => (
        <ResultRow
          key={r.key}
          row={r}
          rank={i + 1}
          onClick={() => onRowClick(r)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Append CSS**

```css
/* Rewritten result table — overrides old .result-table padding */
.result-table { background: #0a0a0a; border: 1px solid #222; border-radius: 8px; overflow: hidden; padding: 0; margin: 0 16px 16px; }
.result-controls { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; font-size: 12px; color: #888; border-bottom: 1px solid #222; background: #0d0d0d; }
.result-count { font-variant-numeric: tabular-nums; }
.result-sort { display: flex; gap: 6px; align-items: center; }
.result-sort-label { color: #666; }
.result-sort-btn { padding: 4px 10px; border-radius: 4px; border: 1px solid #333; background: #1a1a1a; color: #ddd; font-size: 11px; cursor: pointer; }
.result-sort-btn:hover { background: #222; }
.result-sort-btn--active { background: #2a4a6b; border-color: #6bf; color: #fff; }
.result-header {
  display: grid;
  grid-template-columns: 28px 1fr 100px minmax(260px, 2fr) auto 72px 72px;
  gap: 12px;
  padding: 10px 12px;
  font-size: 10px;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #888;
  border-bottom: 1px solid #333;
  background: #0d0d0d;
}
.result-score-header, .result-numeric-header { text-align: right; }
```

- [ ] **Step 3: Commit**

```bash
git add webapp/src/components/ResultTable.tsx webapp/public/styles.css
git commit -m "feat(webapp): update ResultTable with list-specific sort (best/efficiency/memory)"
```

---

## Task 10: Wire Scatter + new list into home route

**Files:**
- Modify: `webapp/src/routes/index.tsx`

- [ ] **Step 1: Replace home route body**

Replace the full contents of `webapp/src/routes/index.tsx`:

```typescript
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DATA, uniqueSorted, modelFamily, modelSizeRange, SIZE_RANGES } from "../lib/data-dev";
import { FilterBar, parseFilters } from "../components/FilterBar";
import { ResultTable, type ListSortKey } from "../components/ResultTable";
import { ModelDetailPanel } from "../components/ModelDetailPanel";
import { Scatter } from "../components/Scatter";
import type { GroupBy, ListRow } from "../lib/pipeline";
import { applyFilters, aggregateForList } from "../lib/pipeline";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const search = useSearch({ strict: false }) as Record<string, string | undefined>;
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<ListSortKey>("best");

  const allValues = useMemo(() => ({
    tags: Array.from(new Set(DATA.flatMap((d) => d.tags))).sort(),
    categories: uniqueSorted(DATA, "category") as string[],
    tiers: (uniqueSorted(DATA, "tier") as number[]).sort((a, b) => a - b),
    runtimes: uniqueSorted(DATA, "runtime") as string[],
    families: Array.from(new Set(DATA.map((d) => modelFamily(d.model)))).sort(),
    sizeRanges: SIZE_RANGES.map((r) => r.label).filter((label) =>
      DATA.some((d) => modelSizeRange(d.model)?.label === label),
    ),
    quants: uniqueSorted(DATA, "quant") as string[],
    temperatures: (uniqueSorted(DATA, "temperature") as number[]).sort((a, b) => a - b),
  }), []);

  const filters = parseFilters(search as never);
  const groupBy = (search.groupBy ?? "model") as GroupBy;
  const panelModel = search.model;

  const filtered = useMemo(() => applyFilters(DATA, filters), [filters]);

  const rows: ListRow[] = useMemo(
    () => aggregateForList(filtered, groupBy),
    [filtered, groupBy],
  );

  const handleRowClick = (row: ListRow) => {
    if (row.baseModel !== null) {
      navigate({ to: "/", search: (s) => ({ ...s, model: row.baseModel }) as never });
      return;
    }
    if (groupBy === "prompt") {
      const firstRun = filtered.find((r) => r.prompt_name === row.key);
      if (firstRun) {
        navigate({ to: "/run/$model/$name", params: { model: firstRun.model, name: firstRun.prompt_name } });
      }
      return;
    }
    const patch: Record<string, string> =
      groupBy === "tag" ? { tags: row.key } :
      groupBy === "category" ? { category: row.key } : {};
    navigate({ to: "/", search: (s) => ({ ...s, ...patch }) as never });
  };

  const closePanel = () =>
    navigate({ to: "/", search: (s) => { const { model: _, ...rest } = s as Record<string, unknown>; return rest as never; } });

  return (
    <div className="app">
      <header className="app-header">
        <h1>Benchmark Analysis</h1>
        <div className="app-subtitle">{DATA.length} runs · {allValues.tags.length} tags · {allValues.runtimes.length} runtimes</div>
      </header>
      <FilterBar allValues={allValues} />
      <Scatter data={filtered} />
      <ResultTable rows={rows} sortKey={sortKey} onSortChange={setSortKey} onRowClick={handleRowClick} />
      {panelModel !== undefined && panelModel !== "" && (
        <ModelDetailPanel model={panelModel} data={DATA} onClose={closePanel} />
      )}
    </div>
  );
}
```

Notes:
- The old `sort` search-param-driven sort is removed from the home route (the new table has its own sort). Preset `sort` field still parses but is ignored here — presets for the home list continue to load without errors, just without effect on sort.
- `parseSort` is no longer imported from `FilterBar` here; leave the export as-is for other callers.

- [ ] **Step 2: Typecheck + build**

Run: `npm run -C webapp build 2>&1 | tail -30`
Expected: no errors. Fix any signature mismatches if present.

- [ ] **Step 3: Run full lib tests**

Run: `npx vitest run webapp/src/lib`
Expected: PASS (existing pipeline tests + new tests).

- [ ] **Step 4: Commit**

```bash
git add webapp/src/routes/index.tsx
git commit -m "feat(webapp): render Scatter + new list on home route"
```

---

## Task 11: Visual verification in dev server

**Goal:** Manually verify the feature works end-to-end. Catches wiring issues that types can't.

- [ ] **Step 1: Regenerate `data.js` with fresh tag corpus**

Run: `./bench report --scoring current`
Expected: writes `webapp/src/data/data.js`.

- [ ] **Step 2: Start dev server**

Run (in a separate shell or background): `npm run -C webapp dev`
Open: `http://localhost:5173`

- [ ] **Step 3: Visual checklist**

Navigate to `/` and verify each item.

**Scatter:**
- [ ] Scatter renders above the list
- [ ] Each dot is an N-pointed star with rounded/scalloped edges
- [ ] Dot sizes visibly vary with memory
- [ ] Dotted lines connect same-base-model dots (trajectories visible for models with multiple variants)
- [ ] Hovering a dot shows a tooltip with model/runtime/quant/score/tokens/memory
- [ ] Hovering a dot dims non-same-model dots/trajectories
- [ ] Mouse leaves the dot → opacity returns to normal

**List:**
- [ ] Rows show rank, model+family, score+efficiency, per-variant bars, capability strip, memory, tokens
- [ ] Variant labels read like `lcpp q8 t0` in monospace
- [ ] Per-variant bar widths scale with score
- [ ] Capability strip shows 10 cells (hatched where no runs)
- [ ] Hovering the capability strip pops the rich hover card with all 10 tags
- [ ] Sort buttons (best/efficiency/memory) reorder the list

**Cross-highlight:**
- [ ] Hovering a list row (groupBy=model) dims non-matching dots in scatter
- [ ] Hovering a scatter dot dims non-matching rows
- [ ] Switching groupBy to `tag` or `category`: scatter still visible, list-hover no longer triggers scatter dimming (list rows don't have a baseModel)

**Other:**
- [ ] Filters narrow both scatter and list in sync
- [ ] Empty filter produces the "No data matches" scatter state (try filtering to something impossible)
- [ ] Panel (click row with baseModel) still opens

- [ ] **Step 4: Capture notable issues**

If anything looks wrong, write it down before moving on. Bugs found here become follow-up fix tasks, not inline fixes unless small.

- [ ] **Step 5: Run full suite one more time**

Run: `npm test && npm run lint`
Expected: PASS on both.

- [ ] **Step 6: Commit (no code changes, but marks task complete)**

If the visual check pushed any small tweaks (e.g., CSS color variable names that didn't exist), stage and commit those fixes:

```bash
git add -p   # stage only relevant hunks
git commit -m "fix(webapp): minor visual polish after verification"
```

If no changes, skip the commit.

---

## Task 12: Cleanup (remove dead code + CSS)

Remove the now-unused sort dropdown from `FilterBar`, delete the old `ResultRow`-era CSS rules, and remove `CapabilityBar.tsx` (its inline cells were absorbed into the new `ResultRow`).

**Files:**
- Modify: `webapp/src/components/FilterBar.tsx` — remove sort `<select>` + direction toggle, remove `currentSort` line, stop importing `Sort` / `parseSort`
- Modify: `webapp/src/lib/pipeline.ts` — `aggregate`, `sortRows`, `Row`, `Sort` types are now unreferenced; delete them
- Modify: `webapp/src/lib/pipeline.test.ts` — delete the `describe("aggregate", ...)` and `describe("sortRows", ...)` blocks
- Delete: `webapp/src/components/CapabilityBar.tsx`
- Modify: `webapp/public/styles.css` — delete lines ~62–74 (`.capability-bar`, `.cap-cell` — these are the CapabilityBar cells) and lines ~85–106 (old `.result-table` padding, old `.result-row` / `.result-header` grid + colors, `.result-label`, `.result-pass`, `.result-arrow`, `.top-models`, `.top-model`). Keep `.cap-green` / `.cap-yellow-green` / `.cap-yellow` / `.cap-orange` / `.cap-red` / `.cap-absent` rules — the new code still uses those class names.

- [ ] **Step 1: Remove sort UI from `FilterBar.tsx`**

Edit the file:
- Delete the `import type { Sort }` symbol (keep `Filters`, `GroupBy` imports).
- Delete `parseSort` (~line 40) and `sortString` (~line 47) top-level exports.
- Delete the `sort?: string;` field from the search-params interface.
- Delete the `const currentSort = parseSort(search.sort);` line.
- Delete the `<label>Sort by …</label>` block and the adjacent direction-toggle button (the "↑"/"↓" button that calls `setSearch({ sort: ... })`).

- [ ] **Step 2: Delete `CapabilityBar.tsx`**

```bash
rm webapp/src/components/CapabilityBar.tsx
```

Confirm nothing imports it:

```bash
grep -rn "CapabilityBar" webapp/src
```
Expected: no results.

- [ ] **Step 3: Remove `Row`, `Sort`, `aggregate`, `sortRows` from `pipeline.ts`**

Open `webapp/src/lib/pipeline.ts` and delete:
- The `Row` interface.
- The `Sort` interface.
- The `labelFor` helper.
- The `aggregate` function body.
- The `sortRows` function body.

Keep: `Filters`, `GroupBy`, `applyFilters`, `groupRows`, new `ScatterDot`, `starPointsForTokens`, `aggregateForScatter`, `ListVariant`, `ListCapability`, `ListRow`, `aggregateForList`.

- [ ] **Step 4: Remove stale tests from `pipeline.test.ts`**

Delete the top-level `describe("aggregate", ...)` block and `describe("sortRows", ...)` block. Keep the new tests for `aggregateForScatter`, `aggregateForList`, and `starPointsForTokens`. Also remove any `import { Row, Sort, aggregate, sortRows } from "./pipeline"` lines that are now unreferenced.

- [ ] **Step 5: Remove dead CSS**

In `webapp/public/styles.css`, delete these block ranges. Use `grep -n` first to confirm line numbers before deleting:

```bash
grep -n "^.capability-bar\|^.cap-cell\|^.result-row {\|^.result-header\|^.result-header,\|^.result-row { border-bottom\|^.result-row:hover\|^.result-label\|^.result-score {\|^.result-score.cap\|^.result-pass\|^.result-arrow\|^.top-models\|^.top-model" webapp/public/styles.css
```

Delete the matching rule blocks (the legacy `.result-row` grid rule is the one with `grid-template-columns: 1fr 280px 70px 60px 20px;`). Also delete the legacy `.result-table { padding: 0 16px; }` if the new one at the end of the file takes over. Keep `.cap-green`, `.cap-yellow-green`, `.cap-yellow`, `.cap-orange`, `.cap-red`, `.cap-absent` — the new code uses those class names.

- [ ] **Step 6: Run full suite**

Run: `npm test && npm run -C webapp build && npm run lint`
Expected: PASS on all. Fix any residual import errors surfaced by TypeScript.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore(webapp): remove dead sort UI, CapabilityBar, legacy CSS"
```

---

## Done

After Task 12, the feature should be:

1. Scatter rendering above the list with rounded-star dots, family colors, memory sizing, and chronological trajectories
2. Listview rows showing per-variant bars, efficiency, and rich capability hover
3. Cross-highlight working when `groupBy=model`
4. All unit tests passing (pipeline, hover-store, data contract)
5. Build clean, lint clean

Final verification before declaring done: re-open the dev server, click through the scenarios in Task 11 one more time.
