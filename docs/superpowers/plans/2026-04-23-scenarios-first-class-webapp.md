# Scenarios-First-Class Webapp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the benchmark webapp to treat scenario results as first-class citizens alongside prompt results — unified list, capability-tag filtering, saved presets, dedicated run detail route with scenario timeline / event log / termination state.

**Architecture:** Extend the report `WebappRecord` contract to emit scenario fields + capability tags. Rewrite the webapp's root route as a filter-driven unified list over a pure pipeline (`filter → group → aggregate → sort`). Add a second route `/run/:model/:name` for per-run detail, branching between a `PromptView` and a `ScenarioView`. Filter state lives in the URL; named presets live in localStorage.

**Tech Stack:** TypeScript, React 19, TanStack Router v1, Vite, Vitest, Effect + Effect Schema (backend only), Biome. Prompt + scenario YAMLs already have `tags: string[]` seeded.

---

## Prerequisites (already done, do NOT redo)

- `tags: string[]` optional field exists on `PromptCorpusEntry` and `ScenarioCorpusEntry` schemas.
- 80 prompt YAMLs + 11 scenario YAMLs are seeded with `TODO` + capability tags.
- All `src/` tests (501) pass on `main`.

## Shared constants (referenced across tasks)

**Canonical tag order** (used by `CapabilityBar` and anywhere capability cells render):

```ts
export const CAPABILITY_TAGS = [
  "instruction-following",
  "long-term-planning",
  "tool-use",
  "spatial-reasoning",
  "resource-management",
  "code-synthesis",
  "code-debugging",
  "math-reasoning",
  "logical-deduction",
  "factual-recall",
] as const;
export type CapabilityTag = typeof CAPABILITY_TAGS[number];

export const PASS_THRESHOLD = 0.5;
```

`TODO` is a filter-only tag — it is NOT in `CAPABILITY_TAGS`.

**Score color bands:**

```ts
export const scoreBand = (score: number): "green" | "yellow-green" | "yellow" | "orange" | "red" => {
  if (score >= 0.8) return "green";
  if (score >= 0.6) return "yellow-green";
  if (score >= 0.4) return "yellow";
  if (score >= 0.2) return "orange";
  return "red";
};
```

---

# Phase A — Report contract extension

## Task 1: Extend `WebappRecord` with tags + scenario fields

**Files:**
- Modify: `src/report/webapp-contract.ts`
- Modify: `src/report/webapp-contract.test.ts`

- [ ] **Step 1: Write failing tests for new fields**

Append these cases to `src/report/webapp-contract.test.ts`, inside `describe("toWebappRecord", ...)`:

```ts
it("emits tags from the corpus entry", () => {
  const entry = { ...promptEntry, tags: ["math-reasoning", "TODO"] };
  const rec = toWebappRecord(makeExecution(), entry, score);
  expect(rec.tags).toEqual(["math-reasoning", "TODO"]);
  expect(rec.is_scenario).toBe(false);
});

it("defaults tags to [] when the corpus entry has no tags", () => {
  const rec = toWebappRecord(makeExecution(), promptEntry, score);
  expect(rec.tags).toEqual([]);
});

it("emits scenario fields on a scenario result", () => {
  const scenarioExec = makeExecution({
    promptName: "bootstrap_grind",
    scenarioName: "bootstrap_grind",
    scenarioHash: "xyz789",
    terminationReason: "completed",
    toolCallCount: 47,
    finalPlayerStats: { credits: 2840, fuel: 87 },
    events: [
      { event: "tool_call", tick: 1, ts: 1_700_000_000, data: { tool: "scan_system" } },
    ],
  });
  const rec = toWebappRecord(scenarioExec, scenarioEntry, score);
  expect(rec.is_scenario).toBe(true);
  expect(rec.scenario_name).toBe("bootstrap_grind");
  expect(rec.termination_reason).toBe("completed");
  expect(rec.tool_call_count).toBe(47);
  expect(rec.final_player_stats).toEqual({ credits: 2840, fuel: 87 });
  expect(rec.events).toHaveLength(1);
  expect(rec.events?.[0].event).toBe("tool_call");
});

it("nulls scenario fields on a prompt result", () => {
  const rec = toWebappRecord(makeExecution(), promptEntry, score);
  expect(rec.is_scenario).toBe(false);
  expect(rec.scenario_name).toBeNull();
  expect(rec.termination_reason).toBeNull();
  expect(rec.tool_call_count).toBeNull();
  expect(rec.final_player_stats).toBeNull();
  expect(rec.events).toBeNull();
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
npm run test -- src/report/webapp-contract.test.ts
```

Expected: 4 new tests fail with "undefined" property reads (tags, is_scenario, scenario_name, etc.).

- [ ] **Step 3: Extend the `WebappRecord` interface + `toWebappRecord`**

In `src/report/webapp-contract.ts`, replace the `WebappRecord` interface and `toWebappRecord` function:

```ts
import type {
  AgentEvent,
  ExecutionResult,
  PromptCorpusEntry,
  ScenarioCorpusEntry,
} from "../schema/index.js";
import type { Score } from "../scoring/score-result.js";

export interface WebappRecord {
  readonly model: string;
  readonly runtime: string;
  readonly quant: string;
  readonly prompt_name: string;
  readonly category: string;
  readonly tier: number;
  readonly temperature: number;
  readonly tags: ReadonlyArray<string>;
  readonly is_scenario: boolean;
  readonly score: number;
  readonly score_details: string;
  readonly prompt_tokens: number;
  readonly generation_tokens: number;
  readonly prompt_tps: number;
  readonly generation_tps: number;
  readonly wall_time_sec: number;
  readonly peak_memory_gb: number;
  readonly output: string;
  readonly prompt_text: string;
  readonly scenario_name: string | null;
  readonly termination_reason:
    | "completed"
    | "wall_clock"
    | "tokens"
    | "tool_calls"
    | "error"
    | null;
  readonly tool_call_count: number | null;
  readonly final_player_stats: Record<string, unknown> | null;
  readonly events: ReadonlyArray<AgentEvent> | null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export const toWebappRecord = (
  result: ExecutionResult,
  entry: PromptCorpusEntry | ScenarioCorpusEntry,
  score: Score,
): WebappRecord => {
  const isPrompt = "promptText" in entry;
  return {
    model: result.model,
    runtime: result.runtime,
    quant: result.quant,
    prompt_name: result.promptName,
    category: isPrompt ? entry.category : "game",
    tier: entry.tier,
    temperature: result.temperature,
    tags: entry.tags ?? [],
    is_scenario: !isPrompt,
    score: score.score,
    score_details: score.details,
    prompt_tokens: result.promptTokens,
    generation_tokens: result.generationTokens,
    prompt_tps: round2(result.promptTps),
    generation_tps: round2(result.generationTps),
    wall_time_sec: round2(result.wallTimeSec),
    peak_memory_gb: round2(result.peakMemoryGb),
    output: result.output,
    prompt_text: isPrompt ? entry.promptText : "",
    scenario_name: isPrompt ? null : entry.name,
    termination_reason: result.terminationReason,
    tool_call_count: result.toolCallCount,
    final_player_stats: result.finalPlayerStats as Record<string, unknown> | null,
    events: result.events,
  };
};
```

Delete the old doc comment block that says `style` is deferred; the new code supersedes it.

- [ ] **Step 4: Run the full test file to verify everything passes**

```bash
npm run test -- src/report/webapp-contract.test.ts
```

Expected: all tests pass (the originals + the 4 new ones).

- [ ] **Step 5: Run typecheck to verify AgentEvent import resolves**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/report/webapp-contract.ts src/report/webapp-contract.test.ts
git commit -m "feat(report): expose tags + scenario fields in WebappRecord"
```

---

## Task 2: Verify `aggregate.ts` passes new fields through on a scenario archive

`aggregate.ts` calls `toWebappRecord(result, entry, score)` — no changes needed there. This task just adds a guard test at the aggregate level to confirm end-to-end wiring.

**Files:**
- Modify: `src/report/aggregate.test.ts` (add case) — inspect file first; if no suitable fixture, extend existing fixtures
- Modify (possibly): `src/report/__fixtures__/` — a tiny scenario archive fixture if needed

- [ ] **Step 1: Inspect aggregate.test.ts to see what fixtures exist**

```bash
cat src/report/aggregate.test.ts | head -80
ls src/report/__fixtures__/ 2>/dev/null
```

- [ ] **Step 2: Add a test that a scenario result gets the new fields**

Append to `src/report/aggregate.test.ts` (inside the appropriate `describe`):

```ts
it("passes scenario fields through to WebappRecord", async () => {
  const archive = /* build a minimal LoadedArchive with one scenario result
     and a matching ScenarioCorpusEntry with tags */;
  const { records } = await Effect.runPromise(
    aggregateArchive(archive, { scoringMode: "as-run" }).pipe(
      Effect.provide(NodeCommandExecutor.layer),
    ),
  );
  const rec = records[0];
  expect(rec.is_scenario).toBe(true);
  expect(rec.scenario_name).toBe("bootstrap_grind");
  expect(rec.tags).toContain("long-term-planning");
});
```

Use the existing prompt-test helpers as a template; copy the shape and swap to a `ScenarioCorpusEntry`. If the existing tests don't build a `LoadedArchive` inline, factor a helper or skip this step with a note and rely on the Task 1 unit test.

- [ ] **Step 3: Run the new test**

```bash
npm run test -- src/report/aggregate.test.ts
```

Expected: new test passes. If it fails, investigate — `toWebappRecord` is the only plausible miss-point and Task 1 should have covered it.

- [ ] **Step 4: Commit (only if a test was added)**

```bash
git add src/report/aggregate.test.ts src/report/__fixtures__/ 2>/dev/null
git commit -m "test(report): aggregate passes scenario fields through"
```

If the existing aggregate test infra is hostile to adding the fixture, skip this task — Task 1 is sufficient coverage. Leave a note in the commit message of the next task.

---

# Phase B — Webapp data layer

## Task 3: Wire vitest to cover webapp tests

**Files:**
- Modify: `vitest.config.ts`

- [ ] **Step 1: Extend the vitest include glob**

Replace `vitest.config.ts` contents:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "webapp/src/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 2: Run the test suite to verify nothing broke**

```bash
npm run test
```

Expected: same count as before (501 tests) — no webapp tests exist yet.

- [ ] **Step 3: Commit**

```bash
git add vitest.config.ts
git commit -m "chore(test): include webapp/src in vitest glob"
```

---

## Task 4: Update `BenchmarkResult` interface and add `normalizeRecord`

**Files:**
- Modify: `webapp/src/lib/data.ts`
- Create: `webapp/src/lib/data.test.ts`
- Create: `webapp/src/lib/constants.ts`
- Modify: `webapp/src/lib/data-dev.ts`

- [ ] **Step 1: Create the shared constants file**

Create `webapp/src/lib/constants.ts`:

```ts
export const CAPABILITY_TAGS = [
  "instruction-following",
  "long-term-planning",
  "tool-use",
  "spatial-reasoning",
  "resource-management",
  "code-synthesis",
  "code-debugging",
  "math-reasoning",
  "logical-deduction",
  "factual-recall",
] as const;

export type CapabilityTag = typeof CAPABILITY_TAGS[number];

export const PASS_THRESHOLD = 0.5;

export const scoreBand = (
  score: number,
): "green" | "yellow-green" | "yellow" | "orange" | "red" => {
  if (score >= 0.8) return "green";
  if (score >= 0.6) return "yellow-green";
  if (score >= 0.4) return "yellow";
  if (score >= 0.2) return "orange";
  return "red";
};
```

- [ ] **Step 2: Write failing tests for `normalizeRecord`**

Create `webapp/src/lib/data.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeRecord } from "./data";

describe("normalizeRecord", () => {
  it("fills defaults for missing new fields on legacy data.js", () => {
    const legacy = {
      model: "m", runtime: "llamacpp", quant: "Q4", prompt_name: "p",
      category: "code", tier: 1, score: 1, score_details: "",
      prompt_tps: 100, generation_tps: 50, prompt_tokens: 10,
      generation_tokens: 20, wall_time_sec: 1, peak_memory_gb: 8,
      output: "", prompt_text: "",
    };
    const rec = normalizeRecord(legacy as never);
    expect(rec.tags).toEqual([]);
    expect(rec.is_scenario).toBe(false);
    expect(rec.temperature).toBe(0);
    expect(rec.events).toBeNull();
    expect(rec.scenario_name).toBeNull();
  });

  it("preserves values on a full record", () => {
    const rec = normalizeRecord({
      model: "m", runtime: "llamacpp", quant: "Q4", prompt_name: "p",
      category: "game", tier: 2, temperature: 0.7,
      tags: ["tool-use"], is_scenario: true,
      score: 0.9, score_details: "ok",
      prompt_tps: 100, generation_tps: 50, prompt_tokens: 10,
      generation_tokens: 20, wall_time_sec: 1, peak_memory_gb: 8,
      output: "", prompt_text: "",
      scenario_name: "bootstrap_grind", termination_reason: "completed",
      tool_call_count: 47, final_player_stats: { credits: 100 },
      events: [],
    });
    expect(rec.tags).toEqual(["tool-use"]);
    expect(rec.is_scenario).toBe(true);
    expect(rec.termination_reason).toBe("completed");
  });
});
```

- [ ] **Step 3: Verify test fails**

```bash
npm run test -- webapp/src/lib/data.test.ts
```

Expected: FAIL with "normalizeRecord is not exported".

- [ ] **Step 4: Replace `webapp/src/lib/data.ts`**

Overwrite `webapp/src/lib/data.ts`:

```ts
import { CAPABILITY_TAGS, type CapabilityTag } from "./constants";

export interface AgentEvent {
  event: "tool_call" | "tool_result" | "tool_error" | "turn_end" | "error" | "connection";
  tick: number;
  ts: number;
  data: unknown;
}

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
}

declare global {
  interface Window {
    __BENCHMARK_DATA?: unknown[];
  }
}

// Defensive normalization: old data.js files produced before the scenario-first
// rewrite are missing new fields; fill sensible defaults so the app loads them
// without runtime errors.
export const normalizeRecord = (raw: Partial<BenchmarkResult>): BenchmarkResult => ({
  model: raw.model ?? "",
  runtime: raw.runtime ?? "",
  quant: raw.quant ?? "",
  prompt_name: raw.prompt_name ?? "",
  category: raw.category ?? "",
  tier: raw.tier ?? 0,
  temperature: raw.temperature ?? 0,
  tags: raw.tags ?? [],
  is_scenario: raw.is_scenario ?? (raw.scenario_name != null),
  score: raw.score ?? 0,
  score_details: raw.score_details ?? "",
  prompt_tokens: raw.prompt_tokens ?? 0,
  generation_tokens: raw.generation_tokens ?? 0,
  prompt_tps: raw.prompt_tps ?? 0,
  generation_tps: raw.generation_tps ?? 0,
  wall_time_sec: raw.wall_time_sec ?? 0,
  peak_memory_gb: raw.peak_memory_gb ?? 0,
  output: raw.output ?? "",
  prompt_text: raw.prompt_text ?? "",
  scenario_name: raw.scenario_name ?? null,
  termination_reason: raw.termination_reason ?? null,
  tool_call_count: raw.tool_call_count ?? null,
  final_player_stats: raw.final_player_stats ?? null,
  events: raw.events ?? null,
});

export let DATA: BenchmarkResult[] =
  typeof window !== "undefined" && window.__BENCHMARK_DATA
    ? (window.__BENCHMARK_DATA as Partial<BenchmarkResult>[]).map(normalizeRecord)
    : [];

export function setData(data: BenchmarkResult[]) {
  DATA = data;
}

export function uniqueSorted<K extends keyof BenchmarkResult>(
  data: BenchmarkResult[],
  field: K,
): BenchmarkResult[K][] {
  const values = [...new Set(data.map((d) => d[field]))];
  return values.sort() as BenchmarkResult[K][];
}

export function modelFamily(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("deepseek")) return "DeepSeek";
  if (lower.includes("qwen") || lower.includes("qwq")) return "Qwen";
  if (lower.includes("mistral") || lower.includes("devstral") || lower.includes("magistral")) return "Mistral";
  if (lower.includes("gemma")) return "Gemma";
  if (lower.includes("llama")) return "Llama";
  if (lower.includes("phi")) return "Phi";
  if (lower.includes("gpt")) return "GPT";
  if (lower.includes("glm")) return "GLM";
  return name.split(" ")[0] || "Other";
}

export function modelSizeB(name: string): number | null {
  const match = name.match(/(\d+)B\b/i);
  return match ? parseInt(match[1], 10) : null;
}

export interface SizeRange { label: string; min: number; max: number }
export const SIZE_RANGES: SizeRange[] = [
  { label: "Under 10B", min: 0, max: 10 },
  { label: "10-25B", min: 10, max: 25 },
  { label: "25-40B", min: 25, max: 40 },
  { label: "40-80B", min: 40, max: 80 },
  { label: "80B+", min: 80, max: Infinity },
];

export function modelSizeRange(name: string): SizeRange | null {
  const size = modelSizeB(name);
  if (size === null) return null;
  return SIZE_RANGES.find((r) => size >= r.min && size < r.max) ?? null;
}
```

**Deliberately removed:** `style` field, `groupBy`, `bestQuantMap`, `bestQuantData`, `quantSummary`, `avgScore`, `modelsForRuntime` (used only by retired components). Do not add them back.

- [ ] **Step 5: Update `data-dev.ts` to re-export current names only**

Overwrite `webapp/src/lib/data-dev.ts`:

```ts
import "../data/data.js";
import { DATA, setData, normalizeRecord } from "./data";

// data.js sets window.__BENCHMARK_DATA after data.ts evaluated; rebind here.
if (DATA.length === 0 && typeof window !== "undefined" && window.__BENCHMARK_DATA) {
  setData((window.__BENCHMARK_DATA as Parameters<typeof normalizeRecord>[0][]).map(normalizeRecord));
}

export { DATA } from "./data";
export { normalizeRecord } from "./data";
export type { BenchmarkResult, AgentEvent } from "./data";
export { uniqueSorted, modelFamily, modelSizeB, modelSizeRange, SIZE_RANGES } from "./data";
```

- [ ] **Step 6: Run tests**

```bash
npm run test -- webapp/src/lib/data.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 7: Typecheck — this WILL show errors in components that use removed fields**

```bash
npm run -C webapp typecheck 2>&1 | head -40
```

Expected: errors in `Leaderboard.tsx`, `HeatmapTable.tsx`, `DetailPanel.tsx`, `ScatterPlot.tsx`, `index.tsx` referencing `style`, `bestQuantData`, etc.

These components are being deleted in Task 16. To keep typecheck green for the meantime, skip ahead to Task 16 for a moment if the errors block downstream tests. (Subagent driver should order as written; the errors are expected and tracked in Task 16.)

- [ ] **Step 8: Commit**

```bash
git add webapp/src/lib/data.ts webapp/src/lib/data-dev.ts webapp/src/lib/data.test.ts webapp/src/lib/constants.ts
git commit -m "feat(webapp): extend BenchmarkResult with tags + scenario fields"
```

---

## Task 5: Port `strip-thinking` to the webapp

**Files:**
- Create: `webapp/src/lib/strip-thinking.ts`
- Create: `webapp/src/lib/strip-thinking.test.ts`

- [ ] **Step 1: Write failing tests**

Create `webapp/src/lib/strip-thinking.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { stripThinkingTags, extractThinkBlock } from "./strip-thinking";

describe("stripThinkingTags", () => {
  it("strips a leading <think>...</think> block", () => {
    expect(stripThinkingTags("<think>hmm</think>\n\nanswer is 4")).toBe("answer is 4");
  });
  it("returns text as-is when no tags", () => {
    expect(stripThinkingTags("plain answer")).toBe("plain answer");
  });
  it("pulls the final harmony channel body when present", () => {
    const text = "<|channel|>final<|message|>ok<|end|>";
    expect(stripThinkingTags(text)).toBe("ok");
  });
});

describe("extractThinkBlock", () => {
  it("returns the inner text of a <think> block", () => {
    expect(extractThinkBlock("<think>reasoning here</think>\nfinal")).toBe("reasoning here");
  });
  it("returns null when no <think> block", () => {
    expect(extractThinkBlock("just an answer")).toBeNull();
  });
});
```

- [ ] **Step 2: Verify tests fail**

```bash
npm run test -- webapp/src/lib/strip-thinking.test.ts
```

Expected: fails with "Cannot find module".

- [ ] **Step 3: Create the implementation**

Create `webapp/src/lib/strip-thinking.ts`:

```ts
// Ports src/scoring/strip-thinking.ts to the webapp. Behavior must match
// byte-for-byte so the output displayed here matches what the scorer saw.

const HARMONY_FINAL_RE =
  /<\|channel\|>\s*final\s*<\|message\|>(.*?)(?:<\|end\|>|<\|return\|>|$)/s;
const HARMONY_TOKEN_RE = /<\|[^|]*\|>/g;
const THINK_RE = /^.*?<\/think>\s*/s;
const THINK_BLOCK_RE = /<think>(.*?)<\/think>/s;

export const stripThinkingTags = (text: string): string => {
  let t = text;
  const m = HARMONY_FINAL_RE.exec(t);
  if (m && m[1] !== undefined) t = m[1];
  t = t.replace(HARMONY_TOKEN_RE, "");
  t = t.replace(THINK_RE, "");
  return t.trim();
};

// Webapp-only helper: pull the reasoning text out of a <think>...</think>
// block for display in a collapsible UI. Not present in the scoring version.
export const extractThinkBlock = (text: string): string | null => {
  const m = THINK_BLOCK_RE.exec(text);
  return m && m[1] !== undefined ? m[1].trim() : null;
};
```

- [ ] **Step 4: Run tests**

```bash
npm run test -- webapp/src/lib/strip-thinking.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/lib/strip-thinking.ts webapp/src/lib/strip-thinking.test.ts
git commit -m "feat(webapp): port strip-thinking + add extractThinkBlock helper"
```

---

## Task 6: Implement the pure data pipeline

**Files:**
- Create: `webapp/src/lib/pipeline.ts`
- Create: `webapp/src/lib/pipeline.test.ts`

- [ ] **Step 1: Write failing tests**

Create `webapp/src/lib/pipeline.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  applyFilters,
  groupRows,
  aggregate,
  sortRows,
  type Filters,
  type GroupBy,
} from "./pipeline";
import type { BenchmarkResult } from "./data";

const baseRec: BenchmarkResult = {
  model: "Qwen3 32B", runtime: "llamacpp", quant: "Q4_K_M",
  prompt_name: "p", category: "code", tier: 2, temperature: 0.7,
  tags: ["code-synthesis"], is_scenario: false,
  score: 0.9, score_details: "",
  prompt_tokens: 10, generation_tokens: 20,
  prompt_tps: 100, generation_tps: 50,
  wall_time_sec: 1, peak_memory_gb: 16,
  output: "", prompt_text: "",
  scenario_name: null, termination_reason: null,
  tool_call_count: null, final_player_stats: null, events: null,
};
const mk = (o: Partial<BenchmarkResult>): BenchmarkResult => ({ ...baseRec, ...o });

describe("applyFilters", () => {
  it("includes all when filters empty", () => {
    const data = [mk({}), mk({ model: "X" })];
    expect(applyFilters(data, {}).length).toBe(2);
  });
  it("filters by tags (OR within dimension)", () => {
    const data = [
      mk({ tags: ["code-synthesis"] }),
      mk({ tags: ["math-reasoning"] }),
      mk({ tags: ["factual-recall"] }),
    ];
    const out = applyFilters(data, { tags: ["code-synthesis", "math-reasoning"] });
    expect(out.length).toBe(2);
  });
  it("AND across chips", () => {
    const data = [
      mk({ tier: 2, runtime: "llamacpp" }),
      mk({ tier: 3, runtime: "llamacpp" }),
      mk({ tier: 2, runtime: "mlx" }),
    ];
    expect(applyFilters(data, { tier: [2], runtime: ["llamacpp"] }).length).toBe(1);
  });
  it("excludes via negative filter", () => {
    const data = [mk({ tags: ["TODO"] }), mk({ tags: ["code-synthesis"] })];
    expect(applyFilters(data, { tagsExclude: ["TODO"] }).length).toBe(1);
  });
});

describe("groupRows + aggregate", () => {
  it("groups by model and computes mean + passRate", () => {
    const data = [
      mk({ model: "A", score: 1.0 }),
      mk({ model: "A", score: 0.3 }),
      mk({ model: "A", score: 0.8 }),
      mk({ model: "B", score: 0.1 }),
    ];
    const groups = groupRows(data, "modelOnly");
    const rows = aggregate(groups, "modelOnly");
    const a = rows.find((r) => r.key === "A")!;
    expect(a.meanScore).toBeCloseTo((1.0 + 0.3 + 0.8) / 3);
    expect(a.passRate).toBeCloseTo(2 / 3); // >= 0.5: 1.0 and 0.8
    expect(rows.find((r) => r.key === "B")?.passRate).toBe(0);
  });

  it("groups by tag and explodes multi-tag results", () => {
    const data = [
      mk({ tags: ["tool-use", "long-term-planning"], score: 0.9 }),
      mk({ tags: ["tool-use"], score: 0.5 }),
    ];
    const groups = groupRows(data, "tag");
    const rows = aggregate(groups, "tag");
    expect(rows.find((r) => r.key === "tool-use")?.runs.length).toBe(2);
    expect(rows.find((r) => r.key === "long-term-planning")?.runs.length).toBe(1);
  });

  it("emits capabilityProfile with per-tag means for model groupings", () => {
    const data = [
      mk({ model: "A", tags: ["code-synthesis"], score: 0.9 }),
      mk({ model: "A", tags: ["math-reasoning"], score: 0.4 }),
    ];
    const rows = aggregate(groupRows(data, "model"), "model");
    const profile = rows[0].capabilityProfile;
    expect(profile["code-synthesis"]?.mean).toBe(0.9);
    expect(profile["math-reasoning"]?.mean).toBe(0.4);
    expect(profile["factual-recall"]).toBeUndefined();
  });
});

describe("sortRows", () => {
  it("sorts descending by meanScore", () => {
    const rows = [
      { key: "a", label: "a", meanScore: 0.5, passRate: 0, capabilityProfile: {}, runs: [] },
      { key: "b", label: "b", meanScore: 0.9, passRate: 0, capabilityProfile: {}, runs: [] },
    ];
    const out = sortRows(rows as never, { field: "meanScore", dir: "desc" });
    expect(out[0].key).toBe("b");
  });
});
```

- [ ] **Step 2: Verify tests fail**

```bash
npm run test -- webapp/src/lib/pipeline.test.ts
```

Expected: fails with "Cannot find module './pipeline'".

- [ ] **Step 3: Create the implementation**

Create `webapp/src/lib/pipeline.ts`:

```ts
import type { BenchmarkResult } from "./data";
import { PASS_THRESHOLD } from "./constants";
import { modelFamily, modelSizeRange } from "./data";

export interface Filters {
  tags?: string[];
  tagsExclude?: string[];
  category?: string[];
  tier?: number[];
  runtime?: string[];
  family?: string[];
  sizeRange?: string[];
  quant?: string[];
  temperature?: number[]; // single-select from UI, but shape allows multi
  isScenario?: boolean;
}

export type GroupBy =
  | "model"      // model + runtime + quant
  | "modelOnly"  // model aggregated across runtimes+quants
  | "tag"
  | "category"
  | "prompt"
  | "runtime"
  | "family";

export interface Row {
  key: string;
  label: string;
  meanScore: number;
  passRate: number;
  capabilityProfile: Record<string, { mean: number; count: number }>;
  runs: BenchmarkResult[];
}

export interface Sort {
  field: "meanScore" | "passRate" | "generation_tps" | "peak_memory_gb" | "wall_time_sec" | "name" | "tier";
  dir: "asc" | "desc";
}

const has = <T>(xs: T[] | undefined, v: T): boolean =>
  xs !== undefined && xs.length > 0 && xs.includes(v);

const passesDim = <T>(selected: T[] | undefined, v: T): boolean =>
  selected === undefined || selected.length === 0 || selected.includes(v);

export const applyFilters = (data: BenchmarkResult[], f: Filters): BenchmarkResult[] =>
  data.filter((r) => {
    if (f.tags !== undefined && f.tags.length > 0 && !r.tags.some((t) => f.tags!.includes(t)))
      return false;
    if (f.tagsExclude !== undefined && r.tags.some((t) => f.tagsExclude!.includes(t)))
      return false;
    if (!passesDim(f.category, r.category)) return false;
    if (!passesDim(f.tier, r.tier)) return false;
    if (!passesDim(f.runtime, r.runtime)) return false;
    if (f.family !== undefined && f.family.length > 0 && !f.family.includes(modelFamily(r.model)))
      return false;
    if (f.sizeRange !== undefined && f.sizeRange.length > 0) {
      const sr = modelSizeRange(r.model)?.label;
      if (sr === undefined || !f.sizeRange.includes(sr)) return false;
    }
    if (!passesDim(f.quant, r.quant)) return false;
    if (!passesDim(f.temperature, r.temperature)) return false;
    if (f.isScenario !== undefined && r.is_scenario !== f.isScenario) return false;
    return true;
  });

export const groupRows = (
  data: BenchmarkResult[],
  by: GroupBy,
): Map<string, BenchmarkResult[]> => {
  const groups = new Map<string, BenchmarkResult[]>();
  const push = (key: string, r: BenchmarkResult) => {
    const arr = groups.get(key);
    if (arr) arr.push(r);
    else groups.set(key, [r]);
  };
  for (const r of data) {
    switch (by) {
      case "model":
        push(`${r.model}|${r.runtime}|${r.quant}`, r);
        break;
      case "modelOnly":
        push(r.model, r);
        break;
      case "tag":
        // A result with multiple tags appears in every group it has.
        // TODO is intentionally not special-cased here — pipeline leaves
        // presentation choices to the UI.
        for (const t of r.tags) push(t, r);
        break;
      case "category":
        push(r.category, r);
        break;
      case "prompt":
        push(r.prompt_name, r);
        break;
      case "runtime":
        push(r.runtime, r);
        break;
      case "family":
        push(modelFamily(r.model), r);
        break;
    }
  }
  return groups;
};

const labelFor = (by: GroupBy, key: string, runs: BenchmarkResult[]): string => {
  if (by === "model") {
    const r = runs[0];
    return `${r.model} · ${r.runtime} · ${r.quant}`;
  }
  return key;
};

export const aggregate = (
  groups: Map<string, BenchmarkResult[]>,
  by: GroupBy,
): Row[] => {
  const rows: Row[] = [];
  for (const [key, runs] of groups) {
    const meanScore = runs.reduce((s, r) => s + r.score, 0) / runs.length;
    const passRate = runs.filter((r) => r.score >= PASS_THRESHOLD).length / runs.length;

    // capability profile: mean score per tag across THIS group's runs
    const byTag = new Map<string, number[]>();
    for (const r of runs) {
      for (const t of r.tags) {
        const arr = byTag.get(t);
        if (arr) arr.push(r.score);
        else byTag.set(t, [r.score]);
      }
    }
    const capabilityProfile: Record<string, { mean: number; count: number }> = {};
    for (const [tag, scores] of byTag) {
      capabilityProfile[tag] = {
        mean: scores.reduce((s, v) => s + v, 0) / scores.length,
        count: scores.length,
      };
    }
    rows.push({ key, label: labelFor(by, key, runs), meanScore, passRate, capabilityProfile, runs });
  }
  return rows;
};

export const sortRows = (rows: Row[], sort: Sort): Row[] => {
  const mult = sort.dir === "asc" ? 1 : -1;
  const copy = rows.slice();
  copy.sort((a, b) => {
    if (sort.field === "name") return mult * a.label.localeCompare(b.label);
    if (sort.field === "meanScore") return mult * (a.meanScore - b.meanScore);
    if (sort.field === "passRate") return mult * (a.passRate - b.passRate);
    // Fields that live on individual runs — average across the group.
    const avg = (field: keyof BenchmarkResult) =>
      (rs: BenchmarkResult[]) =>
        rs.reduce((s, r) => s + (typeof r[field] === "number" ? (r[field] as number) : 0), 0) / rs.length;
    if (sort.field === "generation_tps") return mult * (avg("generation_tps")(a.runs) - avg("generation_tps")(b.runs));
    if (sort.field === "peak_memory_gb") return mult * (avg("peak_memory_gb")(a.runs) - avg("peak_memory_gb")(b.runs));
    if (sort.field === "wall_time_sec") return mult * (avg("wall_time_sec")(a.runs) - avg("wall_time_sec")(b.runs));
    if (sort.field === "tier") return mult * (avg("tier")(a.runs) - avg("tier")(b.runs));
    return 0;
  });
  return copy;
};
```

- [ ] **Step 4: Run tests**

```bash
npm run test -- webapp/src/lib/pipeline.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/lib/pipeline.ts webapp/src/lib/pipeline.test.ts
git commit -m "feat(webapp): pure filter/group/aggregate/sort pipeline"
```

---

## Task 7: Preset storage + seeded defaults

**Files:**
- Create: `webapp/src/lib/presets.ts`
- Create: `webapp/src/lib/presets.test.ts`

- [ ] **Step 1: Write failing tests**

Create `webapp/src/lib/presets.test.ts`:

```ts
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import {
  loadPresets, savePresets, seedIfEmpty, DEFAULT_PRESETS,
} from "./presets";

const storage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { store = {}; },
  };
})();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("localStorage", storage);
});
afterEach(() => vi.unstubAllGlobals());

describe("presets", () => {
  it("returns {} when storage empty", () => {
    expect(loadPresets()).toEqual({});
  });
  it("round-trips save/load", () => {
    savePresets({ foo: "tags=tool-use&groupBy=model" });
    expect(loadPresets()).toEqual({ foo: "tags=tool-use&groupBy=model" });
  });
  it("returns {} when storage is malformed", () => {
    storage.setItem("llm-bench.presets", "{not json");
    expect(loadPresets()).toEqual({});
  });
  it("seedIfEmpty writes the four defaults when storage is empty", () => {
    seedIfEmpty();
    const loaded = loadPresets();
    expect(Object.keys(loaded).sort()).toEqual(Object.keys(DEFAULT_PRESETS).sort());
  });
  it("seedIfEmpty is a noop when storage is non-empty", () => {
    savePresets({ mine: "tags=tool-use" });
    seedIfEmpty();
    expect(loadPresets()).toEqual({ mine: "tags=tool-use" });
  });
});
```

- [ ] **Step 2: Verify tests fail**

```bash
npm run test -- webapp/src/lib/presets.test.ts
```

- [ ] **Step 3: Create the implementation**

Create `webapp/src/lib/presets.ts`:

```ts
const KEY = "llm-bench.presets";

export type PresetStore = Record<string, string>;

export const DEFAULT_PRESETS: PresetStore = {
  "Task-first: agentic tier 3":
    "tags=long-term-planning,tool-use&tier=3&groupBy=model&sort=-meanScore",
  "Model-first: all":
    "groupBy=model&sort=-meanScore",
  "Capability leaderboard":
    "groupBy=tag&sort=-meanScore",
  "Needs review":
    "tags=TODO&groupBy=prompt&sort=name",
};

export const loadPresets = (): PresetStore => {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as PresetStore;
  } catch {
    return {};
  }
};

export const savePresets = (store: PresetStore): void => {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(store));
};

export const seedIfEmpty = (): void => {
  if (Object.keys(loadPresets()).length === 0) savePresets({ ...DEFAULT_PRESETS });
};

export const upsertPreset = (name: string, body: string): void => {
  const store = loadPresets();
  store[name] = body;
  savePresets(store);
};

export const deletePreset = (name: string): void => {
  const store = loadPresets();
  delete store[name];
  savePresets(store);
};

export const renamePreset = (oldName: string, newName: string): void => {
  const store = loadPresets();
  if (!(oldName in store) || oldName === newName) return;
  store[newName] = store[oldName];
  delete store[oldName];
  savePresets(store);
};

export const resetPresets = (): void => savePresets({ ...DEFAULT_PRESETS });
```

- [ ] **Step 4: Run tests**

```bash
npm run test -- webapp/src/lib/presets.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add webapp/src/lib/presets.ts webapp/src/lib/presets.test.ts
git commit -m "feat(webapp): preset storage + seeded defaults"
```

---

# Phase C — UI components

> All React components in this phase use functional components + hooks. Styling uses plain CSS classes (see existing `webapp/public/styles.css`); we'll add new classes inline in each component task. No CSS-in-JS libs.

## Task 8: `CapabilityBar` component

**Files:**
- Create: `webapp/src/components/CapabilityBar.tsx`

- [ ] **Step 1: Write the component**

Create `webapp/src/components/CapabilityBar.tsx`:

```tsx
import { CAPABILITY_TAGS, scoreBand, type CapabilityTag } from "../lib/constants";

interface Props {
  profile: Record<string, { mean: number; count: number }>;
  height?: number;
}

export function CapabilityBar({ profile, height = 8 }: Props) {
  return (
    <div className="capability-bar" role="img" aria-label="capability profile">
      {CAPABILITY_TAGS.map((tag: CapabilityTag) => {
        const cell = profile[tag];
        if (cell === undefined) {
          return (
            <div
              key={tag}
              className="cap-cell cap-absent"
              style={{ height }}
              title={`${tag}: no runs`}
            />
          );
        }
        return (
          <div
            key={tag}
            className={`cap-cell cap-${scoreBand(cell.mean)}`}
            style={{ height }}
            title={`${tag}: ${cell.mean.toFixed(2)} (${cell.count} runs)`}
          />
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Add CSS for the bar**

Append to `webapp/public/styles.css`:

```css
.capability-bar { display: flex; gap: 2px; width: 100%; }
.cap-cell { flex: 1; border-radius: 1px; background: #333; }
.cap-green       { background: #4ade80; }
.cap-yellow-green { background: #a3e635; }
.cap-yellow      { background: #facc15; }
.cap-orange      { background: #fb923c; }
.cap-red         { background: #ef4444; }
.cap-absent      {
  background: transparent;
  background-image: repeating-linear-gradient(
    45deg, #333 0 2px, transparent 2px 4px
  );
}
```

- [ ] **Step 3: Typecheck the webapp**

```bash
npm run -C webapp typecheck 2>&1 | grep -v "index.tsx\|Leaderboard\|HeatmapTable\|ScatterPlot\|DetailPanel" | head -20
```

Expected: no errors in `CapabilityBar.tsx`.

- [ ] **Step 4: Commit**

```bash
git add webapp/src/components/CapabilityBar.tsx webapp/public/styles.css
git commit -m "feat(webapp): capability profile bar component"
```

---

## Task 9: `FilterBar` (chips + groupBy + sort + preset menu) as a single composed component

**Files:**
- Create: `webapp/src/components/FilterBar.tsx`

Reading filter state from the URL via TanStack Router's `useSearch` / `useNavigate`. The URL is canonical; component is purely a translator between URL and UI.

- [ ] **Step 1: Create the component**

Create `webapp/src/components/FilterBar.tsx`:

```tsx
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useState, useCallback, useEffect } from "react";
import type { Filters, GroupBy, Sort } from "../lib/pipeline";
import {
  loadPresets, upsertPreset, deletePreset, renamePreset,
  resetPresets, seedIfEmpty,
} from "../lib/presets";

type SearchState = {
  tags?: string;
  tier?: string;
  runtime?: string;
  family?: string;
  sizeRange?: string;
  quant?: string;
  category?: string;
  temperature?: string;
  isScenario?: string;
  groupBy?: GroupBy;
  sort?: string; // e.g. "-meanScore" or "name"
  preset?: string;
  model?: string; // panel open state
};

const csv = (s: string | undefined): string[] =>
  s === undefined || s === "" ? [] : s.split(",");

export const parseFilters = (search: SearchState): Filters => ({
  tags: csv(search.tags),
  category: csv(search.category),
  tier: csv(search.tier).map(Number).filter((n) => !Number.isNaN(n)),
  runtime: csv(search.runtime),
  family: csv(search.family),
  sizeRange: csv(search.sizeRange),
  quant: csv(search.quant),
  temperature: csv(search.temperature).map(Number).filter((n) => !Number.isNaN(n)),
  isScenario: search.isScenario === "true" ? true : search.isScenario === "false" ? false : undefined,
});

export const parseSort = (s: string | undefined): Sort => {
  if (!s) return { field: "meanScore", dir: "desc" };
  const dir = s.startsWith("-") ? "desc" : "asc";
  const field = s.replace(/^-/, "") as Sort["field"];
  return { field, dir };
};

const sortString = (s: Sort): string => (s.dir === "desc" ? `-${s.field}` : s.field);

interface Props {
  allValues: {
    tags: string[];
    categories: string[];
    tiers: number[];
    runtimes: string[];
    families: string[];
    sizeRanges: string[];
    quants: string[];
    temperatures: number[];
  };
}

export function FilterBar({ allValues }: Props) {
  const search = useSearch({ strict: false }) as SearchState;
  const navigate = useNavigate();
  const [presetName, setPresetName] = useState(search.preset ?? "");

  useEffect(() => { seedIfEmpty(); }, []);
  useEffect(() => { setPresetName(search.preset ?? ""); }, [search.preset]);

  const setSearch = useCallback((patch: Partial<SearchState>) => {
    navigate({ to: "/", search: (prev) => ({ ...prev, ...patch }) as never });
  }, [navigate]);

  const updateMulti = (key: keyof SearchState) => (values: string[]) =>
    setSearch({ [key]: values.length === 0 ? undefined : values.join(",") } as Partial<SearchState>);

  const currentSort = parseSort(search.sort);
  const presets = loadPresets();

  return (
    <div className="filter-bar">
      <div className="filter-row">
        <Chip label="Tags" all={allValues.tags} selected={csv(search.tags)} onChange={updateMulti("tags")} />
        <Chip label="Category" all={allValues.categories} selected={csv(search.category)} onChange={updateMulti("category")} />
        <Chip label="Tier" all={allValues.tiers.map(String)} selected={csv(search.tier)} onChange={updateMulti("tier")} />
        <Chip label="Runtime" all={allValues.runtimes} selected={csv(search.runtime)} onChange={updateMulti("runtime")} />
        <Chip label="Family" all={allValues.families} selected={csv(search.family)} onChange={updateMulti("family")} />
        <Chip label="Size" all={allValues.sizeRanges} selected={csv(search.sizeRange)} onChange={updateMulti("sizeRange")} />
        <Chip label="Quant" all={allValues.quants} selected={csv(search.quant)} onChange={updateMulti("quant")} />
        <Chip label="Temp" all={allValues.temperatures.map(String)} selected={csv(search.temperature)} onChange={updateMulti("temperature")} />
      </div>

      <div className="filter-row">
        <label>Group by{" "}
          <select value={search.groupBy ?? "model"} onChange={(e) => setSearch({ groupBy: e.target.value as GroupBy })}>
            <option value="model">model · runtime · quant</option>
            <option value="modelOnly">model</option>
            <option value="tag">tag</option>
            <option value="category">category</option>
            <option value="prompt">prompt/scenario</option>
            <option value="runtime">runtime</option>
            <option value="family">family</option>
          </select>
        </label>

        <label>Sort by{" "}
          <select value={currentSort.field} onChange={(e) =>
            setSearch({ sort: sortString({ ...currentSort, field: e.target.value as Sort["field"] }) })
          }>
            <option value="meanScore">mean score</option>
            <option value="passRate">pass rate</option>
            <option value="generation_tps">gen tps</option>
            <option value="peak_memory_gb">peak mem</option>
            <option value="wall_time_sec">wall time</option>
            <option value="name">name</option>
            <option value="tier">tier</option>
          </select>
        </label>
        <button onClick={() =>
          setSearch({ sort: sortString({ ...currentSort, dir: currentSort.dir === "asc" ? "desc" : "asc" }) })
        }>
          {currentSort.dir === "asc" ? "↑" : "↓"}
        </button>

        <div className="preset-menu">
          <select value={search.preset ?? ""} onChange={(e) => {
            const name = e.target.value;
            if (!name) return;
            const body = presets[name];
            if (!body) return;
            const parsed = Object.fromEntries(new URLSearchParams(body));
            navigate({ to: "/", search: { ...parsed, preset: name } as never });
          }}>
            <option value="">— preset —</option>
            {Object.keys(presets).sort().map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <button onClick={() => {
            const name = prompt("Save current filters as preset:");
            if (!name) return;
            const params = new URLSearchParams();
            for (const [k, v] of Object.entries(search)) {
              if (k === "preset" || k === "model") continue;
              if (v !== undefined && v !== "") params.set(k, String(v));
            }
            upsertPreset(name, params.toString());
            setSearch({ preset: name });
          }}>Save as…</button>
          {search.preset && (
            <>
              <button onClick={() => {
                const name = prompt("Rename preset:", search.preset);
                if (!name || name === search.preset) return;
                renamePreset(search.preset!, name);
                setSearch({ preset: name });
              }}>Rename</button>
              <button onClick={() => {
                if (!confirm(`Delete preset "${search.preset}"?`)) return;
                deletePreset(search.preset!);
                setSearch({ preset: undefined });
              }}>Delete</button>
            </>
          )}
          <button onClick={() => {
            if (!confirm("Reset all presets to defaults?")) return;
            resetPresets();
            setSearch({ preset: undefined });
          }}>Reset</button>
        </div>
      </div>
    </div>
  );
}

// Minimal multi-select chip — click the label to open a popover of checkboxes.
function Chip({ label, all, selected, onChange }: {
  label: string; all: string[]; selected: string[]; onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <div className="chip">
      <button onClick={() => setOpen((o) => !o)}>
        {label}{selected.length > 0 ? ` · ${selected.length}` : ""}
      </button>
      {open && (
        <div className="chip-popover" onMouseLeave={() => setOpen(false)}>
          {all.map((v) => (
            <label key={v}>
              <input type="checkbox" checked={selected.includes(v)} onChange={() => toggle(v)} />
              {v}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add CSS**

Append to `webapp/public/styles.css`:

```css
.filter-bar { padding: 12px 16px; border-bottom: 1px solid #333; background: #111; }
.filter-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 8px; }
.filter-row:last-child { margin-bottom: 0; }
.chip { position: relative; }
.chip button { background: #222; color: #ddd; border: 1px solid #333; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; }
.chip-popover { position: absolute; top: 100%; left: 0; background: #1a1a1a; border: 1px solid #333; padding: 8px; border-radius: 4px; z-index: 10; min-width: 180px; max-height: 280px; overflow-y: auto; margin-top: 4px; }
.chip-popover label { display: block; font-size: 12px; padding: 2px 0; color: #ddd; cursor: pointer; }
.chip-popover input { margin-right: 6px; }
.preset-menu { display: flex; gap: 4px; margin-left: auto; }
.preset-menu select, .preset-menu button { background: #222; color: #ddd; border: 1px solid #333; padding: 4px 8px; border-radius: 4px; font-size: 12px; cursor: pointer; }
```

- [ ] **Step 3: Commit (typecheck deferred until index.tsx is rewritten in Task 15)**

```bash
git add webapp/src/components/FilterBar.tsx webapp/public/styles.css
git commit -m "feat(webapp): filter bar with chips, groupBy, sort, and preset menu"
```

---

## Task 10: `ResultRow` + `ResultTable`

**Files:**
- Create: `webapp/src/components/ResultRow.tsx`
- Create: `webapp/src/components/ResultTable.tsx`

- [ ] **Step 1: Create `ResultRow`**

Create `webapp/src/components/ResultRow.tsx`:

```tsx
import { CapabilityBar } from "./CapabilityBar";
import type { Row } from "../lib/pipeline";
import { scoreBand } from "../lib/constants";
import type { GroupBy } from "../lib/pipeline";

interface Props {
  row: Row;
  groupBy: GroupBy;
  onClick: () => void;
}

const showProfile = (by: GroupBy): boolean =>
  by === "model" || by === "modelOnly" || by === "family" || by === "runtime";

export function ResultRow({ row, groupBy, onClick }: Props) {
  return (
    <div className="result-row" onClick={onClick} role="button">
      <div className="result-label">{row.label}</div>
      <div className="result-profile">
        {showProfile(groupBy) ? (
          <CapabilityBar profile={row.capabilityProfile} />
        ) : (
          <TopModels runs={row.runs} />
        )}
      </div>
      <div className={`result-score cap-${scoreBand(row.meanScore)}`}>
        {row.meanScore.toFixed(2)}
      </div>
      <div className="result-pass">{Math.round(row.passRate * 100)}%</div>
      <div className="result-arrow">▸</div>
    </div>
  );
}

// When grouping by tag/category/prompt, the profile bar is replaced by
// a mini-list of the top 3 models inside this group.
function TopModels({ runs }: { runs: Row["runs"] }) {
  const byModel = new Map<string, { sum: number; count: number }>();
  for (const r of runs) {
    const prev = byModel.get(r.model);
    if (prev) { prev.sum += r.score; prev.count += 1; }
    else byModel.set(r.model, { sum: r.score, count: 1 });
  }
  const top = Array.from(byModel.entries())
    .map(([m, v]) => ({ model: m, mean: v.sum / v.count }))
    .sort((a, b) => b.mean - a.mean)
    .slice(0, 3);
  return (
    <div className="top-models">
      {top.map((t) => (
        <span key={t.model} className={`top-model cap-${scoreBand(t.mean)}`}>
          {t.model} · {t.mean.toFixed(2)}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `ResultTable`**

Create `webapp/src/components/ResultTable.tsx`:

```tsx
import type { Row, GroupBy } from "../lib/pipeline";
import { ResultRow } from "./ResultRow";

interface Props {
  rows: Row[];
  groupBy: GroupBy;
  onRowClick: (row: Row) => void;
}

export function ResultTable({ rows, groupBy, onRowClick }: Props) {
  if (rows.length === 0) {
    return <div className="result-empty">No results match the current filters.</div>;
  }
  return (
    <div className="result-table">
      <div className="result-header">
        <div>NAME</div>
        <div>{(groupBy === "model" || groupBy === "modelOnly" || groupBy === "family" || groupBy === "runtime")
          ? "CAPABILITY PROFILE" : "TOP MODELS"}</div>
        <div>SCORE</div>
        <div>PASS</div>
        <div />
      </div>
      {rows.map((r) => (
        <ResultRow key={r.key} row={r} groupBy={groupBy} onClick={() => onRowClick(r)} />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Add CSS**

Append to `webapp/public/styles.css`:

```css
.result-table { padding: 0 16px; }
.result-header, .result-row {
  display: grid;
  grid-template-columns: 1fr 280px 70px 60px 20px;
  gap: 12px; align-items: center;
  padding: 8px 12px; font-size: 12px;
}
.result-header { font-weight: bold; color: #888; font-size: 10px; border-bottom: 1px solid #333; text-transform: uppercase; }
.result-row { border-bottom: 1px solid #222; cursor: pointer; }
.result-row:hover { background: #1a1a1a; }
.result-label { color: #ddd; }
.result-score { text-align: right; font-weight: bold; background: transparent !important; color: inherit; padding: 2px 6px; border-radius: 3px; }
.result-score.cap-green       { color: #4ade80; }
.result-score.cap-yellow-green { color: #a3e635; }
.result-score.cap-yellow      { color: #facc15; }
.result-score.cap-orange      { color: #fb923c; }
.result-score.cap-red         { color: #ef4444; }
.result-pass { text-align: right; color: #aaa; }
.result-arrow { color: #666; }
.result-empty { padding: 40px; text-align: center; color: #666; }
.top-models { display: flex; gap: 6px; flex-wrap: wrap; font-size: 11px; }
.top-model { padding: 1px 6px; background: #222; border-radius: 3px; }
```

- [ ] **Step 4: Commit**

```bash
git add webapp/src/components/ResultRow.tsx webapp/src/components/ResultTable.tsx webapp/public/styles.css
git commit -m "feat(webapp): result table + row with inline capability bar"
```

---

## Task 11: `ModelDetailPanel`

**Files:**
- Create: `webapp/src/components/ModelDetailPanel.tsx`

- [ ] **Step 1: Create the panel**

Create `webapp/src/components/ModelDetailPanel.tsx`:

```tsx
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { BenchmarkResult } from "../lib/data";
import { PASS_THRESHOLD, CAPABILITY_TAGS, scoreBand } from "../lib/constants";

interface Props {
  model: string;
  data: BenchmarkResult[];
  onClose: () => void;
}

export function ModelDetailPanel({ model, data, onClose }: Props) {
  const [tab, setTab] = useState<"all" | "prompts" | "scenarios">("all");
  const navigate = useNavigate();

  const runs = useMemo(() => data.filter((d) => d.model === model), [data, model]);
  const filtered = useMemo(() => {
    if (tab === "prompts") return runs.filter((r) => !r.is_scenario);
    if (tab === "scenarios") return runs.filter((r) => r.is_scenario);
    return runs;
  }, [runs, tab]);

  const mean = runs.length === 0 ? 0 : runs.reduce((s, r) => s + r.score, 0) / runs.length;
  const pass = runs.length === 0 ? 0 : runs.filter((r) => r.score >= PASS_THRESHOLD).length / runs.length;

  // Mean per capability tag across this model's runs.
  const profile = useMemo(() => {
    const byTag = new Map<string, number[]>();
    for (const r of runs) for (const t of r.tags) {
      const a = byTag.get(t); if (a) a.push(r.score); else byTag.set(t, [r.score]);
    }
    const out: Record<string, { mean: number; count: number }> = {};
    for (const [t, ss] of byTag) out[t] = { mean: ss.reduce((s, v) => s + v, 0) / ss.length, count: ss.length };
    return out;
  }, [runs]);

  const first = runs[0];

  return (
    <>
      <div className="panel-scrim" onClick={onClose} />
      <aside className="model-panel">
        <header className="model-panel-header">
          <button className="panel-close" onClick={onClose} aria-label="close">×</button>
          <h2>{model}</h2>
          {first && <div className="panel-subtitle">{first.runtime} · {first.quant} · temp {first.temperature}</div>}
          <div className="panel-metrics">
            <span className={`cap-${scoreBand(mean)}`}>score {mean.toFixed(2)}</span>
            <span>pass {Math.round(pass * 100)}%</span>
          </div>
        </header>

        <section className="panel-section">
          <h3>Capability profile</h3>
          <div className="panel-profile">
            {CAPABILITY_TAGS.map((tag) => {
              const cell = profile[tag];
              return (
                <div key={tag} className="panel-profile-row">
                  <span className="panel-profile-name">{tag}</span>
                  <div className="panel-profile-bar">
                    {cell !== undefined && (
                      <div
                        className={`cap-${scoreBand(cell.mean)}`}
                        style={{ width: `${Math.round(cell.mean * 100)}%`, height: "100%" }}
                      />
                    )}
                  </div>
                  <span className="panel-profile-value">
                    {cell !== undefined ? cell.mean.toFixed(2) : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel-section">
          <div className="panel-tabs">
            <button className={tab === "all" ? "active" : ""} onClick={() => setTab("all")}>All ({runs.length})</button>
            <button className={tab === "prompts" ? "active" : ""} onClick={() => setTab("prompts")}>Prompts</button>
            <button className={tab === "scenarios" ? "active" : ""} onClick={() => setTab("scenarios")}>Scenarios</button>
          </div>
          <div className="panel-runs">
            {filtered.map((r) => (
              <button
                key={r.prompt_name + r.temperature}
                className="panel-run"
                onClick={() => navigate({ to: "/run/$model/$name", params: { model, name: r.prompt_name } })}
              >
                <span>{r.prompt_name}</span>
                <span className="panel-run-tier">t{r.tier}</span>
                <span className={`cap-${scoreBand(r.score)} panel-run-score`}>{r.score.toFixed(2)}</span>
              </button>
            ))}
          </div>
        </section>
      </aside>
    </>
  );
}
```

- [ ] **Step 2: Add CSS**

Append to `webapp/public/styles.css`:

```css
.panel-scrim { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 50; }
.model-panel { position: fixed; top: 0; right: 0; bottom: 0; width: 560px; max-width: 90vw; background: #151515; border-left: 1px solid #333; z-index: 51; overflow-y: auto; color: #ddd; }
.model-panel-header { padding: 16px; border-bottom: 1px solid #222; position: relative; }
.model-panel-header h2 { margin: 0; font-size: 16px; }
.panel-close { position: absolute; top: 8px; right: 12px; background: none; border: none; color: #888; font-size: 20px; cursor: pointer; }
.panel-subtitle { color: #888; font-size: 11px; margin-top: 4px; }
.panel-metrics { margin-top: 8px; display: flex; gap: 12px; font-size: 12px; }
.panel-metrics .cap-green { color: #4ade80; } .panel-metrics .cap-yellow-green { color: #a3e635; } .panel-metrics .cap-yellow { color: #facc15; } .panel-metrics .cap-orange { color: #fb923c; } .panel-metrics .cap-red { color: #ef4444; }
.panel-section { padding: 16px; border-bottom: 1px solid #222; }
.panel-section h3 { margin: 0 0 8px; font-size: 11px; text-transform: uppercase; color: #888; letter-spacing: 0.5px; }
.panel-profile-row { display: grid; grid-template-columns: 130px 1fr 40px; gap: 8px; align-items: center; font-size: 11px; padding: 2px 0; }
.panel-profile-name { color: #aaa; }
.panel-profile-bar { height: 8px; background: #222; border-radius: 2px; overflow: hidden; }
.panel-profile-value { text-align: right; color: #888; }
.panel-tabs { display: flex; gap: 4px; margin-bottom: 8px; }
.panel-tabs button { background: #222; color: #aaa; border: 1px solid #333; padding: 3px 10px; border-radius: 3px; font-size: 11px; cursor: pointer; }
.panel-tabs button.active { background: #333; color: #fff; }
.panel-runs { display: flex; flex-direction: column; }
.panel-run { display: grid; grid-template-columns: 1fr 40px 50px; align-items: center; gap: 8px; background: transparent; border: none; color: #ddd; padding: 6px 8px; font-size: 11px; text-align: left; cursor: pointer; border-radius: 3px; }
.panel-run:hover { background: #1a1a1a; }
.panel-run-tier { color: #666; }
.panel-run-score { text-align: right; font-weight: bold; }
```

- [ ] **Step 3: Commit**

```bash
git add webapp/src/components/ModelDetailPanel.tsx webapp/public/styles.css
git commit -m "feat(webapp): model detail side panel with capability profile and runs list"
```

---

## Task 12: `PromptView` + `ScenarioView` + `EventLog` + `RunHeader`

**Files:**
- Create: `webapp/src/components/RunHeader.tsx`
- Create: `webapp/src/components/PromptView.tsx`
- Create: `webapp/src/components/EventLog.tsx`
- Create: `webapp/src/components/ScenarioView.tsx`

- [ ] **Step 1: Create `RunHeader`**

Create `webapp/src/components/RunHeader.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import { scoreBand } from "../lib/constants";
import type { BenchmarkResult } from "../lib/data";

export function RunHeader({ rec }: { rec: BenchmarkResult }) {
  return (
    <header className="run-header">
      <Link to="/" className="run-back">◂ Back</Link>
      <h1>{rec.model} · {rec.prompt_name}</h1>
      <div className="run-meta">
        tier {rec.tier} · tags [{rec.tags.join(", ") || "—"}]
        <span className={`run-score cap-${scoreBand(rec.score)}`}>{rec.score.toFixed(2)}</span>
      </div>
      <div className="run-meta-small">
        {rec.runtime} · {rec.quant} · temp {rec.temperature} · {rec.is_scenario ? "scenario" : "prompt"}
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Create `PromptView`**

Create `webapp/src/components/PromptView.tsx`:

```tsx
import { useState } from "react";
import type { BenchmarkResult } from "../lib/data";
import { stripThinkingTags, extractThinkBlock } from "../lib/strip-thinking";

export function PromptView({ rec }: { rec: BenchmarkResult }) {
  const [showThink, setShowThink] = useState(false);
  const reasoning = extractThinkBlock(rec.output);
  const stripped = stripThinkingTags(rec.output);

  return (
    <div className="prompt-view">
      <section>
        <h3>Score detail</h3>
        <pre className="run-details">{rec.score_details || "(none)"}</pre>
      </section>
      <section>
        <h3>Prompt</h3>
        <pre className="run-text">{rec.prompt_text || "(prompt not archived)"}</pre>
      </section>
      <section>
        <h3>Output</h3>
        {reasoning !== null && (
          <div className="thinking">
            <button onClick={() => setShowThink((v) => !v)}>
              {showThink ? "▾" : "▸"} reasoning ({reasoning.length} chars)
            </button>
            {showThink && <pre className="run-text run-thinking">{reasoning}</pre>}
          </div>
        )}
        <pre className="run-text">{stripped}</pre>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Create `EventLog`**

Create `webapp/src/components/EventLog.tsx`:

```tsx
import { useState } from "react";
import type { AgentEvent } from "../lib/data";

const TYPES: AgentEvent["event"][] = ["tool_call", "tool_result", "tool_error", "turn_end", "error", "connection"];

export function EventLog({ events }: { events: AgentEvent[] }) {
  const [enabled, setEnabled] = useState<Set<string>>(new Set(TYPES));
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const visible = events.filter((e) => enabled.has(e.event));
  const toggleType = (t: string) => {
    const next = new Set(enabled);
    if (next.has(t)) next.delete(t); else next.add(t);
    setEnabled(next);
  };
  const toggleRow = (i: number) => {
    const next = new Set(expanded);
    if (next.has(i)) next.delete(i); else next.add(i);
    setExpanded(next);
  };

  return (
    <div className="event-log">
      <div className="event-filters">
        {TYPES.map((t) => (
          <label key={t}>
            <input type="checkbox" checked={enabled.has(t)} onChange={() => toggleType(t)} />
            {t}
          </label>
        ))}
        <span className="event-count">{visible.length} / {events.length} events</span>
      </div>
      <div className="event-rows">
        {visible.map((e, i) => (
          <div key={i} className={`event-row event-${e.event}`} onClick={() => toggleRow(i)}>
            <span className="event-tick">t={e.tick}</span>
            <span className="event-type">{e.event}</span>
            <span className="event-summary">{summarize(e)}</span>
            {expanded.has(i) && (
              <pre className="event-data">{JSON.stringify(e.data, null, 2)}</pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const summarize = (e: AgentEvent): string => {
  if (e.data === null || typeof e.data !== "object") return "";
  const d = e.data as Record<string, unknown>;
  if ("tool" in d) return String(d.tool);
  if ("message" in d) return String(d.message).slice(0, 80);
  const keys = Object.keys(d);
  return keys.length === 0 ? "" : `{${keys.join(", ")}}`;
};
```

- [ ] **Step 4: Create `ScenarioView`**

Create `webapp/src/components/ScenarioView.tsx`:

```tsx
import type { BenchmarkResult } from "../lib/data";
import { EventLog } from "./EventLog";

const terminationBand = (r: BenchmarkResult["termination_reason"]): string => {
  if (r === "completed") return "green";
  if (r === "error") return "red";
  return "yellow"; // wall_clock / tokens / tool_calls = ran out of budget
};

export function ScenarioView({ rec }: { rec: BenchmarkResult }) {
  const events = rec.events ?? [];
  return (
    <div className="scenario-view">
      <section className="scenario-stats">
        <Stat label="Score" value={rec.score.toFixed(2)} />
        <Stat label="Termination" value={rec.termination_reason ?? "—"} bandColor={terminationBand(rec.termination_reason)} />
        <Stat label="Tool calls" value={rec.tool_call_count !== null ? String(rec.tool_call_count) : "—"} />
        <Stat label="Wall time" value={`${rec.wall_time_sec.toFixed(0)}s`} />
      </section>

      {events.length > 0 && (
        <section>
          <h3>Timeline ({events.length} events)</h3>
          <TimelineScrubber events={events} />
        </section>
      )}

      {events.length > 0 && (
        <section>
          <h3>Event log</h3>
          <EventLog events={events} />
        </section>
      )}

      {rec.final_player_stats !== null && (
        <section>
          <h3>Final player stats</h3>
          <pre className="run-text">{JSON.stringify(rec.final_player_stats, null, 2)}</pre>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, bandColor }: { label: string; value: string; bandColor?: string }) {
  return (
    <div className="scenario-stat">
      <div className="scenario-stat-label">{label}</div>
      <div className={`scenario-stat-value ${bandColor ? `cap-${bandColor}` : ""}`}>{value}</div>
    </div>
  );
}

function TimelineScrubber({ events }: { events: BenchmarkResult["events"] }) {
  if (events === null || events.length === 0) return null;
  const typeColor = (t: string) =>
    t === "tool_error" ? "#fb923c"
      : t === "error" ? "#ef4444"
      : t === "turn_end" ? "#666"
      : t === "connection" ? "#60a5fa"
      : "#4ade80";
  return (
    <div className="timeline">
      {events.map((e, i) => (
        <div
          key={i}
          className="timeline-tick"
          style={{
            left: `${(i / Math.max(events.length - 1, 1)) * 100}%`,
            background: typeColor(e.event),
          }}
          title={`t=${e.tick} ${e.event}`}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Add CSS**

Append to `webapp/public/styles.css`:

```css
.run-header { padding: 16px; border-bottom: 1px solid #333; }
.run-header h1 { margin: 4px 0 0; font-size: 18px; }
.run-back { color: #6bf; text-decoration: none; font-size: 12px; }
.run-meta { margin-top: 6px; font-size: 12px; color: #aaa; }
.run-meta-small { font-size: 11px; color: #666; margin-top: 2px; }
.run-score { margin-left: 12px; padding: 2px 8px; border-radius: 3px; background: transparent !important; font-weight: bold; }
.prompt-view section, .scenario-view section { padding: 12px 16px; border-bottom: 1px solid #222; }
.prompt-view h3, .scenario-view h3 { font-size: 11px; text-transform: uppercase; color: #888; margin: 0 0 6px; }
.run-text, .run-details { background: #0a0a0a; border: 1px solid #222; padding: 8px; border-radius: 3px; font-size: 12px; white-space: pre-wrap; word-break: break-word; color: #ddd; margin: 0; max-height: 600px; overflow-y: auto; }
.run-thinking { color: #888; }
.thinking button { background: transparent; border: none; color: #888; cursor: pointer; padding: 0; font-size: 11px; margin-bottom: 6px; }
.scenario-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.scenario-stat { background: #1a1a1a; padding: 8px 10px; border-radius: 4px; border: 1px solid #222; }
.scenario-stat-label { font-size: 9px; text-transform: uppercase; color: #666; }
.scenario-stat-value { font-size: 14px; font-weight: bold; color: #ddd; }
.scenario-stat-value.cap-green { color: #4ade80; } .scenario-stat-value.cap-yellow { color: #facc15; } .scenario-stat-value.cap-red { color: #ef4444; }
.timeline { position: relative; height: 14px; background: #0a0a0a; border: 1px solid #222; border-radius: 3px; }
.timeline-tick { position: absolute; top: 3px; width: 2px; height: 8px; }
.event-log { font-family: monospace; font-size: 11px; }
.event-filters { display: flex; gap: 8px; flex-wrap: wrap; padding: 6px 0; font-size: 11px; color: #aaa; }
.event-filters label { display: inline-flex; align-items: center; gap: 4px; }
.event-count { margin-left: auto; color: #666; font-family: sans-serif; }
.event-rows { max-height: 500px; overflow-y: auto; border: 1px solid #222; border-radius: 3px; background: #0a0a0a; }
.event-row { display: grid; grid-template-columns: 50px 90px 1fr; padding: 3px 6px; cursor: pointer; border-bottom: 1px solid #1a1a1a; }
.event-row:hover { background: #151515; }
.event-tick { color: #6bf; }
.event-type { color: #888; }
.event-tool_error .event-type, .event-error .event-type { color: #fb923c; }
.event-data { grid-column: 1 / -1; margin-top: 4px; background: #050505; padding: 6px; color: #aaa; white-space: pre-wrap; }
```

- [ ] **Step 6: Commit**

```bash
git add webapp/src/components/RunHeader.tsx webapp/src/components/PromptView.tsx webapp/src/components/EventLog.tsx webapp/src/components/ScenarioView.tsx webapp/public/styles.css
git commit -m "feat(webapp): run detail components (prompt/scenario/event log)"
```

---

## Task 13: `RunPage` route at `/run/:model/:name`

**Files:**
- Create: `webapp/src/routes/run.$model.$name.tsx`

- [ ] **Step 1: Create the route**

Create `webapp/src/routes/run.$model.$name.tsx`:

```tsx
import { createFileRoute, useParams } from "@tanstack/react-router";
import { DATA } from "../lib/data-dev";
import { RunHeader } from "../components/RunHeader";
import { PromptView } from "../components/PromptView";
import { ScenarioView } from "../components/ScenarioView";

export const Route = createFileRoute("/run/$model/$name")({
  component: RunPage,
});

function RunPage() {
  const { model, name } = useParams({ from: "/run/$model/$name" });
  const decodedModel = decodeURIComponent(model);
  const matches = DATA.filter((d) => d.model === decodedModel && d.prompt_name === name);

  if (matches.length === 0) {
    return (
      <div className="run-not-found">
        <RunHeader rec={{
          model: decodedModel, runtime: "", quant: "", prompt_name: name, category: "",
          tier: 0, temperature: 0, tags: [], is_scenario: false, score: 0, score_details: "",
          prompt_tokens: 0, generation_tokens: 0, prompt_tps: 0, generation_tps: 0,
          wall_time_sec: 0, peak_memory_gb: 0, output: "", prompt_text: "",
          scenario_name: null, termination_reason: null, tool_call_count: null,
          final_player_stats: null, events: null,
        }} />
        <div style={{ padding: 16 }}>No run found for {decodedModel} / {name}.</div>
      </div>
    );
  }

  // Most recent first; simple heuristic — runs in the data array are in archive order.
  const rec = matches[matches.length - 1];

  return (
    <div className="run-page">
      <RunHeader rec={rec} />
      {rec.is_scenario ? <ScenarioView rec={rec} /> : <PromptView rec={rec} />}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add webapp/src/routes/run.$model.$name.tsx
git commit -m "feat(webapp): /run/:model/:name route with prompt + scenario branches"
```

---

# Phase D — Wire up and clean up

## Task 14: Rewrite `routes/index.tsx`

**Files:**
- Modify: `webapp/src/routes/index.tsx`

- [ ] **Step 1: Overwrite the file**

Overwrite `webapp/src/routes/index.tsx`:

```tsx
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo } from "react";
import { DATA, uniqueSorted, modelFamily, modelSizeRange, SIZE_RANGES } from "../lib/data-dev";
import { FilterBar, parseFilters, parseSort } from "../components/FilterBar";
import { ResultTable } from "../components/ResultTable";
import { ModelDetailPanel } from "../components/ModelDetailPanel";
import type { GroupBy, Row } from "../lib/pipeline";
import { applyFilters, groupRows, aggregate, sortRows } from "../lib/pipeline";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const search = useSearch({ strict: false }) as Record<string, string | undefined>;
  const navigate = useNavigate();

  const allValues = useMemo(() => ({
    tags: Array.from(new Set(DATA.flatMap((d) => d.tags))).sort(),
    categories: uniqueSorted(DATA, "category") as string[],
    tiers: (uniqueSorted(DATA, "tier") as number[]).sort((a, b) => a - b),
    runtimes: uniqueSorted(DATA, "runtime") as string[],
    families: Array.from(new Set(DATA.map((d) => modelFamily(d.model)))).sort(),
    sizeRanges: SIZE_RANGES.map((r) => r.label).filter((label) =>
      DATA.some((d) => modelSizeRange(d.model)?.label === label)
    ),
    quants: uniqueSorted(DATA, "quant") as string[],
    temperatures: (uniqueSorted(DATA, "temperature") as number[]).sort((a, b) => a - b),
  }), []);

  const filters = parseFilters(search as never);
  const groupBy = (search.groupBy ?? "model") as GroupBy;
  const sort = parseSort(search.sort);
  const panelModel = search.model;

  const rows: Row[] = useMemo(() => {
    const filtered = applyFilters(DATA, filters);
    const grouped = groupRows(filtered, groupBy);
    const aggregated = aggregate(grouped, groupBy);
    return sortRows(aggregated, sort);
  }, [filters, groupBy, sort]);

  const handleRowClick = (row: Row) => {
    // Row click: open panel when grouping by model-ish; route to run otherwise.
    if (groupBy === "model" || groupBy === "modelOnly" || groupBy === "family" || groupBy === "runtime") {
      // For model/modelOnly, clicking opens the panel keyed on the model name.
      const model = row.runs[0]?.model;
      if (model) navigate({ to: "/", search: (s) => ({ ...s, model }) as never });
    } else if (groupBy === "prompt") {
      // Row IS a prompt/scenario — go to the first model's run page
      const r = row.runs[0];
      if (r) navigate({ to: "/run/$model/$name", params: { model: r.model, name: r.prompt_name } });
    } else {
      // tag / category — stays on page; filter to that group's member
      const patch: Record<string, string> =
        groupBy === "tag" ? { tags: row.key } :
        groupBy === "category" ? { category: row.key } : {};
      navigate({ to: "/", search: (s) => ({ ...s, ...patch }) as never });
    }
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
      <ResultTable rows={rows} groupBy={groupBy} onRowClick={handleRowClick} />
      {panelModel !== undefined && panelModel !== "" && (
        <ModelDetailPanel model={panelModel} data={DATA} onClose={closePanel} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add shell CSS**

Append to `webapp/public/styles.css`:

```css
body { margin: 0; background: #0a0a0a; color: #ddd; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.app-header { padding: 12px 16px; border-bottom: 1px solid #222; }
.app-header h1 { margin: 0; font-size: 16px; }
.app-subtitle { font-size: 11px; color: #888; margin-top: 2px; }
```

- [ ] **Step 3: Commit**

```bash
git add webapp/src/routes/index.tsx webapp/public/styles.css
git commit -m "feat(webapp): rewrite home route around filter-driven unified list"
```

---

## Task 15: Remove retired components and re-verify

**Files:**
- Delete: `webapp/src/components/Leaderboard.tsx`
- Delete: `webapp/src/components/HeatmapTable.tsx`
- Delete: `webapp/src/components/ScatterPlot.tsx`
- Delete: `webapp/src/components/DetailPanel.tsx`
- Delete: `webapp/src/components/ModelSelector.tsx`
- Delete: `webapp/src/components/FamilyFilter.tsx`
- Delete: `webapp/src/components/SizeFilter.tsx`

- [ ] **Step 1: Confirm they are no longer imported**

```bash
grep -rln "Leaderboard\|HeatmapTable\|ScatterPlot\|DetailPanel\|ModelSelector\|FamilyFilter\|SizeFilter" webapp/src/
```

Expected: no matches in `webapp/src/` (node_modules and stale routes excluded).

- [ ] **Step 2: Delete the files**

```bash
rm webapp/src/components/Leaderboard.tsx \
   webapp/src/components/HeatmapTable.tsx \
   webapp/src/components/ScatterPlot.tsx \
   webapp/src/components/DetailPanel.tsx \
   webapp/src/components/ModelSelector.tsx \
   webapp/src/components/FamilyFilter.tsx \
   webapp/src/components/SizeFilter.tsx
```

- [ ] **Step 3: Run typecheck**

```bash
cd webapp && npx tsc --noEmit && cd ..
```

Expected: clean. If errors remain, they are in `index.tsx` or a new component — fix them by pointing at the new exports only.

- [ ] **Step 4: Run full test suite**

```bash
npm run test
```

Expected: 501 existing + 5 strip-thinking + ~12 pipeline + 2 data + 5 preset + 4 webapp-contract = ~530 tests, all green.

- [ ] **Step 5: Run biome lint**

```bash
npm run lint
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(webapp): remove retired v1 components"
```

---

## Task 16: Smoke test the webapp end-to-end

**Files:** none (manual verification)

- [ ] **Step 1: Regenerate `data.js` from the existing archive**

```bash
./bench report
```

Expected: writes `webapp/src/data/data.js` without errors. (If the archive is empty in this worktree, use `--archive-dir /path/to/populated/archive`.)

- [ ] **Step 2: Start the dev server**

```bash
npm run -C webapp dev
```

- [ ] **Step 3: Walk through each seeded preset**

Open the URL printed by vite (typically `http://localhost:3000`).

For each of:
- Task-first: agentic tier 3
- Model-first: all
- Capability leaderboard
- Needs review

…verify:
  - preset loads without a blank page
  - row count is non-zero (unless the archive genuinely has no matching rows)
  - clicking a model row opens the side panel
  - clicking a run inside the panel routes to `/run/:model/:name`
  - scenario runs render `ScenarioView` with the event log; prompt runs render `PromptView`
  - the back arrow returns to the list with the preset still applied (URL preserves it)

- [ ] **Step 4: Build the report bundle**

```bash
npm run -C webapp build:report
```

Expected: builds without error. The static bundle under `webapp/dist-report/` can be opened via `file://`.

- [ ] **Step 5: No commit (manual verification)** — task is complete when the four presets work end-to-end.

---

## Post-implementation checklist

- [ ] All tests pass (`npm run test`) — target: ~530 total.
- [ ] Typecheck clean (`npm run typecheck` and `npm run -C webapp typecheck`).
- [ ] Lint clean (`npm run lint`).
- [ ] `./bench report` regenerates `data.js` without errors.
- [ ] Dev server renders the new UI.
- [ ] Scenario drill-down shows events, termination, tool count, final stats.
- [ ] Prompt drill-down shows prompt text + output + collapsible reasoning.
- [ ] Preset save/load/rename/delete round-trip via localStorage.
- [ ] Back-button from `/run/:model/:name` returns to the list with URL state intact.
- [ ] Legacy `data.js` (missing new fields) loads via `normalizeRecord` without runtime errors.

---

## Out of scope for this plan (do NOT build)

- Side-by-side model comparison (`?compare=modelB`)
- Scenario replay animation
- Query DSL / boolean filter logic / rule builder UI
- Shared/cloud presets
- Editable tags in the webapp (tags are YAML-authored; edit the corpus file)
- Configurable pass threshold (hardcoded 0.5 in `PASS_THRESHOLD`)
- Lazy-loading of `events[]` from separate JSON files (only if `data.js` size grows too large)
