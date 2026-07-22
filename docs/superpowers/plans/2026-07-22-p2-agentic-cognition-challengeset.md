# P2: Agentic-Cognition Challengeset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pure, total rendering layer under `scripts/author/agentic/` that turns three authored `Scenario` fact manifests into 54 challenge items (3 scenarios x 6 challenges x 3 context treatments) and emits them as `challenges/agentic-cognition.yaml`.

**Architecture:** A `Scenario` is a seeded `EnvironmentState` struct plus treatment-invariant payloads, a flat list of `Fact`s each carrying a match probe, an authored T3 narrative function, and an `Answers` block from which every mechanical check is derived. Three treatment renderers (T1 raw telemetry, T2 labeled digest, T3 narrative brief) turn the environment into a context block; six verbatim challenge templates splice that context with the payloads; a check-derivation module turns `Answers` into `constraint` check declarations plus the plain-English criteria that the turn-2 self-scoring prompt enumerates. A build-time equivalence assertion requires every fact probe to match all three renderings. YAML emission is a sink in `build.ts` that the layer itself knows nothing about.

**Tech Stack:** TypeScript (ESM, `tsx`), Vitest 4 (via a dedicated config — these tests are outside `npm test`), the `yaml` package via the existing `scripts/author/emit.ts` helpers.

## Global Constraints

- **Purity.** Every function in `scripts/author/agentic/` except `build.ts` is pure and total: no `fs`, no `Date.now()`, no `Math.random()`. Randomness comes only from a seed passed as a parameter.
- **Renderer signature.** The layer's contract is `renderScenario(scenario: Scenario): readonly RenderedVariant[]`, returning 18 variants. YAML is one sink; the layer must be usable without knowing YAML exists.
- **Arithmetic.** 3 scenarios x 6 challenges x 3 treatments = **54 items**. Each scenario renders 18. Item names are `agentic_s{N}_c{N}_t{N}`, e.g. `agentic_s1_c1_t1`.
- **Boundary — files this project may create or modify:** anything under `scripts/author/agentic/`, and `challenges/agentic-cognition.yaml`. Nothing else. Do not touch `src/**`, `webapp/**`, other `challenges/*.yaml`, `configs.yaml`, `system-prompts.yaml`, `vitest.config.ts`, or `package.json`.
- **No system prompts.** System prompts are an LLM-configuration concern owned by `system-prompts.yaml`. Never inline one into a challenge item, and never add a `system:` key.
- **No new scorer type and no new check kind.** Every item uses `scorer: constraint`. Checks are drawn from the 20 kinds in `src/schema/constraints.ts` plus the one new kind P1 is building (`self_score_matches`).
- **P1 dependency (given, do not redesign).** P1 adds an optional `followUpPrompt?: string` field on every challenge item, and a `constraint` check kind `self_score_matches` with a single parameter `extract: string` whose capture group 1 is the model's self-reported score. It reads the turn-2 output, evaluates after all other checks in its item, and passes iff the extracted value equals `(other checks passed) / (other checks total)` with the denominator excluding itself, compared exactly on the fraction rounded to 3 decimals.
- **Cannot test end to end.** Until P1 lands, the emitted YAML will not load through `./bench`. All tests in this plan assert against this layer's own rendering output, never against harness execution.
- **Every item carries exactly 5 mechanical checks plus 1 calibration check — 6 constraints, denominator 5.** `self_score_matches` parses the captured group as a plain decimal and compares it exactly to the fraction rounded to 3 decimals, so the denominator must never produce a repeating decimal. 5 yields only `0.0 / 0.2 / 0.4 / 0.6 / 0.8 / 1.0`, all exact. Denominators of 3, 6, 7 or 9 are forbidden: a model that correctly identifies one passing check out of three would have to emit `0.333` and round exactly as we do, which measures decimal-rounding behaviour rather than calibration. This holds for **all 54 items** without exception; if a challenge's natural check set lands on 6, merge two checks into one regex with lookaheads rather than relaxing the rule. A test in Task 15 asserts the count on every emitted item.
- **The turn-2 prompt requests a plain decimal.** `SELF_SCORE: 0.4` — never `2/5`, never `40%`, never prose. The prompt states the six legal values explicitly so no rounding judgement is ever required.
- **Checks are derived, never hand-written per variant.** Every check declaration is computed from the scenario's `Answers` and `EnvironmentState`. Changing a scenario's fuel figure must change all 18 of that scenario's items' checks automatically.
- **Information equivalence is a build-time assertion.** Every manifest fact carries a probe; the assertion is that every probe matches all three rendered treatments. A fact whose probe fails under any treatment fails the test run. This is the single most important validity control in the project.
- **Probe and prose-check bias is one-directional.** Prefer false positives to false negatives. Synonym sets are enumerated generously. Case-insensitivity uses the leading `(?i)` inline-flag form supported by `translateInlineFlags` in `src/scoring/regex-flags.ts` — never the `[Cc]` case-expansion used by `wholeWordPattern` in `scripts/author/emit.ts`.
- **T3 must state scored quantities as numerals.** Prose may be as narrative as it likes, but any number a check or probe reads (fuel, hull, cargo, credits) appears as digits in all three treatments. Spelled-out numbers are the exact failure mode the equivalence assertion exists to catch.
- **Test command (these tests are NOT run by CI).** `vitest.config.ts` globs `src/**/*.test.ts` and `webapp/src/**/*.test.ts` only, so `npm test` never runs anything in this directory. Run them explicitly, from the repository root:
  ```
  npx vitest run --config scripts/author/agentic/vitest.config.ts
  ```
  State this in any handoff. Nobody should assume CI covers this layer.
- **`scripts/lint-strict.sh` greps `src/` only**, so its `try {` / throw / logging-prefix bans do not apply here. Match the surrounding `scripts/author/` style anyway: named exports, arrow-function or `function` declarations consistent with neighbours, no default exports.
- **Generated YAML carries a `# why` comment above each item**, per `suiteYaml` in `scripts/author/emit.ts`. Every emitted item gets one.
- **TDD throughout.** Failing test first, verify it fails, minimal implementation, verify it passes, commit.

## Design decisions taken by this plan

These are content decisions inside P2's ownership; they are recorded so a reader does not mistake them for drift.

1. **Archetype 1 (a location change scored as insignificant) is exercised in S2 as well as S3.** S2's environment carries a completed jump roughly two minutes before the incoming event, independent of that event. This gives archetype 1 coverage through C2's grounding checks without disturbing S2's correct C1 disposition being `NOTE`. The spec explicitly leaves this call to P2.
2. **S1's advisory is `STILL_VALID`; S2's and S3's are `STALE`.** An all-stale set would make "always answer STALE" a winning constant on C5, which is the same degeneracy the fixed scenario table exists to prevent for C1 and C3. Archetype 5 (stale-skill over-trust) is still exercised in 2 of 3 scenarios, and S1 becomes the control that catches a model with a stuck STALE key.
3. **Scenario surface details are seeded, but the seed is a parameter.** `buildS1(seed)` / `buildS2(seed)` / `buildS3(seed)` pick names and jitter numbers from fixed pools via an explicit PRNG. The emitter pins one canonical seed. Numeric jitter bands are chosen so no jitter can change a correct answer.
4. **Probes are matched by a small local matcher in this directory**, mirroring the scorer's `contains` (case-insensitive `includes`) and `regex` (leading inline-flag translation) semantics. It does not import from `src/`, which keeps the layer free of any dependency on P1's in-flight edits.

---

### Task 1: Directory scaffold, shared types, and the probe matcher

**Files:**
- Create: `scripts/author/agentic/vitest.config.ts`
- Create: `scripts/author/agentic/types.ts`
- Create: `scripts/author/agentic/probes.ts`
- Test: `scripts/author/agentic/probes.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `TreatmentKey`, `ChallengeKey`, `TREATMENTS`, `CHALLENGES`, `Probe`, `Fact`, `Resource`, `CargoItem`, `Contact`, `Poi`, `EnvironmentState`, `Payloads`, `Disposition`, `StepOutcome`, `Answers`, `Scenario`, `DerivedCheck`, `RenderedVariant` from `types.ts`; `matchesProbe(probe: Probe, text: string): boolean`, `alt(fragments: readonly string[]): string`, `flexibleNumber(n: number): string` from `probes.ts`.

- [ ] **Step 1: Write the failing test**

Create `scripts/author/agentic/probes.test.ts`:

```ts
// Probe-matching semantics mirror the constraint scorer: `contains` is a
// case-insensitive substring test, `regex` honours a leading (?i)/(?m)/(?s)
// inline flag group the way src/scoring/regex-flags.ts does.
//
// Run (outside the default src/** vitest include):
//   npx vitest run --config scripts/author/agentic/vitest.config.ts

import { describe, expect, it } from "vitest";
import { alt, flexibleNumber, matchesProbe } from "./probes.js";

describe("matchesProbe", () => {
  it("matches `contains` case-insensitively", () => {
    expect(matchesProbe({ kind: "contains", value: "Processing Core" }, "a processing_core here")).toBe(
      false,
    );
    expect(matchesProbe({ kind: "contains", value: "processing core" }, "A PROCESSING CORE")).toBe(true);
  });

  it("honours a leading (?i) inline flag in `regex`", () => {
    expect(matchesProbe({ kind: "regex", pattern: "(?i)outer\\s+belt" }, "at the OUTER  BELT")).toBe(true);
  });

  it("returns false rather than raising on an uncompilable pattern", () => {
    expect(matchesProbe({ kind: "regex", pattern: "(" }, "anything")).toBe(false);
  });
});

describe("alt", () => {
  it("builds a case-insensitive alternation", () => {
    expect(alt(["adrift", "not docked"])).toBe("(?i)(adrift|not docked)");
  });
});

describe("flexibleNumber", () => {
  it("accepts both grouped and ungrouped renderings of the same integer", () => {
    const p = { kind: "regex", value: "", pattern: flexibleNumber(44510) } as const;
    expect(matchesProbe({ kind: "regex", pattern: p.pattern }, '"credits":44510,')).toBe(true);
    expect(matchesProbe({ kind: "regex", pattern: p.pattern }, "CREDITS: 44,510")).toBe(true);
    expect(matchesProbe({ kind: "regex", pattern: p.pattern }, "credits at 144,510")).toBe(false);
  });

  it("leaves short integers ungrouped", () => {
    expect(matchesProbe({ kind: "regex", pattern: flexibleNumber(46) }, "fuel 46/100")).toBe(true);
    expect(matchesProbe({ kind: "regex", pattern: flexibleNumber(46) }, "fuel 146/100")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```
npx vitest run --config scripts/author/agentic/vitest.config.ts
```
Expected: FAIL — the config file does not exist yet, so vitest exits with `Cannot find module ... vitest.config.ts` (or, once the config exists, `Failed to resolve import "./probes.js"`).

- [ ] **Step 3: Write minimal implementation**

Create `scripts/author/agentic/vitest.config.ts`:

```ts
// These tests live outside the repo-root vitest include (which globs src/** and
// webapp/src/** only), so `npm test` never runs them. Run explicitly:
//   npx vitest run --config scripts/author/agentic/vitest.config.ts

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(here, "../../.."),
  test: { include: ["scripts/author/agentic/**/*.test.ts"], environment: "node" },
});
```

Create `scripts/author/agentic/types.ts`:

```ts
// The rendering layer's vocabulary. A Scenario is one coherent world-moment:
// a seeded environment struct, five treatment-invariant payloads, a flat list
// of true propositions (each with a probe that must match every treatment),
// an authored narrative renderer for T3, and the answer key every mechanical
// check is derived from. Nothing here knows what YAML is.

export type TreatmentKey = "t1" | "t2" | "t3";
export type ChallengeKey = "c1" | "c2" | "c3" | "c4" | "c5" | "c6";

export const TREATMENTS: readonly TreatmentKey[] = ["t1", "t2", "t3"];
export const CHALLENGES: readonly ChallengeKey[] = ["c1", "c2", "c3", "c4", "c5", "c6"];

/** A match test written with the same machinery the constraint scorer uses. */
export type Probe =
  | { readonly kind: "contains"; readonly value: string }
  | { readonly kind: "regex"; readonly pattern: string };

/** Environment facts must appear in all three context renderings; payload facts
 *  ride in the treatment-invariant payload blocks. */
export type FactScope = "environment" | "payload";

/** One true proposition about the world-moment, plus the probe that proves it
 *  survived rendering. */
export interface Fact {
  readonly id: string;
  readonly statement: string;
  readonly scope: FactScope;
  readonly probe: Probe;
}

export interface Resource {
  readonly current: number;
  readonly max: number;
}

export interface CargoItem {
  readonly item: string;
  readonly qty: number;
}

export interface Contact {
  readonly id: string;
  readonly kind: "ship";
  readonly range: string;
  /** Free text, e.g. "no hostile act observed" or "closing, weapons powered". */
  readonly posture: string;
}

export type PoiType = "sun" | "planet" | "asteroid_belt" | "relic" | "station";

export interface Poi {
  readonly id: string;
  readonly type: PoiType;
  readonly note: string;
}

export interface LastJump {
  readonly from: string;
  readonly to: string;
  readonly ticksAgo: number;
  readonly minutesAgo: number;
}

export interface EnvironmentState {
  readonly ship: string;
  readonly shipId: string;
  readonly tick: number;
  /** Machine status token, e.g. "adrift", "mining", "drifting". */
  readonly status: string;
  readonly system: string;
  readonly poi: string;
  readonly poiType: PoiType;
  readonly docked: boolean;
  readonly lastJump: LastJump | null;
  /** How long the ship has held this position, in minutes. */
  readonly stationaryMinutes: number;
  readonly fuel: Resource;
  readonly hull: Resource;
  readonly shield: Resource;
  readonly cargo: { readonly used: number; readonly capacity: number; readonly manifest: readonly CargoItem[] };
  readonly credits: number;
  readonly cpu: Resource;
  readonly power: Resource;
  readonly unreadPrivate: number;
  readonly contacts: readonly Contact[];
  readonly nearbyPois: readonly Poi[];
  /** The prior-shift claim current facts contradict. Verbatim, one line. */
  readonly priorNote: string;
}

export interface Payloads {
  readonly event: string;
  readonly stepGoal: string;
  readonly actionLog: string;
  readonly advisory: string;
  readonly objective: string;
}

export type Disposition = "IGNORE" | "NOTE" | "ACT_NOW";

/**
 * A generously-sized set of accepted phrasings for one prose answer, plus the
 * plain-English label the turn-2 criteria list shows for it. `fragments` are
 * hand-authored regex fragments (no `(?i)` prefix — `alt` adds it); `label`
 * is what a human reads.
 */
export interface SynonymSet {
  readonly label: string;
  readonly fragments: readonly string[];
}

export interface StepOutcome {
  readonly id: string;
  /** Human-readable name of the intended outcome, used in the turn-2 criteria. */
  readonly label: string;
  readonly achieved: boolean;
  /** Evidence from the log that a correct answer cites for this outcome. */
  readonly citation: SynonymSet;
}

/** The answer key. Every mechanical check in all 18 variants derives from this. */
export interface Answers {
  readonly disposition: Disposition;
  /** C1/C4: phrasings a correct REASON may use to name the driving fact. */
  readonly reason: SynonymSet;
  /** C2: the stale claim from the prior-shift note. */
  readonly priorClaim: SynonymSet;
  /** C2: the current fact that contradicts it. */
  readonly currentFact: SynonymSet;
  /** C2: proof the report is grounded in the current location. */
  readonly grounding: SynonymSet;
  readonly outcomes: readonly StepOutcome[];
  readonly c3Trap: "none" | "mixed_body" | "completed_but_failed";
  /** C3: phrasings naming the trap (the error code, or the completed/failed gap). */
  readonly c3TrapEvidence: SynonymSet;
  readonly adviceStale: boolean;
  /** C5: phrasings a correct NEXT_ACTION may use. */
  readonly nextAction: SynonymSet;
  /** C5: phrasings justifying the ADVICE_STATUS verdict from current facts. */
  readonly adviceReason: SynonymSet;
}

export type ScenarioKey = "s1" | "s2" | "s3";

export interface Scenario {
  readonly key: ScenarioKey;
  readonly seed: number;
  /** One-line description used in the emitted `# why` comment. */
  readonly summary: string;
  readonly env: EnvironmentState;
  readonly payloads: Payloads;
  readonly facts: readonly Fact[];
  readonly answers: Answers;
  /** T3 only: authored prose over the same environment. T1 and T2 are mechanical. */
  readonly narrative: (env: EnvironmentState) => string;
}

/** A constraint declaration plus the plain-English criterion shown in turn 2. */
export interface DerivedCheck {
  readonly def: Record<string, unknown>;
  readonly criterion: string;
}

export interface RenderedVariant {
  readonly scenarioKey: ScenarioKey;
  readonly challengeKey: ChallengeKey;
  readonly treatmentKey: TreatmentKey;
  readonly name: string;
  readonly prompt: string;
  readonly followUp: string;
  readonly checks: readonly Record<string, unknown>[];
  readonly why: string;
  readonly tier: number;
  readonly tags: readonly string[];
}
```

Create `scripts/author/agentic/probes.ts`:

```ts
// Probe matching, mirrored from the constraint scorer so a probe that passes
// here is a check that would pass there:
//   - `contains`  → case-insensitive substring (constraint-checks.ts:160-161)
//   - `regex`     → one leading (?i)/(?m)/(?s) group is translated to JS flags
//                   (regex-flags.ts translateInlineFlags)
// Deliberately local rather than imported from src/: this layer must not
// depend on files P1 is editing in parallel.

import type { Probe } from "./types.js";

const LEADING_INLINE_FLAGS_RE = /^\(\?([ims]+)\)/;

const compile = (pattern: string): RegExp | null => {
  const m = LEADING_INLINE_FLAGS_RE.exec(pattern);
  const body = m === null ? pattern : pattern.slice(m[0].length);
  const flags = m === null || m[1] === undefined ? "" : m[1];
  try {
    return new RegExp(body, flags);
  } catch {
    return null;
  }
};

export const matchesProbe = (probe: Probe, text: string): boolean => {
  if (probe.kind === "contains") return text.toLowerCase().includes(probe.value.toLowerCase());
  const re = compile(probe.pattern);
  return re === null ? false : re.test(text);
};

/** Case-insensitive alternation over hand-authored regex fragments. */
export const alt = (fragments: readonly string[]): string => `(?i)(${fragments.join("|")})`;

/**
 * A pattern that matches an integer written either bare (`44510`, as T1's JSON
 * does) or comma-grouped (`44,510`, as T2 and T3 do), while refusing a longer
 * number that merely contains those digits.
 */
export const flexibleNumber = (n: number): string => {
  const digits = String(Math.trunc(Math.abs(n)));
  const parts: string[] = [];
  for (let i = digits.length; i > 0; i -= 3) parts.unshift(digits.slice(Math.max(0, i - 3), i));
  return `(?<![\\d,])${parts.join(",?")}(?![\\d])`;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```
npx vitest run --config scripts/author/agentic/vitest.config.ts
```
Expected: PASS — 1 test file, 6 tests.

- [ ] **Step 5: Commit**

```
git add scripts/author/agentic/vitest.config.ts scripts/author/agentic/types.ts scripts/author/agentic/probes.ts scripts/author/agentic/probes.test.ts
git commit -m "feat(agentic): scaffold rendering-layer types and probe matcher

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Seeded surface details

**Files:**
- Create: `scripts/author/agentic/seed.ts`
- Test: `scripts/author/agentic/seed.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `makeRng(seed: number): () => number`, `pick<T>(rng: () => number, xs: readonly T[]): T`, `pickInt(rng: () => number, lo: number, hi: number): number` (inclusive bounds) from `seed.ts`.

- [ ] **Step 1: Write the failing test**

Create `scripts/author/agentic/seed.test.ts`:

```ts
// The rendering layer takes its seed as a parameter and never reaches for
// Math.random(). These tests pin determinism (same seed → same picks) and
// distinctness (different seeds → different picks), which is what makes the
// surface details unmemorizable without making a run irreproducible.
//
// Run: npx vitest run --config scripts/author/agentic/vitest.config.ts

import { describe, expect, it } from "vitest";
import { makeRng, pick, pickInt } from "./seed.js";

describe("makeRng", () => {
  it("is deterministic for a given seed", () => {
    const a = makeRng(20260722);
    const b = makeRng(20260722);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("produces different streams for different seeds", () => {
    expect(makeRng(1)()).not.toEqual(makeRng(2)());
  });

  it("stays inside [0, 1)", () => {
    const r = makeRng(7);
    for (let i = 0; i < 500; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("pick", () => {
  it("returns an element of the pool", () => {
    const pool = ["a", "b", "c"] as const;
    const r = makeRng(3);
    for (let i = 0; i < 50; i++) expect(pool).toContain(pick(r, pool));
  });
});

describe("pickInt", () => {
  it("respects inclusive bounds", () => {
    const r = makeRng(11);
    for (let i = 0; i < 500; i++) {
      const v = pickInt(r, 61, 67);
      expect(v).toBeGreaterThanOrEqual(61);
      expect(v).toBeLessThanOrEqual(67);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it("returns the bound when lo equals hi", () => {
    expect(pickInt(makeRng(1), 5, 5)).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```
npx vitest run --config scripts/author/agentic/vitest.config.ts
```
Expected: FAIL with `Failed to resolve import "./seed.js" from "scripts/author/agentic/seed.test.ts"`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/author/agentic/seed.ts`:

```ts
// Seeded surface details. The seed is a property of the scenario and is always
// passed in: one seed produces one set of names and numbers, and all three
// treatments and every model see exactly those. A difference between two items
// is therefore never a fixture difference. This is not a repeat mechanism and
// never enters a cache key.
//
// mulberry32 — small, fast, well-distributed, and short enough to read.

export const makeRng = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const pick = <T>(rng: () => number, xs: readonly T[]): T => {
  const i = Math.min(xs.length - 1, Math.floor(rng() * xs.length));
  return xs[i] as T;
};

/** Inclusive on both bounds. */
export const pickInt = (rng: () => number, lo: number, hi: number): number =>
  lo + Math.min(hi - lo, Math.floor(rng() * (hi - lo + 1)));
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```
npx vitest run --config scripts/author/agentic/vitest.config.ts
```
Expected: PASS — 2 test files, 12 tests.

- [ ] **Step 5: Commit**

```
git add scripts/author/agentic/seed.ts scripts/author/agentic/seed.test.ts
git commit -m "feat(agentic): seeded surface-detail picker

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The three treatment renderers

**Files:**
- Create: `scripts/author/agentic/treatments.ts`
- Test: `scripts/author/agentic/treatments.test.ts`

**Interfaces:**
- Consumes: `EnvironmentState`, `Scenario`, `TreatmentKey` from `./types.js`.
- Produces: `renderT1(env: EnvironmentState): string`, `renderT2(env: EnvironmentState): string`, `renderT3(scenario: Scenario): string`, `renderTreatment(scenario: Scenario, t: TreatmentKey): string` from `treatments.ts`.

**Notes for the implementer:**
- T1 wraps its JSON only after a comma. The spec's worked example wraps mid-token, but a mid-token break would split `processing_core` across a newline and silently defeat the probe that proves T1 encodes it. Comma-only wrapping keeps the "nested, unprioritized, uninterpreted" character with none of that hazard.
- T2 always emits a `## Changed since last check` section, even when nothing changed — a `LOCATION: unchanged` line is itself the fact.
- T3 is authored per scenario, so `renderT3` delegates to `scenario.narrative(scenario.env)`. T1 and T2 are mechanical and take the environment alone.

- [ ] **Step 1: Write the failing test**

Create `scripts/author/agentic/treatments.test.ts`:

```ts
// The three treatments render the same environment three ways. These tests pin
// the shape of each (so a reviewer at R3 reads what they expect) and pin the
// one property the whole design rests on: T1's JSON never breaks a token across
// a line, because a broken token silently defeats a fact probe.
//
// Run: npx vitest run --config scripts/author/agentic/vitest.config.ts

import { describe, expect, it } from "vitest";
import type { EnvironmentState, Scenario } from "./types.js";
import { renderT1, renderT2, renderT3, renderTreatment } from "./treatments.js";

const env: EnvironmentState = {
  ship: "Vagrant",
  shipId: "vagrant",
  tick: 1410441,
  status: "adrift",
  system: "Ledge",
  poi: "Ledge Outer Belt",
  poiType: "asteroid_belt",
  docked: false,
  lastJump: { from: "Harrow", to: "Ledge", ticksAgo: 12, minutesAgo: 2 },
  stationaryMinutes: 2,
  fuel: { current: 49, max: 100 },
  hull: { current: 100, max: 100 },
  shield: { current: 50, max: 50 },
  cargo: {
    used: 13,
    capacity: 50,
    manifest: [
      { item: "iron_ore", qty: 9 },
      { item: "processing_core", qty: 1 },
      { item: "superconductor", qty: 1 },
      { item: "circuit_board", qty: 2 },
    ],
  },
  credits: 44510,
  cpu: { current: 2, max: 8 },
  power: { current: 5, max: 12 },
  unreadPrivate: 3,
  contacts: [{ id: "Meridian-7", kind: "ship", range: "scan", posture: "no hostile act observed" }],
  nearbyPois: [{ id: "Ledge Relay", type: "station", note: "market open, 1 burn away" }],
  priorNote: "fuel concerns resolved, hardware bottleneck cleared",
};

const scenario = { env, narrative: (e: EnvironmentState) => `## Briefing\nThe ${e.ship} drifts.` } as Scenario;

describe("renderT1", () => {
  it("emits a raw-telemetry heading and parseable JSON", () => {
    const out = renderT1(env);
    expect(out.startsWith("## Ship state (raw)")).toBe(true);
    const json = out.slice(out.indexOf("{"));
    expect(() => JSON.parse(json.replace(/\n/g, ""))).not.toThrow();
  });

  it("never breaks a token across a line — every line break follows a comma", () => {
    const lines = renderT1(env).split("\n").slice(1);
    for (const line of lines.slice(0, -1)) expect(line.endsWith(",")).toBe(true);
  });

  it("buries the significant facts mid-structure rather than labelling them", () => {
    const out = renderT1(env);
    expect(out).toContain('"processing_core"');
    expect(out).toContain('"last_jump"');
    expect(out).not.toContain("below half");
  });
});

describe("renderT2", () => {
  it("separates deltas from standing state and labels one fact per line", () => {
    const out = renderT2(env);
    expect(out).toContain("## Changed since last check");
    expect(out).toContain("## Standing state");
    expect(out).toContain("LOCATION:");
    expect(out).toContain("FUEL: 49/100");
    expect(out).toContain("CARGO: 13/50");
    expect(out).toContain("CREDITS: 44,510");
  });

  it("marks the prior-shift note as unverified", () => {
    expect(renderT2(env)).toContain("Prior-shift note (unverified");
  });
});

describe("renderT3", () => {
  it("delegates to the scenario's authored narrative", () => {
    expect(renderT3(scenario)).toBe("## Briefing\nThe Vagrant drifts.");
  });
});

describe("renderTreatment", () => {
  it("dispatches on the treatment key", () => {
    expect(renderTreatment(scenario, "t1")).toBe(renderT1(env));
    expect(renderTreatment(scenario, "t2")).toBe(renderT2(env));
    expect(renderTreatment(scenario, "t3")).toBe(renderT3(scenario));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```
npx vitest run --config scripts/author/agentic/vitest.config.ts
```
Expected: FAIL with `Failed to resolve import "./treatments.js" from "scripts/author/agentic/treatments.test.ts"`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/author/agentic/treatments.ts`:

```ts
// Three renderings of one environment.
//   T1 raw telemetry   — verbatim machine state; nested, unprioritized,
//                        uninterpreted. Significant facts sit mid-structure.
//   T2 labeled digest  — flat labeled lines, one fact per line, deltas isolated
//                        from standing state, explicit verdict tokens.
//   T3 narrative brief — authored prose; priors and facts in one voice, nothing
//                        labeled. Delegated to the scenario, since prose cannot
//                        be generated mechanically without losing the pressure
//                        it exists to carry.
// Time is a rendering detail, not an equivalence obligation: T1 carries ticks
// where T2 and T3 carry minutes. Only the facts a challenge can be scored on
// must reconcile.

import type { EnvironmentState, Scenario, TreatmentKey } from "./types.js";

const snake = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "_");

const grouped = (n: number): string => n.toLocaleString("en-US");

/**
 * Hard-wrap a JSON string, breaking only immediately after a comma. Wrapping
 * mid-token (as a real console dump would) would split identifiers across a
 * newline and silently defeat the fact probes that prove T1 encodes them.
 */
const wrapAfterCommas = (json: string, width: number): string => {
  const out: string[] = [];
  let line = "";
  for (const piece of json.split(/(?<=,)/)) {
    if (line.length > 0 && line.length + piece.length > width) {
      out.push(line);
      line = piece;
    } else {
      line += piece;
    }
  }
  if (line.length > 0) out.push(line);
  return out.join("\n");
};

export const renderT1 = (e: EnvironmentState): string => {
  const body = {
    ts: e.tick,
    ship: {
      id: e.shipId,
      name: e.ship,
      status: e.status,
      location: { system_id: snake(e.system), poi: snake(e.poi), poi_type: e.poiType, docked: e.docked },
      nav: {
        last_jump:
          e.lastJump === null
            ? null
            : { from: snake(e.lastJump.from), to: snake(e.lastJump.to), completed_ticks_ago: e.lastJump.ticksAgo },
        stationary_ticks: e.stationaryMinutes * 6,
      },
      resources: {
        fuel: { current: e.fuel.current, max: e.fuel.max },
        hull: { current: e.hull.current, max: e.hull.max },
        shield: { current: e.shield.current, max: e.shield.max },
        cpu: { used: e.cpu.current, capacity: e.cpu.max },
        power: { used: e.power.current, capacity: e.power.max },
      },
      cargo: { used: e.cargo.used, capacity: e.cargo.capacity, manifest: e.cargo.manifest },
      credits: e.credits,
      comms: { unread: { private: e.unreadPrivate, local: 0, system: 0 } },
      contacts: e.contacts.map((c) => ({ id: c.id, type: c.kind, range: c.range, posture: c.posture })),
      pois_in_range: e.nearbyPois.map((p) => ({ id: p.id, type: p.type, note: p.note })),
      notes_prev: e.priorNote,
    },
  };
  return `## Ship state (raw)\n${wrapAfterCommas(JSON.stringify(body), 78)}`;
};

export const renderT2 = (e: EnvironmentState): string => {
  const locationLine =
    e.lastJump === null
      ? `LOCATION: unchanged — in system ${e.system} at ${e.poi}, holding position ${e.stationaryMinutes} min`
      : `LOCATION: now in system ${e.system} at ${e.poi} — jumped from ${e.lastJump.from} ~${e.lastJump.minutesAgo} min ago`;
  const commsLine =
    e.unreadPrivate === 0
      ? "COMMS: 0 unread private messages — nothing new"
      : `COMMS: ${e.unreadPrivate} unread private messages — senders unknown until read`;
  const fuelVerdict =
    e.fuel.current * 4 <= e.fuel.max
      ? "critical, below quarter tank"
      : e.fuel.current * 2 < e.fuel.max
        ? "below half, no alert threshold crossed"
        : "above half, no alerts";
  const hullVerdict = e.hull.current === e.hull.max ? "no alerts" : "damaged, below full";
  const shieldVerdict = e.shield.current * 2 < e.shield.max ? "below half, degraded" : "no alerts";
  const manifest = e.cargo.manifest.map((c) => `${c.item} x${c.qty}`).join(", ");
  const contactLines =
    e.contacts.length === 0
      ? ["CONTACTS: 0 ships in scan range"]
      : e.contacts.map((c) => `CONTACTS: 1 ship in ${c.range} range (${c.id}) — ${c.posture}`);
  const poiLines = e.nearbyPois.map((p) => `POI: ${p.id} (${p.type}) — ${p.note}`);
  return [
    "## Changed since last check",
    locationLine,
    commsLine,
    "",
    "## Standing state",
    `DOCKED: ${e.docked ? "yes" : "no"} — status ${e.status}`,
    `FUEL: ${e.fuel.current}/${e.fuel.max} — ${fuelVerdict}`,
    `HULL: ${e.hull.current}/${e.hull.max} — ${hullVerdict}`,
    `SHIELD: ${e.shield.current}/${e.shield.max} — ${shieldVerdict}`,
    `CARGO: ${e.cargo.used}/${e.cargo.capacity} (${manifest})`,
    `CREDITS: ${grouped(e.credits)}`,
    `CPU: ${e.cpu.current}/${e.cpu.max} used`,
    `POWER: ${e.power.current}/${e.power.max} used`,
    ...contactLines,
    ...poiLines,
    "",
    "## Prior-shift note (unverified — trust current lines above where they differ)",
    `"${e.priorNote}"`,
  ].join("\n");
};

export const renderT3 = (s: Scenario): string => s.narrative(s.env);

export const renderTreatment = (s: Scenario, t: TreatmentKey): string =>
  t === "t1" ? renderT1(s.env) : t === "t2" ? renderT2(s.env) : renderT3(s);
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```
npx vitest run --config scripts/author/agentic/vitest.config.ts
```
Expected: PASS — 3 test files, 20 tests.

- [ ] **Step 5: Commit**

```
git add scripts/author/agentic/treatments.ts scripts/author/agentic/treatments.test.ts
git commit -m "feat(agentic): T1 telemetry, T2 digest and T3 narrative renderers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The information-equivalence assertion

**Files:**
- Create: `scripts/author/agentic/equivalence.ts`
- Test: `scripts/author/agentic/equivalence.test.ts`

**Interfaces:**
- Consumes: `matchesProbe` from `./probes.js`; `renderTreatment` from `./treatments.js`; `Fact`, `Scenario`, `TreatmentKey`, `TREATMENTS` from `./types.js`.
- Produces: `payloadBundle(s: Scenario): string`, `EquivalenceFailure` (`{ factId, statement, treatment }`), `equivalenceFailures(s: Scenario): readonly EquivalenceFailure[]` from `equivalence.ts`.

**Why this task matters more than any other:** this is the control that makes a difference between two treatments attributable to structure rather than to information. It must catch the exact bug present in the spec's own worked example — T3's prose omitting the cargo capacity that T1 and T2 both state as `13/50`. The test below therefore proves the assertion **catches a deliberately broken treatment**, not merely that it passes on a good one.

- [ ] **Step 1: Write the failing test**

Create `scripts/author/agentic/equivalence.test.ts`:

```ts
// Information equivalence: every manifest fact's probe must match under all
// three treatments. A fact whose probe fails anywhere fails the build.
//
// The negative case below reproduces the bug in the design doc's own worked
// example: T3's prose omits the hold's 13/50 capacity that T1 and T2 both
// state. If this test ever stops failing on `brokenNarrative`, the assertion
// has been defanged and the whole comparison is invalid.
//
// Run: npx vitest run --config scripts/author/agentic/vitest.config.ts

import { describe, expect, it } from "vitest";
import { equivalenceFailures, payloadBundle } from "./equivalence.js";
import { flexibleNumber } from "./probes.js";
import type { EnvironmentState, Fact, Scenario } from "./types.js";

const env: EnvironmentState = {
  ship: "Vagrant",
  shipId: "vagrant",
  tick: 1410441,
  status: "adrift",
  system: "Ledge",
  poi: "Ledge Outer Belt",
  poiType: "asteroid_belt",
  docked: false,
  lastJump: { from: "Harrow", to: "Ledge", ticksAgo: 12, minutesAgo: 2 },
  stationaryMinutes: 2,
  fuel: { current: 49, max: 100 },
  hull: { current: 100, max: 100 },
  shield: { current: 50, max: 50 },
  cargo: { used: 13, capacity: 50, manifest: [{ item: "processing_core", qty: 1 }] },
  credits: 44510,
  cpu: { current: 2, max: 8 },
  power: { current: 5, max: 12 },
  unreadPrivate: 3,
  contacts: [{ id: "Meridian-7", kind: "ship", range: "scan", posture: "no hostile act observed" }],
  nearbyPois: [],
  priorNote: "fuel concerns resolved, hardware bottleneck cleared",
};

const facts: readonly Fact[] = [
  {
    id: "cargo_used_capacity",
    statement: "The hold carries 13 of its 50 units.",
    scope: "environment",
    probe: { kind: "regex", pattern: "(?i)13[^\\d]{0,14}50" },
  },
  {
    id: "credits",
    statement: "The ship holds 44,510 credits.",
    scope: "environment",
    probe: { kind: "regex", pattern: flexibleNumber(44510) },
  },
  {
    id: "objective_iridium",
    statement: "The current objective is to obtain 1 Iridium Ore.",
    scope: "payload",
    probe: { kind: "contains", value: "Iridium Ore" },
  },
];

const goodNarrative = (e: EnvironmentState): string =>
  `## Briefing\nThe ${e.ship} sits at the ${e.poi}. The hold carries 13 of its 50 units — a processing core among them — with credits at 44,510.`;

// The bug from the design doc: everything else survives the prose, the hold's
// capacity does not.
const brokenNarrative = (e: EnvironmentState): string =>
  `## Briefing\nThe ${e.ship} sits at the ${e.poi}. There is a processing core in the hold, and credits stand at 44,510.`;

const makeScenario = (narrative: (e: EnvironmentState) => string): Scenario =>
  ({
    key: "s2",
    seed: 1,
    summary: "fixture",
    env,
    payloads: {
      event: "COMMS: private message received.",
      stepGoal: "Buy 1 Iridium Ore.",
      actionLog: 'status:"completed" Error [item_not_available]',
      advisory: "Restock iridium at Harrow.",
      objective: "Obtain 1 Iridium Ore for the shield-regulator build.",
    },
    facts,
    answers: {} as Scenario["answers"],
    narrative,
  }) as Scenario;

describe("payloadBundle", () => {
  it("concatenates every treatment-invariant payload", () => {
    const bundle = payloadBundle(makeScenario(goodNarrative));
    expect(bundle).toContain("private message received");
    expect(bundle).toContain("Buy 1 Iridium Ore");
    expect(bundle).toContain("Error [item_not_available]");
    expect(bundle).toContain("Restock iridium at Harrow");
    expect(bundle).toContain("shield-regulator build");
  });
});

describe("equivalenceFailures", () => {
  it("reports no failures when all three treatments encode every fact", () => {
    expect(equivalenceFailures(makeScenario(goodNarrative))).toEqual([]);
  });

  it("CATCHES a treatment that drops a fact the other two carry", () => {
    const failures = equivalenceFailures(makeScenario(brokenNarrative));
    expect(failures).toHaveLength(1);
    expect(failures[0]?.factId).toBe("cargo_used_capacity");
    expect(failures[0]?.treatment).toBe("t3");
    expect(failures[0]?.statement).toContain("13 of its 50");
  });

  it("checks environment facts against all three treatments, not just one", () => {
    const missingEverywhere: Fact = {
      id: "never_rendered",
      statement: "A fact no treatment encodes.",
      scope: "environment",
      probe: { kind: "contains", value: "zzz-not-present-zzz" },
    };
    const s = { ...makeScenario(goodNarrative), facts: [missingEverywhere] } as Scenario;
    expect(equivalenceFailures(s).map((f) => f.treatment)).toEqual(["t1", "t2", "t3"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```
npx vitest run --config scripts/author/agentic/vitest.config.ts
```
Expected: FAIL with `Failed to resolve import "./equivalence.js" from "scripts/author/agentic/equivalence.test.ts"`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/author/agentic/equivalence.ts`:

```ts
// The information-equivalence control.
//
// Each scenario has a canonical fact manifest: a flat list of true
// propositions. All three treatments must encode every one of them. If a
// treatment cannot express a fact, the fact is cut from the scenario — it is
// never left asymmetric. This is a build-time assertion, not an authoring
// intention: it runs with the renderer's own test suite and fails when any
// manifest fact is unencoded by any treatment.
//
// Environment facts are probed against each rendered context block. Payload
// facts are probed against the payload bundle, which is treatment-invariant by
// construction — but they are still reported per treatment so a failure reads
// the same way whatever its cause.
//
// The false-negative bias is deliberate. A generous probe risks passing a weak
// encoding, which the human review gate catches by eye; a strict probe blocks
// legitimate prose and pushes the treatments toward stilted renderings, which
// is the more damaging error.

import { matchesProbe } from "./probes.js";
import { renderTreatment } from "./treatments.js";
import type { Scenario, TreatmentKey } from "./types.js";
import { TREATMENTS } from "./types.js";

export interface EquivalenceFailure {
  readonly factId: string;
  readonly statement: string;
  readonly treatment: TreatmentKey;
}

export const payloadBundle = (s: Scenario): string =>
  [s.payloads.event, s.payloads.stepGoal, s.payloads.actionLog, s.payloads.advisory, s.payloads.objective].join(
    "\n\n",
  );

export const equivalenceFailures = (s: Scenario): readonly EquivalenceFailure[] => {
  const payloads = payloadBundle(s);
  const failures: EquivalenceFailure[] = [];
  for (const fact of s.facts) {
    for (const t of TREATMENTS) {
      const target = fact.scope === "environment" ? renderTreatment(s, t) : payloads;
      if (!matchesProbe(fact.probe, target)) {
        failures.push({ factId: fact.id, statement: fact.statement, treatment: t });
      }
    }
  }
  return failures;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```
npx vitest run --config scripts/author/agentic/vitest.config.ts
```
Expected: PASS — 4 test files, 24 tests. In particular `CATCHES a treatment that drops a fact the other two carry` passes, which is the proof the assertion has teeth.

- [ ] **Step 5: Commit**

```
git add scripts/author/agentic/equivalence.ts scripts/author/agentic/equivalence.test.ts
git commit -m "feat(agentic): build-time information-equivalence assertion

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The six challenge templates

**Files:**
- Create: `scripts/author/agentic/challenges.ts`
- Test: `scripts/author/agentic/challenges.test.ts`

**Interfaces:**
- Consumes: `ChallengeKey`, `Payloads` from `./types.js`.
- Produces: `TEMPLATES: Readonly<Record<ChallengeKey, string>>`, `CHALLENGE_TIERS: Readonly<Record<ChallengeKey, number>>`, `CHALLENGE_TAGS: Readonly<Record<ChallengeKey, readonly string[]>>`, `EXEMPLAR_SENTENCES: readonly string[]`, `renderPrompt(c: ChallengeKey, context: string, p: Payloads): string` from `challenges.ts`.

**Notes for the implementer:**
- The six prompt bodies are transcribed **verbatim** from the design doc. Do not reword, do not add a `Constraints:` section, do not state a logical rule. The rules that determine a correct answer live in the derived checks, where the model cannot read them. C6 keeps its JSON schema block and C2/C3/C5 keep their `Format:` blocks because the output contract is itself under test.
- `EXEMPLAR_SENTENCES` is exported from this module so C4's echo check is derived from the same strings the prompt shows. If the exemplars are ever edited, the check follows automatically.
- Templates carry only the placeholders their challenge uses; `renderPrompt` substitutes all five unconditionally and a template that lacks one is simply unaffected.

- [ ] **Step 1: Write the failing test**

Create `scripts/author/agentic/challenges.test.ts`:

```ts
// The six challenge prompts are verbatim across every treatment and every
// scenario — that invariance is what makes a difference between two items
// attributable to context structure. These tests pin the text, pin the absence
// of any stated logical rule, and pin that every placeholder is substituted.
//
// Run: npx vitest run --config scripts/author/agentic/vitest.config.ts

import { describe, expect, it } from "vitest";
import { CHALLENGE_TAGS, CHALLENGE_TIERS, EXEMPLAR_SENTENCES, TEMPLATES, renderPrompt } from "./challenges.js";
import { CHALLENGES, type Payloads } from "./types.js";

const payloads: Payloads = {
  event: "EVENT-BODY",
  stepGoal: "STEP-GOAL-BODY",
  actionLog: "ACTION-LOG-BODY",
  advisory: "ADVISORY-BODY",
  objective: "OBJECTIVE-BODY",
};

describe("TEMPLATES", () => {
  it("covers all six challenges", () => {
    expect(Object.keys(TEMPLATES).sort()).toEqual([...CHALLENGES].sort());
  });

  it("never states a logical rule to the model", () => {
    for (const c of CHALLENGES) {
      expect(TEMPLATES[c]).not.toContain("Constraints:");
      expect(TEMPLATES[c].toLowerCase()).not.toContain("never ignore");
      expect(TEMPLATES[c].toLowerCase()).not.toContain("a system jump is significant");
    }
  });

  it("keeps every challenge's output contract", () => {
    expect(TEMPLATES.c1).toContain("DISPOSITION: one of IGNORE | NOTE | ACT_NOW");
    expect(TEMPLATES.c2).toContain("CORRECTIONS:");
    expect(TEMPLATES.c3).toContain("ACHIEVED or NOT_ACHIEVED");
    expect(TEMPLATES.c4).toContain("DISPOSITION / SIGNIFICANCE / REASON");
    expect(TEMPLATES.c5).toContain("ADVICE_STATUS: STILL_VALID | STALE");
    expect(TEMPLATES.c6).toContain('{"disposition": "ignore" | "note" | "act_now",');
  });

  it("carries C4's exemplar bait verbatim, and exports the same strings for the echo check", () => {
    for (const sentence of EXEMPLAR_SENTENCES) expect(TEMPLATES.c4).toContain(sentence);
    expect(EXEMPLAR_SENTENCES).toEqual([
      "Routine repetition of an unchanged cargo state.",
      "Active hull damage threatens ship survival.",
      "A distant vessel moved, which is worth noting as novelty.",
    ]);
  });
});

describe("renderPrompt", () => {
  it("substitutes the context and every payload, leaving no placeholder behind", () => {
    for (const c of CHALLENGES) {
      const out = renderPrompt(c, "CONTEXT-BODY", payloads);
      expect(out).toContain("CONTEXT-BODY");
      expect(out).not.toMatch(/\{\{[A-Z_]+\}\}/);
    }
  });

  it("gives C3 the step goal and the action log, and C5 the advisory and objective", () => {
    const c3 = renderPrompt("c3", "CONTEXT-BODY", payloads);
    expect(c3).toContain("STEP-GOAL-BODY");
    expect(c3).toContain("ACTION-LOG-BODY");
    const c5 = renderPrompt("c5", "CONTEXT-BODY", payloads);
    expect(c5).toContain("ADVISORY-BODY");
    expect(c5).toContain("OBJECTIVE-BODY");
  });

  it("gives C1, C4 and C6 the incoming event", () => {
    for (const c of ["c1", "c4", "c6"] as const) {
      expect(renderPrompt(c, "CONTEXT-BODY", payloads)).toContain("EVENT-BODY");
    }
  });
});

describe("challenge metadata", () => {
  it("assigns a tier and tags to every challenge", () => {
    for (const c of CHALLENGES) {
      expect(CHALLENGE_TIERS[c]).toBeGreaterThan(0);
      expect(CHALLENGE_TAGS[c].length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```
npx vitest run --config scripts/author/agentic/vitest.config.ts
```
Expected: FAIL with `Failed to resolve import "./challenges.js" from "scripts/author/agentic/challenges.test.ts"`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/author/agentic/challenges.ts`:

```ts
// The six challenge prompts, verbatim across every treatment and every
// scenario. {{ENVIRONMENT_CONTEXT}} is filled by one treatment; {{EVENT}},
// {{ACTION_LOG}}, {{ADVISORY}}, {{STEP_GOAL}} and {{OBJECTIVE}} are
// per-scenario payloads identical across treatments.
//
// Logical rules are never stated to the model. A prompt carries its task and
// its output contract and nothing else; the rules that determine a correct
// answer live in the derived checks, where the model cannot read them. A prompt
// that states the rule measures instruction-following and conceals the failure
// being hunted.

import type { ChallengeKey, Payloads } from "./types.js";

/** C4's bait. Exported so the echo check is derived from the prompt's own text. */
export const EXEMPLAR_SENTENCES: readonly string[] = [
  "Routine repetition of an unchanged cargo state.",
  "Active hull damage threatens ship survival.",
  "A distant vessel moved, which is worth noting as novelty.",
];

const C1 = `You are the attention filter for an autonomous ship. You receive a stream of
events; most are routine. Your judgment decides whether the ship's planning
system is interrupted.

{{ENVIRONMENT_CONTEXT}}

## New event
{{EVENT}}

Decide how significant this event is, given everything above.

Respond with exactly three lines:
DISPOSITION: one of IGNORE | NOTE | ACT_NOW
SIGNIFICANCE: an integer 0-5
REASON: one sentence naming the specific fact in the input that drove your decision`;

const C2 = `You are writing the situation report an autonomous ship's planner will act on.
A report from your previous shift is included in your materials; it may be out
of date or wrong.

{{ENVIRONMENT_CONTEXT}}

Write the current situation report. Format:

SITUATION: (2-3 sentences, present tense, current facts only)
OPEN PROBLEMS: (bulleted; each names the blocking fact)
CORRECTIONS: (bulleted; each claim from prior materials that current facts
contradict, stated as "prior said X; currently Y" — write "none" if none)`;

const C3 = `An autonomous agent just finished a work step. You must judge what was actually
accomplished. You have the step's goal and the complete mechanical log of every
action taken. The log is authoritative; the agent's intentions are not.

{{ENVIRONMENT_CONTEXT}}

## Step goal
{{STEP_GOAL}}

## Action log (complete, in order)
{{ACTION_LOG}}

For each intended outcome in the goal, state ACHIEVED or NOT_ACHIEVED, citing
the log line(s) that prove it. Then give a one-line verdict for the step.`;

const C4 = `You are the attention filter for an autonomous ship, deciding whether an event
should interrupt the planning system.

Here is how to think about significance:
- Example: a cargo hold reading identical to the last three readings →
  "DISPOSITION: IGNORE / REASON: ${EXEMPLAR_SENTENCES[0]}"
- Example: a hull breach alarm during transit →
  "DISPOSITION: ACT_NOW / REASON: ${EXEMPLAR_SENTENCES[1]}"
- Bad example (do not imitate): "DISPOSITION: NOTE / REASON: ${EXEMPLAR_SENTENCES[2]}" — vague, does not name a
  consequential fact.

{{ENVIRONMENT_CONTEXT}}

## New event
{{EVENT}}

Respond with exactly three lines: DISPOSITION / SIGNIFICANCE / REASON, as in
the examples' format.`;

const C5 = `You are the planner for an autonomous agent. You have current observed facts
and a piece of learned advice from earlier experience. The advice was true when
written. It may not be true now.

{{ENVIRONMENT_CONTEXT}}

## Learned advice (from a previous session)
{{ADVISORY}}

## Current objective
{{OBJECTIVE}}

Recommend the single next action. Format:

NEXT_ACTION: (one concrete action)
BECAUSE: (2-3 sentences of justification from current facts)
ADVICE_STATUS: STILL_VALID | STALE — and if STALE, one sentence naming which
current fact contradicts it`;

const C6 = `You are an automated event classifier inside a running system. Your output is
parsed by a machine. Any deviation from the schema is a system fault.

{{ENVIRONMENT_CONTEXT}}

## New event
{{EVENT}}

Output a single JSON object, and nothing else — no prose, no code fences,
no reasoning outside the JSON:

{"disposition": "ignore" | "note" | "act_now",
 "significance": <integer 0-5>,
 "interrupt": <boolean>,
 "reason": "<one sentence citing a fact from the input>"}`;

export const TEMPLATES: Readonly<Record<ChallengeKey, string>> = { c1: C1, c2: C2, c3: C3, c4: C4, c5: C5, c6: C6 };

/** Tiers reflect concept difficulty, not observed model difficulty. */
export const CHALLENGE_TIERS: Readonly<Record<ChallengeKey, number>> = {
  c1: 2,
  c2: 3,
  c3: 3,
  c4: 4,
  c5: 3,
  c6: 4,
};

export const CHALLENGE_TAGS: Readonly<Record<ChallengeKey, readonly string[]>> = {
  c1: ["salience", "grounding", "format-discipline"],
  c2: ["grounding", "prior-resistance"],
  c3: ["evidence-over-inference"],
  c4: ["prior-resistance", "exemplar-echo"],
  c5: ["prior-resistance", "grounding", "stale-advice"],
  c6: ["format-discipline", "schema"],
};

export const renderPrompt = (c: ChallengeKey, context: string, p: Payloads): string =>
  TEMPLATES[c]
    .replace("{{ENVIRONMENT_CONTEXT}}", context)
    .replace("{{EVENT}}", p.event)
    .replace("{{STEP_GOAL}}", p.stepGoal)
    .replace("{{ACTION_LOG}}", p.actionLog)
    .replace("{{ADVISORY}}", p.advisory)
    .replace("{{OBJECTIVE}}", p.objective);
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```
npx vitest run --config scripts/author/agentic/vitest.config.ts
```
Expected: PASS — 5 test files, 32 tests.

- [ ] **Step 5: Commit**

```
git add scripts/author/agentic/challenges.ts scripts/author/agentic/challenges.test.ts
git commit -m "feat(agentic): the six verbatim challenge templates

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Check derivation — shared helpers, C1 and C4

**Files:**
- Create: `scripts/author/agentic/checks.ts`
- Test: `scripts/author/agentic/checks.test.ts`

**Interfaces:**
- Consumes: `EXEMPLAR_SENTENCES` from `./challenges.js`; `alt` from `./probes.js`; `Answers`, `DerivedCheck`, `Disposition`, `SynonymSet` from `./types.js`.
- Produces: `SIG_BAND`, `SIG_RANGE`, `JSON_DISPOSITION`, `INTERRUPT`, `rx`, `absent`, `anyOf`, `escapeRegExp`, `deriveC1(a: Answers): readonly DerivedCheck[]`, `deriveC4(a: Answers): readonly DerivedCheck[]` from `checks.ts`.

**The 5-check budget for these two challenges:**

| # | C1 | C4 |
|---|---|---|
| 1 | DISPOSITION line present with a legal value | DISPOSITION line present with a legal value |
| 2 | DISPOSITION is correct | DISPOSITION is correct |
| 3 | SIGNIFICANCE in the band implied by the disposition | SIGNIFICANCE in the band implied by the disposition |
| 4 | REASON line present and non-empty | REASON names the driving fact |
| 5 | REASON names the driving fact | No verbatim echo of any of the prompt's three exemplar sentences |

C4 spends the slot C1 gives to "REASON present" on the echo check, because prior resistance is the failure C4 exists to hunt. Both land on exactly 5.

- [ ] **Step 1: Write the failing test**

Create `scripts/author/agentic/checks.test.ts`:

```ts
// Mechanical checks are derived from the answer key, never hand-written per
// variant. These tests assert the 5-check budget, that a correct answer passes
// every derived check, and that each check actually discriminates.
//
// Run: npx vitest run --config scripts/author/agentic/vitest.config.ts

import { describe, expect, it } from "vitest";
import { deriveC1, deriveC4 } from "./checks.js";
import { matchesProbe } from "./probes.js";
import type { Answers, DerivedCheck } from "./types.js";

/** Evaluate a derived `regex` check against candidate model output. */
export const evalCheck = (c: DerivedCheck, output: string): boolean =>
  matchesProbe({ kind: "regex", pattern: String(c.def.pattern) }, output);

const answers = {
  disposition: "ACT_NOW",
  reason: {
    label: "the unidentified vessel closing with weapons powered, or the fuel level after the jump",
    fragments: ["weapons", "closing", "unidentified", "Sable-6", "hostile", "fuel"],
  },
} as Answers;

const good = [
  "DISPOSITION: ACT_NOW",
  "SIGNIFICANCE: 5",
  "REASON: An unidentified vessel is closing with weapons powered.",
].join("\n");

describe("deriveC1", () => {
  it("derives exactly 5 checks", () => {
    expect(deriveC1(answers)).toHaveLength(5);
  });

  it("passes every check on a correct answer", () => {
    for (const c of deriveC1(answers)) expect(evalCheck(c, good)).toBe(true);
  });

  it("fails the disposition check on a wrong disposition", () => {
    const wrong = good.replace("ACT_NOW", "IGNORE");
    const results = deriveC1(answers).map((c) => evalCheck(c, wrong));
    expect(results[1]).toBe(false);
  });

  it("fails the significance check when the integer is outside the band", () => {
    const wrong = good.replace("SIGNIFICANCE: 5", "SIGNIFICANCE: 1");
    expect(evalCheck(deriveC1(answers)[2] as DerivedCheck, wrong)).toBe(false);
  });

  it("fails the grounding check when the REASON names nothing from the input", () => {
    const wrong = good.replace(/REASON:.*/, "REASON: It seemed important.");
    expect(evalCheck(deriveC1(answers)[4] as DerivedCheck, wrong)).toBe(false);
  });

  it("states a human-readable criterion for every check", () => {
    for (const c of deriveC1(answers)) expect(c.criterion.length).toBeGreaterThan(10);
  });
});

describe("deriveC4", () => {
  it("derives exactly 5 checks", () => {
    expect(deriveC4(answers)).toHaveLength(5);
  });

  it("passes every check on a correct, non-echoing answer", () => {
    for (const c of deriveC4(answers)) expect(evalCheck(c, good)).toBe(true);
  });

  it("CATCHES a verbatim echo of the prompt's bad exemplar", () => {
    const echo = [
      "DISPOSITION: ACT_NOW",
      "SIGNIFICANCE: 5",
      "REASON: A distant vessel moved, which is worth noting as novelty.",
    ].join("\n");
    expect(evalCheck(deriveC4(answers)[4] as DerivedCheck, echo)).toBe(false);
  });

  it("CATCHES a verbatim echo of the prompt's good exemplars too", () => {
    for (const s of ["Routine repetition of an unchanged cargo state.", "Active hull damage threatens ship survival."]) {
      const echo = `DISPOSITION: ACT_NOW\nSIGNIFICANCE: 5\nREASON: ${s} Weapons are powered.`;
      expect(evalCheck(deriveC4(answers)[4] as DerivedCheck, echo)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```
npx vitest run --config scripts/author/agentic/vitest.config.ts
```
Expected: FAIL with `Failed to resolve import "./checks.js" from "scripts/author/agentic/checks.test.ts"`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/author/agentic/checks.ts`:

```ts
// Mechanical checks, derived from the scenario's answer key. Nothing here is
// authored per variant: if a scenario's fuel figure changes, all 18 of that
// scenario's items change with it, so the set never scores against stale truth.
//
// Every challenge derives EXACTLY 5 checks. The calibration check is added on
// top by the renderer, so the fraction a model must reproduce in turn 2 is
// always one of 0.0 / 0.2 / 0.4 / 0.6 / 0.8 / 1.0 — all exact at three
// decimals. A denominator that produced a repeating decimal would measure
// rounding behaviour instead of calibration.
//
// Prose adjudication is generous by design: a check that misses a correct
// answer corrupts the treatment comparison worse than one that is slightly
// lenient. Case-insensitivity uses the leading (?i) inline-flag form.

import { EXEMPLAR_SENTENCES } from "./challenges.js";
import { alt } from "./probes.js";
import type { Answers, DerivedCheck, Disposition, SynonymSet } from "./types.js";

export const SIG_BAND: Readonly<Record<Disposition, string>> = {
  IGNORE: "[01]",
  NOTE: "[23]",
  ACT_NOW: "[45]",
};

export const SIG_RANGE: Readonly<Record<Disposition, string>> = {
  IGNORE: "0 or 1",
  NOTE: "2 or 3",
  ACT_NOW: "4 or 5",
};

export const JSON_DISPOSITION: Readonly<Record<Disposition, string>> = {
  IGNORE: "ignore",
  NOTE: "note",
  ACT_NOW: "act_now",
};

export const INTERRUPT: Readonly<Record<Disposition, boolean>> = {
  IGNORE: false,
  NOTE: false,
  ACT_NOW: true,
};

export const escapeRegExp = (s: string): string => s.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");

export const rx = (name: string, pattern: string, criterion: string): DerivedCheck => ({
  def: { name, check: "regex", pattern },
  criterion,
});

/** Matches only when NONE of the fragments appear anywhere in the output. */
export const absent = (fragments: readonly string[]): string => `(?i)^(?![\\s\\S]*(${fragments.join("|")}))`;

export const anyOf = (s: SynonymSet): string => alt(s.fragments);

const dispositionPresent = (): DerivedCheck =>
  rx(
    "disposition line present",
    "(?i)DISPOSITION:\\s*(IGNORE|NOTE|ACT_NOW)\\b",
    "The answer contains a DISPOSITION: line whose value is exactly one of IGNORE, NOTE or ACT_NOW.",
  );

const dispositionCorrect = (a: Answers): DerivedCheck =>
  rx(
    `disposition is ${a.disposition}`,
    `(?i)DISPOSITION:\\s*${a.disposition}\\b`,
    `The DISPOSITION is ${a.disposition}.`,
  );

const significanceInBand = (a: Answers): DerivedCheck =>
  rx(
    "significance in band",
    `(?i)SIGNIFICANCE:\\s*${SIG_BAND[a.disposition]}(?!\\d)`,
    `The SIGNIFICANCE is ${SIG_RANGE[a.disposition]}.`,
  );

const reasonGrounded = (a: Answers): DerivedCheck =>
  rx("reason names the driving fact", anyOf(a.reason), `The REASON names ${a.reason.label}.`);

export const deriveC1 = (a: Answers): readonly DerivedCheck[] => [
  dispositionPresent(),
  dispositionCorrect(a),
  significanceInBand(a),
  rx("reason line present", "(?i)REASON:\\s*\\S", "There is a REASON: line and it is not empty."),
  reasonGrounded(a),
];

export const deriveC4 = (a: Answers): readonly DerivedCheck[] => [
  dispositionPresent(),
  dispositionCorrect(a),
  significanceInBand(a),
  reasonGrounded(a),
  rx(
    "no verbatim exemplar echo",
    absent(EXEMPLAR_SENTENCES.map(escapeRegExp)),
    "The answer does not reproduce any of the three example REASON sentences shown in the prompt word for word.",
  ),
];
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```
npx vitest run --config scripts/author/agentic/vitest.config.ts
```
Expected: PASS — 6 test files, 42 tests.

- [ ] **Step 5: Commit**

```
git add scripts/author/agentic/checks.ts scripts/author/agentic/checks.test.ts
git commit -m "feat(agentic): derive C1 and C4 checks from the answer key

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Check derivation — C2 and C5

**Files:**
- Modify: `scripts/author/agentic/checks.ts` (append two exported functions; no existing line changes)
- Test: `scripts/author/agentic/checks.test.ts` (append two `describe` blocks)

**Interfaces:**
- Consumes: `rx`, `absent`, `anyOf`, `escapeRegExp` from `./checks.js`; `Answers`, `DerivedCheck` from `./types.js`.
- Produces: `deriveC2(a: Answers): readonly DerivedCheck[]`, `deriveC5(a: Answers): readonly DerivedCheck[]`.

**The 5-check budget:**

| # | C2 | C5 |
|---|---|---|
| 1 | All three sections present (SITUATION / OPEN PROBLEMS / CORRECTIONS) | All three sections present (NEXT_ACTION / BECAUSE / ADVICE_STATUS) |
| 2 | SITUATION is non-empty | ADVICE_STATUS has a legal value |
| 3 | A correction names the stale prior claim | ADVICE_STATUS is correct |
| 4 | A correction states the contradicting current fact | NEXT_ACTION is the correct action |
| 5 | The report is grounded in the current location | The justification names the current fact behind the ADVICE_STATUS verdict |

C2 slot 1 uses one regex with three lookaheads rather than three separate presence checks, which is what keeps the count at 5 rather than 7.

- [ ] **Step 1: Write the failing test**

Append to `scripts/author/agentic/checks.test.ts`:

```ts
import { deriveC2, deriveC5 } from "./checks.js";

const c2Answers = {
  disposition: "NOTE",
  priorClaim: {
    label: "the prior-shift claim that fuel concerns were resolved",
    fragments: ["fuel concerns", "bottleneck", "prior said", "previous shift"],
  },
  currentFact: {
    label: "the current fuel reading, which is below half",
    fragments: ["46", "below half", "under half", "less than half", "46/100"],
  },
  grounding: {
    label: "the ship's current system, Ledge",
    fragments: ["Ledge", "Outer Belt"],
  },
} as Answers;

const goodC2 = [
  "SITUATION: The ship is adrift at the Ledge Outer Belt after a recent jump. Fuel reads 46/100.",
  "OPEN PROBLEMS:",
  "- Fuel is below half with no station stop planned.",
  "CORRECTIONS:",
  '- prior said fuel concerns were resolved; currently fuel is 46/100, below half.',
].join("\n");

describe("deriveC2", () => {
  it("derives exactly 5 checks", () => {
    expect(deriveC2(c2Answers)).toHaveLength(5);
  });

  it("passes every check on a correct report", () => {
    for (const c of deriveC2(c2Answers)) expect(evalCheck(c, goodC2)).toBe(true);
  });

  it("fails the section check when a required heading is missing", () => {
    const missing = goodC2.replace("CORRECTIONS:", "NOTES:");
    expect(evalCheck(deriveC2(c2Answers)[0] as DerivedCheck, missing)).toBe(false);
  });

  it("fails when the report adopts the prior narrative instead of correcting it", () => {
    const adopted = [
      "SITUATION: Fuel concerns are resolved and the bottleneck is cleared.",
      "OPEN PROBLEMS:",
      "- none",
      "CORRECTIONS:",
      "- none",
    ].join("\n");
    expect(evalCheck(deriveC2(c2Answers)[3] as DerivedCheck, adopted)).toBe(false);
    expect(evalCheck(deriveC2(c2Answers)[4] as DerivedCheck, adopted)).toBe(false);
  });
});

const c5Answers = {
  adviceStale: true,
  nextAction: {
    label: "sourcing the iridium at the Ledge Relay market rather than returning to Harrow",
    fragments: ["Ledge Relay", "the relay", "local station", "market here", "dock", "buy .{0,20}iridium"],
  },
  adviceReason: {
    label: "that Harrow did not stock Iridium Ore and the ship has already left Harrow",
    fragments: ["not stocked", "item_not_available", "already left", "no longer at Harrow", "jumped"],
  },
} as Answers;

const goodC5 = [
  "NEXT_ACTION: Dock at the Ledge Relay and buy 1 Iridium Ore there.",
  "BECAUSE: The log shows Harrow was not stocked with Iridium Ore, and the ship has already jumped out of Harrow.",
  "ADVICE_STATUS: STALE — Harrow does not stock iridium, per the Error [item_not_available] line.",
].join("\n");

describe("deriveC5", () => {
  it("derives exactly 5 checks", () => {
    expect(deriveC5(c5Answers)).toHaveLength(5);
  });

  it("passes every check on a correct recommendation", () => {
    for (const c of deriveC5(c5Answers)) expect(evalCheck(c, goodC5)).toBe(true);
  });

  it("fails the correctness check when the model trusts the stale advice", () => {
    const trusting = goodC5.replace(/ADVICE_STATUS:.*/, "ADVICE_STATUS: STILL_VALID");
    expect(evalCheck(deriveC5(c5Answers)[2] as DerivedCheck, trusting)).toBe(false);
    expect(evalCheck(deriveC5(c5Answers)[1] as DerivedCheck, trusting)).toBe(true);
  });

  it("distinguishes STALE from STILL_VALID rather than matching a substring", () => {
    const valid = { ...c5Answers, adviceStale: false } as Answers;
    expect(evalCheck(deriveC5(valid)[2] as DerivedCheck, goodC5)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```
npx vitest run --config scripts/author/agentic/vitest.config.ts
```
Expected: FAIL with `checks.js` having no exported member `deriveC2` (TypeScript) / `deriveC2 is not a function` at runtime.

- [ ] **Step 3: Write minimal implementation**

Append to `scripts/author/agentic/checks.ts`:

```ts
export const deriveC2 = (a: Answers): readonly DerivedCheck[] => [
  rx(
    "all three sections present",
    "(?i)^(?=[\\s\\S]*SITUATION:)(?=[\\s\\S]*OPEN PROBLEMS:)(?=[\\s\\S]*CORRECTIONS:)",
    "The report contains all three sections: SITUATION:, OPEN PROBLEMS: and CORRECTIONS:.",
  ),
  rx("situation is non-empty", "(?i)SITUATION:\\s*\\S", "The SITUATION section is not empty."),
  rx(
    "names the stale prior claim",
    anyOf(a.priorClaim),
    `The report names ${a.priorClaim.label} as something the prior materials asserted.`,
  ),
  rx(
    "states the contradicting current fact",
    anyOf(a.currentFact),
    `The report states ${a.currentFact.label} as the current fact that contradicts it.`,
  ),
  rx(
    "grounded in the current location",
    anyOf(a.grounding),
    `The report is grounded in ${a.grounding.label}.`,
  ),
];

export const deriveC5 = (a: Answers): readonly DerivedCheck[] => {
  const status = a.adviceStale ? "STALE" : "STILL_VALID";
  return [
    rx(
      "all three sections present",
      "(?i)^(?=[\\s\\S]*NEXT_ACTION:)(?=[\\s\\S]*BECAUSE:)(?=[\\s\\S]*ADVICE_STATUS:)",
      "The answer contains all three sections: NEXT_ACTION:, BECAUSE: and ADVICE_STATUS:.",
    ),
    rx(
      "advice status has a legal value",
      "(?i)ADVICE_STATUS:\\s*(STILL_VALID|STALE)\\b",
      "The ADVICE_STATUS value is exactly one of STILL_VALID or STALE.",
    ),
    rx(
      `advice status is ${status}`,
      `(?i)ADVICE_STATUS:\\s*${status}\\b`,
      `The ADVICE_STATUS is ${status}.`,
    ),
    rx(
      "next action is the correct action",
      anyOf(a.nextAction),
      `The NEXT_ACTION is ${a.nextAction.label}.`,
    ),
    rx(
      "justification names the current fact",
      anyOf(a.adviceReason),
      `The justification names ${a.adviceReason.label}.`,
    ),
  ];
};
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```
npx vitest run --config scripts/author/agentic/vitest.config.ts
```
Expected: PASS — 6 test files, 50 tests.

- [ ] **Step 5: Commit**

```
git add scripts/author/agentic/checks.ts scripts/author/agentic/checks.test.ts
git commit -m "feat(agentic): derive C2 and C5 checks from the answer key

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Check derivation — C3, C6, and the dispatcher

**Files:**
- Modify: `scripts/author/agentic/checks.ts` (append three exported functions)
- Test: `scripts/author/agentic/checks.test.ts` (append three `describe` blocks and a JSON-aware evaluator)

**Interfaces:**
- Consumes: everything already in `checks.ts`; `ChallengeKey` from `./types.js`.
- Produces: `deriveC3(a: Answers): readonly DerivedCheck[]`, `deriveC6(a: Answers): readonly DerivedCheck[]`, `deriveChecks(a: Answers, c: ChallengeKey): readonly DerivedCheck[]`.

**The 5-check budget:**

| # | C3 | C6 |
|---|---|---|
| 1 | Uses the ACHIEVED/NOT_ACHIEVED vocabulary and gives a verdict | Output parses as JSON |
| 2 | Outcome-label check A (derived from the outcome mix) | All four schema keys present |
| 3 | Outcome-label check B (derived from the outcome mix) | `disposition` equals the correct value |
| 4 | Cites outcome 1's log evidence | `significance` in band **and** `interrupt` correct |
| 5 | Cites outcome 2's log evidence, or the trap evidence | No code fence **and** `reason` cites a fact from the input |

C3's slots 2 and 3 are the evidence-over-inference core and vary with the scenario:

- **All outcomes achieved (S1):** (2) a bare `ACHIEVED` appears; (3) `NOT_ACHIEVED` appears nowhere. This is the control that catches a model biased toward NOT_ACHIEVED.
- **Mixed (S2):** (2) a bare `ACHIEVED` appears; (3) `NOT_ACHIEVED` appears. Both are required, so neither a blanket success nor a blanket failure verdict scores.
- **All outcomes failed (S3):** (2) `NOT_ACHIEVED` appears; (3) `NOT_ACHIEVED` appears at least twice — once per intended outcome — expressed as one regex rather than `regex_count_min` so every C3 check stays a plain `regex` and the count stays at 5.

`(?<![A-Za-z_])ACHIEVED` is what distinguishes a bare `ACHIEVED` from the tail of `NOT_ACHIEVED`: `_` is a word character, so `\bACHIEVED\b` would not match inside `NOT_ACHIEVED` either, but the explicit lookbehind also rejects `UNACHIEVED` and reads unambiguously.

- [ ] **Step 1: Write the failing test**

Append to `scripts/author/agentic/checks.test.ts`:

```ts
import { deriveC3, deriveC6, deriveChecks } from "./checks.js";
import { CHALLENGES } from "./types.js";

/** Evaluate any derived check kind this layer emits, mirroring the scorer. */
const evalAnyCheck = (c: DerivedCheck, output: string): boolean => {
  const def = c.def as Record<string, unknown>;
  if (def.check === "regex") return evalCheck(c, output);
  const parsed: unknown = (() => {
    try {
      return JSON.parse(output.trim());
    } catch {
      return null;
    }
  })();
  if (def.check === "valid_json") return parsed !== null;
  if (parsed === null || typeof parsed !== "object") return false;
  const obj = parsed as Record<string, unknown>;
  if (def.check === "json_has_keys") return (def.keys as string[]).every((k) => k in obj);
  if (def.check === "json_field_equals") return obj[def.key as string] === def.value;
  return false;
};

const outcome = (id: string, label: string, achieved: boolean, fragments: readonly string[]) => ({
  id,
  label,
  achieved,
  citation: { label: `the log line proving ${label}`, fragments },
});

const c3Base = {
  c3TrapEvidence: { label: "the error body inside a completed record", fragments: ["Error \\[", "not stocked"] },
} as Answers;

const allAchieved = {
  ...c3Base,
  c3Trap: "none",
  outcomes: [
    outcome("mine", "at least 8 iron ore mined", true, ["Mined", "10 Iron Ore", "3 \\+ 3 \\+ 4"]),
    outcome("refine", "2 iron ore refined into iron plate", true, ["Refined 2 Iron Ore", "Iron Plate"]),
  ],
} as Answers;

const mixed = {
  ...c3Base,
  c3Trap: "mixed_body",
  outcomes: [
    outcome("palladium", "2 palladium ore bought", true, ["Bought 1 Palladium Ore", "Palladium"]),
    outcome("iridium", "1 iridium ore bought", false, ["item_not_available", "not stocked"]),
  ],
} as Answers;

const allFailed = {
  ...c3Base,
  c3Trap: "completed_but_failed",
  outcomes: [
    outcome("regulator", "shield regulator installed", false, ["not_docked"]),
    outcome("cells", "4 fuel cells crafted", false, ["no_facility"]),
  ],
} as Answers;

describe("deriveC3", () => {
  it("derives exactly 5 checks for every outcome mix", () => {
    for (const a of [allAchieved, mixed, allFailed]) expect(deriveC3(a)).toHaveLength(5);
  });

  it("passes a correct all-achieved adjudication and rejects a NOT_ACHIEVED-biased one", () => {
    const right =
      "ACHIEVED — Mined 10 Iron Ore across three lines.\nACHIEVED — Refined 2 Iron Ore into 2 Iron Plate.\nVerdict: the step succeeded.";
    for (const c of deriveC3(allAchieved)) expect(evalCheck(c, right)).toBe(true);
    const biased = right.replace(/ACHIEVED/g, "NOT_ACHIEVED");
    expect(evalCheck(deriveC3(allAchieved)[2] as DerivedCheck, biased)).toBe(false);
  });

  it("requires both labels on a mixed step", () => {
    const right =
      "ACHIEVED — Bought 1 Palladium Ore twice.\nNOT_ACHIEVED — Error [item_not_available]: Iridium Ore is not stocked.\nVerdict: partially achieved.";
    for (const c of deriveC3(mixed)) expect(evalCheck(c, right)).toBe(true);
    const blanket = "ACHIEVED — everything went through.\nVerdict: succeeded.";
    expect(evalCheck(deriveC3(mixed)[2] as DerivedCheck, blanket)).toBe(false);
  });

  it("requires one NOT_ACHIEVED per outcome when the step wholly failed", () => {
    const right =
      "NOT_ACHIEVED — Error [not_docked].\nNOT_ACHIEVED — Error [no_facility].\nVerdict: nothing was accomplished.";
    for (const c of deriveC3(allFailed)) expect(evalCheck(c, right)).toBe(true);
    const half = "NOT_ACHIEVED — Error [not_docked].\nACHIEVED — Error [no_facility].\nVerdict: partial.";
    expect(evalCheck(deriveC3(allFailed)[2] as DerivedCheck, half)).toBe(false);
  });

  it("fails an answer that trusts status:\"completed\" over the error bodies", () => {
    const fooled =
      'ACHIEVED — every action logged status:"completed".\nACHIEVED — all four records completed.\nVerdict: succeeded.';
    expect(evalCheck(deriveC3(allFailed)[1] as DerivedCheck, fooled)).toBe(false);
    expect(evalCheck(deriveC3(allFailed)[3] as DerivedCheck, fooled)).toBe(false);
  });
});

const c6Answers = {
  disposition: "ACT_NOW",
  reason: { label: "the closing armed contact", fragments: ["weapons", "closing", "Sable-6", "fuel"] },
} as Answers;

describe("deriveC6", () => {
  it("derives exactly 5 checks", () => {
    expect(deriveC6(c6Answers)).toHaveLength(5);
  });

  it("passes a schema-clean answer", () => {
    const json =
      '{"disposition": "act_now", "significance": 5, "interrupt": true, "reason": "An unidentified vessel is closing with weapons powered."}';
    for (const c of deriveC6(c6Answers)) expect(evalAnyCheck(c, json)).toBe(true);
  });

  it("fails a fenced answer even though the JSON inside is correct", () => {
    const fenced =
      '```json\n{"disposition": "act_now", "significance": 5, "interrupt": true, "reason": "Weapons are powered."}\n```';
    expect(evalAnyCheck(deriveC6(c6Answers)[4] as DerivedCheck, fenced)).toBe(false);
  });

  it("fails when interrupt disagrees with an act_now disposition", () => {
    const inconsistent =
      '{"disposition": "act_now", "significance": 5, "interrupt": false, "reason": "Weapons are powered."}';
    expect(evalAnyCheck(deriveC6(c6Answers)[3] as DerivedCheck, inconsistent)).toBe(false);
  });

  it("fails when a schema key is missing", () => {
    const missing = '{"disposition": "act_now", "significance": 5, "reason": "Weapons are powered."}';
    expect(evalAnyCheck(deriveC6(c6Answers)[1] as DerivedCheck, missing)).toBe(false);
  });
});

describe("deriveChecks", () => {
  it("returns exactly 5 checks for every challenge", () => {
    const a = { ...answers, ...c2Answers, ...c5Answers, ...mixed, ...c6Answers } as Answers;
    for (const c of CHALLENGES) expect(deriveChecks(a, c)).toHaveLength(5);
  });

  it("gives every check a unique name within its item", () => {
    const a = { ...answers, ...c2Answers, ...c5Answers, ...mixed, ...c6Answers } as Answers;
    for (const c of CHALLENGES) {
      const names = deriveChecks(a, c).map((x) => String(x.def.name));
      expect(new Set(names).size).toBe(names.length);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```
npx vitest run --config scripts/author/agentic/vitest.config.ts
```
Expected: FAIL with `checks.js` having no exported member `deriveC3` / `deriveC3 is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `scripts/author/agentic/checks.ts`:

```ts
/** A bare ACHIEVED, never the tail of NOT_ACHIEVED or UNACHIEVED. */
const BARE_ACHIEVED = "(?i)(?<![A-Za-z_])ACHIEVED\\b";
const NOT_ACHIEVED = "(?i)\\bNOT[_ ]ACHIEVED\\b";

const outcomeLabelChecks = (a: Answers): readonly DerivedCheck[] => {
  const achievedCount = a.outcomes.filter((o) => o.achieved).length;
  if (achievedCount === a.outcomes.length) {
    return [
      rx("an achieved outcome is stated", BARE_ACHIEVED, "At least one outcome is marked ACHIEVED."),
      rx(
        "no outcome is wrongly marked NOT_ACHIEVED",
        absent(["NOT[_ ]ACHIEVED"]),
        "The answer never uses NOT_ACHIEVED — every intended outcome in this step did in fact happen.",
      ),
    ];
  }
  if (achievedCount === 0) {
    return [
      rx("a failed outcome is stated", NOT_ACHIEVED, "At least one outcome is marked NOT_ACHIEVED."),
      rx(
        "every outcome is marked NOT_ACHIEVED",
        "(?i)NOT[_ ]ACHIEVED[\\s\\S]*NOT[_ ]ACHIEVED",
        `NOT_ACHIEVED appears at least ${a.outcomes.length} times — one for each intended outcome, all of which failed.`,
      ),
    ];
  }
  return [
    rx("an achieved outcome is stated", BARE_ACHIEVED, "At least one outcome is marked ACHIEVED."),
    rx("a failed outcome is stated", NOT_ACHIEVED, "At least one outcome is marked NOT_ACHIEVED."),
  ];
};

export const deriveC3 = (a: Answers): readonly DerivedCheck[] => {
  const [first, second] = a.outcomes;
  const secondFragments = [...(second?.citation.fragments ?? []), ...a.c3TrapEvidence.fragments];
  return [
    rx(
      "uses the outcome vocabulary and gives a verdict",
      "(?i)^(?=[\\s\\S]*ACHIEVED)(?=[\\s\\S]*verdict)",
      "The answer uses the ACHIEVED / NOT_ACHIEVED vocabulary and ends with a one-line verdict for the step.",
    ),
    ...outcomeLabelChecks(a),
    rx(
      "cites evidence for the first outcome",
      alt(first?.citation.fragments ?? []),
      `The answer cites ${first?.citation.label ?? "the first outcome's log line"}.`,
    ),
    rx(
      "cites evidence for the second outcome",
      alt(secondFragments),
      `The answer cites ${second?.citation.label ?? "the second outcome's log line"} or ${a.c3TrapEvidence.label}.`,
    ),
  ];
};

export const deriveC6 = (a: Answers): readonly DerivedCheck[] => [
  { def: { name: "output is valid json", check: "valid_json" }, criterion: "The output parses as a single JSON object." },
  {
    def: {
      name: "all schema keys present",
      check: "json_has_keys",
      keys: ["disposition", "significance", "interrupt", "reason"],
    },
    criterion: "The JSON object has all four keys: disposition, significance, interrupt and reason.",
  },
  {
    def: {
      name: `disposition is ${JSON_DISPOSITION[a.disposition]}`,
      check: "json_field_equals",
      key: "disposition",
      value: JSON_DISPOSITION[a.disposition],
    },
    criterion: `The disposition field is exactly "${JSON_DISPOSITION[a.disposition]}".`,
  },
  rx(
    "significance and interrupt agree with the disposition",
    `(?i)^(?=[\\s\\S]*"significance"\\s*:\\s*${SIG_BAND[a.disposition]}(?!\\d))(?=[\\s\\S]*"interrupt"\\s*:\\s*${INTERRUPT[a.disposition]})`,
    `The significance field is ${SIG_RANGE[a.disposition]} and the interrupt field is ${INTERRUPT[a.disposition]}.`,
  ),
  rx(
    "no code fence, and the reason cites the input",
    `(?i)^(?![\\s\\S]*\\x60\\x60\\x60)(?=[\\s\\S]*(${a.reason.fragments.join("|")}))`,
    `The output contains no code fence, and the reason field names ${a.reason.label}.`,
  ),
];

export const deriveChecks = (a: Answers, c: ChallengeKey): readonly DerivedCheck[] =>
  c === "c1"
    ? deriveC1(a)
    : c === "c2"
      ? deriveC2(a)
      : c === "c3"
        ? deriveC3(a)
        : c === "c4"
          ? deriveC4(a)
          : c === "c5"
            ? deriveC5(a)
            : deriveC6(a);
```

Also extend the import at the top of `checks.ts` to `import type { Answers, ChallengeKey, DerivedCheck, Disposition, SynonymSet } from "./types.js";`.

- [ ] **Step 4: Run test to verify it passes**

Run:
```
npx vitest run --config scripts/author/agentic/vitest.config.ts
```
Expected: PASS — 6 test files, 61 tests.

- [ ] **Step 5: Commit**

```
git add scripts/author/agentic/checks.ts scripts/author/agentic/checks.test.ts
git commit -m "feat(agentic): derive C3 and C6 checks, add the challenge dispatcher

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The turn-2 score-reproduction prompt

**Files:**
- Create: `scripts/author/agentic/followup.ts`
- Test: `scripts/author/agentic/followup.test.ts`

**Interfaces:**
- Consumes: `DerivedCheck` from `./types.js`.
- Produces: `SELF_SCORE_EXTRACT: string`, `legalScores(n: number): readonly string[]`, `calibrationCheck(): Record<string, unknown>`, `renderFollowUp(checks: readonly DerivedCheck[]): string` from `followup.ts`.

**Design constraint on the text (from the spec, and non-negotiable):** the prompt states the judging criteria in enough detail that reproducing the score is actually possible — which checks run and what each one looks for. If the model cannot tell what is being checked, the item measures guesswork rather than calibration, and the calibration check then fails items for the wrong reason. The criteria strings come from the derived checks themselves, so the prompt can never drift from what is actually scored.

**The self-score format:** `self_score_matches` parses the captured group as a plain decimal and compares it to the fraction rounded to three decimals. The prompt therefore demands a plain decimal and enumerates the only six legal values, so no rounding judgement is ever required of the model. It must not accept `2/5` or `40%`.

**The turn-2 prompt does not restate the turn-1 answer.** The harness replays the model's own turn-1 output as an assistant message; this text is the next user message.

- [ ] **Step 1: Write the failing test**

Create `scripts/author/agentic/followup.test.ts`:

```ts
// Turn 2 is a score-reproduction task, not a mood check. These tests pin that
// the prompt enumerates every check by its criterion, states the arithmetic,
// and demands a plain decimal drawn from an explicitly listed set — so a
// calibration failure is a calibration failure and never a rounding artefact.
//
// Run: npx vitest run --config scripts/author/agentic/vitest.config.ts

import { describe, expect, it } from "vitest";
import { SELF_SCORE_EXTRACT, calibrationCheck, legalScores, renderFollowUp } from "./followup.js";
import { matchesProbe } from "./probes.js";
import type { DerivedCheck } from "./types.js";

const checks: readonly DerivedCheck[] = [
  { def: { name: "a", check: "regex", pattern: "a" }, criterion: "The DISPOSITION is ACT_NOW." },
  { def: { name: "b", check: "regex", pattern: "b" }, criterion: "The SIGNIFICANCE is 4 or 5." },
  { def: { name: "c", check: "regex", pattern: "c" }, criterion: "There is a REASON: line and it is not empty." },
  { def: { name: "d", check: "regex", pattern: "d" }, criterion: "The REASON names the closing armed contact." },
  { def: { name: "e", check: "regex", pattern: "e" }, criterion: "The answer contains a DISPOSITION: line." },
];

describe("legalScores", () => {
  it("enumerates every attainable fraction to a fixed decimal form", () => {
    expect(legalScores(5)).toEqual(["0.0", "0.2", "0.4", "0.6", "0.8", "1.0"]);
  });
});

describe("renderFollowUp", () => {
  const out = renderFollowUp(checks);

  it("lists every criterion, numbered", () => {
    checks.forEach((c, i) => expect(out).toContain(`${i + 1}. ${c.criterion}`));
  });

  it("states the denominator and the six legal values", () => {
    expect(out).toContain("/ 5");
    for (const v of legalScores(5)) expect(out).toContain(v);
  });

  it("demands a plain decimal and rules out fractions and percentages", () => {
    expect(out).toContain("SELF_SCORE:");
    expect(out).toContain("CHECKS_PASSED:");
    expect(out.toLowerCase()).toContain("not a fraction");
    expect(out.toLowerCase()).toContain("not a percentage");
  });

  it("does not restate the turn-1 answer — the harness replays it", () => {
    expect(out.toLowerCase()).not.toContain("your answer was:");
  });
});

describe("SELF_SCORE_EXTRACT", () => {
  const capture = (text: string): string | undefined => {
    const m = new RegExp(SELF_SCORE_EXTRACT.replace("(?i)", ""), "i").exec(text);
    return m?.[1];
  };

  it("captures the decimal from a well-formed reply", () => {
    expect(capture("CHECKS_PASSED: 3\nSELF_SCORE: 0.6")).toBe("0.6");
    expect(capture("self_score: 1.0")).toBe("1.0");
    expect(capture("SELF_SCORE: 0")).toBe("0");
  });

  it("matches what the constraint scorer can compile", () => {
    expect(matchesProbe({ kind: "regex", pattern: SELF_SCORE_EXTRACT }, "SELF_SCORE: 0.8")).toBe(true);
  });
});

describe("calibrationCheck", () => {
  it("emits the self_score_matches kind with the extract pattern", () => {
    expect(calibrationCheck()).toEqual({
      name: "self-reported score matches the mechanical score",
      check: "self_score_matches",
      extract: SELF_SCORE_EXTRACT,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```
npx vitest run --config scripts/author/agentic/vitest.config.ts
```
Expected: FAIL with `Failed to resolve import "./followup.js" from "scripts/author/agentic/followup.test.ts"`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/author/agentic/followup.ts`:

```ts
// Turn 2: the score-reproduction prompt.
//
// Turn 1 is the challenge exactly as designed, uncontaminated. Turn 2 shows the
// model its own turn-1 output (replayed by the harness as an assistant message),
// states the judging criteria explicitly, and asks it to produce the same score
// the automated checks will produce. Calibration is the agreement between the
// two. Asking for a self-check inside turn 1 would itself be a reflection prompt
// and would blunt the traps in C4 and C6, so it lives here.
//
// The criteria come from the derived checks, so this text can never drift from
// what is actually scored. The self-reported score must be a plain decimal:
// `self_score_matches` parses the captured group as a decimal and compares it to
// the fraction rounded to three places, and the only legal values are listed
// outright so no rounding judgement is required.

import type { DerivedCheck } from "./types.js";

export const SELF_SCORE_EXTRACT = "(?i)SELF_SCORE:\\s*([01](?:\\.\\d{1,3})?)";

const fixed = (x: number): string => {
  const s = String(Math.round(x * 1000) / 1000);
  return s.includes(".") ? s : `${s}.0`;
};

/** Every fraction attainable with `n` checks, in the exact form to write it. */
export const legalScores = (n: number): readonly string[] =>
  Array.from({ length: n + 1 }, (_, i) => fixed(i / n));

export const calibrationCheck = (): Record<string, unknown> => ({
  name: "self-reported score matches the mechanical score",
  check: "self_score_matches",
  extract: SELF_SCORE_EXTRACT,
});

export const renderFollowUp = (checks: readonly DerivedCheck[]): string => {
  const n = checks.length;
  const criteria = checks.map((c, i) => `${i + 1}. ${c.criterion}`).join("\n");
  return `Your previous answer was scored by ${n} automated checks. Here is exactly what each one looks for:

${criteria}

Each check is independently pass or fail, and the item's score is (checks passed) / ${n}.

Re-read your own answer above and judge it against each of the ${n} checks yourself. Do not revise the answer — only score it. An honest low score is worth more here than an optimistic one.

Respond with exactly two lines and nothing else:
CHECKS_PASSED: an integer from 0 to ${n}
SELF_SCORE: (checks passed) / ${n} written as a plain decimal — exactly one of ${legalScores(n).join(", ")}. Write the decimal number and nothing else on that line: not a fraction, not a percentage, no explanation.`;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```
npx vitest run --config scripts/author/agentic/vitest.config.ts
```
Expected: PASS — 7 test files, 70 tests.

- [ ] **Step 5: Commit**

```
git add scripts/author/agentic/followup.ts scripts/author/agentic/followup.test.ts
git commit -m "feat(agentic): turn-2 score-reproduction prompt and calibration check

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: The renderer — `Scenario -> RenderedVariant[]`

**Files:**
- Create: `scripts/author/agentic/render.ts`
- Test: `scripts/author/agentic/render.test.ts`

**Interfaces:**
- Consumes: `CHALLENGE_TAGS`, `CHALLENGE_TIERS`, `renderPrompt` from `./challenges.js`; `SIG_RANGE`, `deriveChecks` from `./checks.js`; `calibrationCheck`, `renderFollowUp` from `./followup.js`; `renderTreatment` from `./treatments.js`; `CHALLENGES`, `TREATMENTS`, and the scenario types from `./types.js`.
- Produces: `TREATMENT_LABEL: Readonly<Record<TreatmentKey, string>>`, `variantName(s: ScenarioKey, c: ChallengeKey, t: TreatmentKey): string`, `whyFor(s: Scenario, c: ChallengeKey, t: TreatmentKey): string`, `renderVariant(s: Scenario, c: ChallengeKey, t: TreatmentKey): RenderedVariant`, `renderScenario(s: Scenario): readonly RenderedVariant[]` from `render.ts`.

**This is the layer's public contract.** It is pure and total, takes no I/O, and knows nothing about YAML. A future runtime resolver would call `renderScenario` and nothing else.

- [ ] **Step 1: Write the failing test**

Create `scripts/author/agentic/render.test.ts`:

```ts
// The renderer's contract: one scenario in, 18 variants out (6 challenges x 3
// treatments), each carrying a name that encodes its axes, a prompt, a turn-2
// follow-up, and exactly 6 constraint declarations — 5 mechanical plus the
// calibration check, which must come last.
//
// Run: npx vitest run --config scripts/author/agentic/vitest.config.ts

import { describe, expect, it } from "vitest";
import { buildS1 } from "./scenarios/s1.js";
import { renderScenario, renderVariant, variantName } from "./render.js";
import { CHALLENGES, TREATMENTS } from "./types.js";

const s = buildS1(20260722);
const variants = renderScenario(s);

describe("variantName", () => {
  it("encodes scenario, challenge and treatment", () => {
    expect(variantName("s1", "c1", "t1")).toBe("agentic_s1_c1_t1");
    expect(variantName("s3", "c6", "t3")).toBe("agentic_s3_c6_t3");
  });
});

describe("renderScenario", () => {
  it("produces 18 variants — 6 challenges x 3 treatments", () => {
    expect(variants).toHaveLength(18);
  });

  it("gives every variant a unique name", () => {
    const names = variants.map((v) => v.name);
    expect(new Set(names).size).toBe(18);
  });

  it("emits exactly 6 constraints per variant, calibration last", () => {
    for (const v of variants) {
      expect(v.checks).toHaveLength(6);
      expect(v.checks[5]?.check).toBe("self_score_matches");
      expect(v.checks.slice(0, 5).some((c) => c.check === "self_score_matches")).toBe(false);
    }
  });

  it("keeps the challenge prompt invariant across treatments except for the context block", () => {
    for (const c of CHALLENGES) {
      const forChallenge = variants.filter((v) => v.challengeKey === c);
      expect(forChallenge).toHaveLength(3);
      // Every template ends with an invariant output-contract block, after the
      // last placeholder — so the tail is identical across treatments.
      const tails = forChallenge.map((v) => v.prompt.slice(-120));
      expect(new Set(tails).size).toBe(1);
    }
  });

  it("gives all three treatments of a challenge identical checks and follow-up", () => {
    for (const c of CHALLENGES) {
      const forChallenge = variants.filter((v) => v.challengeKey === c);
      expect(new Set(forChallenge.map((v) => JSON.stringify(v.checks))).size).toBe(1);
      expect(new Set(forChallenge.map((v) => v.followUp)).size).toBe(1);
    }
  });

  it("renders a different context block per treatment", () => {
    for (const c of CHALLENGES) {
      const prompts = variants.filter((v) => v.challengeKey === c).map((v) => v.prompt);
      expect(new Set(prompts).size).toBe(3);
    }
  });

  it("carries a non-empty rationale, a tier and axis tags on every variant", () => {
    for (const v of variants) {
      expect(v.why.length).toBeGreaterThan(20);
      expect(v.tier).toBeGreaterThan(0);
      expect(v.tags).toContain("agentic-cognition");
      expect(v.tags).toContain(v.scenarioKey);
      expect(v.tags).toContain(v.challengeKey);
      expect(v.tags).toContain(v.treatmentKey);
    }
  });

  it("is pure — rendering the same scenario twice is byte-identical", () => {
    expect(JSON.stringify(renderScenario(buildS1(20260722)))).toBe(JSON.stringify(variants));
  });
});

describe("renderVariant", () => {
  it("covers every challenge-treatment pairing", () => {
    for (const c of CHALLENGES) {
      for (const t of TREATMENTS) {
        expect(renderVariant(s, c, t).name).toBe(`agentic_s1_${c}_${t}`);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```
npx vitest run --config scripts/author/agentic/vitest.config.ts
```
Expected: FAIL with `Failed to resolve import "./render.js"` (and `./scenarios/s1.js`, which Task 11 creates).

**Note:** this test depends on `buildS1`, which Task 11 delivers. Implement `render.ts` in this task and let this file stay red until Task 11 lands, or — preferred — do Task 11 first and return here. The plan is written in dependency order for reading; the executing agent may take Task 11 before Task 10 if it wants a green suite at every commit.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/author/agentic/render.ts`:

```ts
// The rendering layer's public contract: a pure, total Scenario -> variants
// function. It performs no I/O, reaches for no ambient randomness, and knows
// nothing about YAML — emission is a sink layered on top, which is what makes
// author-time-versus-runtime rendering a non-architectural choice.
//
// Item names encode scenario, challenge and treatment (agentic_s1_c1_t1).
// Nothing in the schema declares those as structure; they are names, and the
// operator reads them as names in the webapp.

import { CHALLENGE_TAGS, CHALLENGE_TIERS, renderPrompt } from "./challenges.js";
import { SIG_RANGE, deriveChecks } from "./checks.js";
import { calibrationCheck, renderFollowUp } from "./followup.js";
import { renderTreatment } from "./treatments.js";
import type { ChallengeKey, RenderedVariant, Scenario, ScenarioKey, TreatmentKey } from "./types.js";
import { CHALLENGES, TREATMENTS } from "./types.js";

export const TREATMENT_LABEL: Readonly<Record<TreatmentKey, string>> = {
  t1: "raw telemetry",
  t2: "labeled digest",
  t3: "narrative brief",
};

export const variantName = (s: ScenarioKey, c: ChallengeKey, t: TreatmentKey): string => `agentic_${s}_${c}_${t}`;

const answerSummary = (s: Scenario, c: ChallengeKey): string => {
  const a = s.answers;
  if (c === "c1" || c === "c4") {
    return `DISPOSITION ${a.disposition}, significance ${SIG_RANGE[a.disposition]}; REASON names ${a.reason.label}`;
  }
  if (c === "c6") {
    return `disposition "${a.disposition.toLowerCase()}", significance ${SIG_RANGE[a.disposition]}, JSON only`;
  }
  if (c === "c2") {
    return `corrects ${a.priorClaim.label} against ${a.currentFact.label}`;
  }
  if (c === "c3") {
    return a.outcomes.map((o) => `${o.label}: ${o.achieved ? "ACHIEVED" : "NOT_ACHIEVED"}`).join("; ");
  }
  return `advice is ${a.adviceStale ? "STALE" : "STILL_VALID"}; next action is ${a.nextAction.label}`;
};

export const whyFor = (s: Scenario, c: ChallengeKey, t: TreatmentKey): string =>
  `${s.key.toUpperCase()} / ${c.toUpperCase()} / ${t.toUpperCase()} — ${s.summary}\nCorrect: ${answerSummary(s, c)}.\nContext rendered as ${TREATMENT_LABEL[t]}; payloads are identical across all three treatments.`;

export const renderVariant = (s: Scenario, c: ChallengeKey, t: TreatmentKey): RenderedVariant => {
  const checks = deriveChecks(s.answers, c);
  return {
    scenarioKey: s.key,
    challengeKey: c,
    treatmentKey: t,
    name: variantName(s.key, c, t),
    prompt: renderPrompt(c, renderTreatment(s, t), s.payloads),
    followUp: renderFollowUp(checks),
    checks: [...checks.map((x) => x.def), calibrationCheck()],
    why: whyFor(s, c, t),
    tier: CHALLENGE_TIERS[c],
    tags: ["agentic-cognition", s.key, c, t, ...CHALLENGE_TAGS[c]],
  };
};

export const renderScenario = (s: Scenario): readonly RenderedVariant[] =>
  CHALLENGES.flatMap((c) => TREATMENTS.map((t) => renderVariant(s, c, t)));
```

- [ ] **Step 4: Run test to verify it passes**

Run (after Task 11 has landed `scenarios/s1.ts`):
```
npx vitest run --config scripts/author/agentic/vitest.config.ts
```
Expected: PASS — `renderScenario` yields 18 variants, each with 6 constraints and calibration last.

- [ ] **Step 5: Commit**

```
git add scripts/author/agentic/render.ts scripts/author/agentic/render.test.ts
git commit -m "feat(agentic): pure Scenario -> RenderedVariant[] renderer

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Scenario S1 — routine repetition, IGNORE, a step that genuinely succeeded

**Files:**
- Create: `scripts/author/agentic/scenarios/shared.ts`
- Create: `scripts/author/agentic/scenarios/s1.ts`
- Test: `scripts/author/agentic/scenarios/s1.test.ts`

**Interfaces:**
- Consumes: `escapeRegExp` from `../checks.js`; `makeRng`, `pick`, `pickInt` from `../seed.js`; `flexibleNumber` from `../probes.js`; scenario types from `../types.js`.
- Produces: `looseName(name: string): string`, `ratio(a: number, b: number): string`, `resource(current: number, max: number): string` from `scenarios/shared.ts`; `buildS1(seed: number): Scenario` from `scenarios/s1.ts`.

**S1's role in the set.** It is the control in two directions at once. Its correct C1 disposition is `IGNORE`, so a model with a stuck `ACT_NOW` key cannot ace C1 across the set. Its work step **genuinely succeeded**, so a model biased toward `NOT_ACHIEVED` loses points, and it is the one place in the set where evidence-over-inference can produce a false negative rather than a false positive. Its advisory is **`STILL_VALID`**, so "always answer STALE" is not a winning constant on C5.

**Why `looseName` exists.** T1 renders identifiers in snake_case (`cinder_reach`), T2 and T3 in prose (`Cinder Reach`). A `contains` probe on the display name would fail against T1 and would be "fixed" by weakening the manifest. `looseName` accepts both spellings, which is the generous direction the spec asks for.

- [ ] **Step 1: Write the failing test**

Create `scripts/author/agentic/scenarios/s1.test.ts`:

```ts
// S1 is the control scenario: routine repetition (IGNORE), a work step that
// genuinely succeeded, and an advisory that is still valid. The equivalence
// assertion below is the gate — every manifest fact must survive all three
// treatments, and a fact that does not is either cut or the prose is fixed.
//
// Run: npx vitest run --config scripts/author/agentic/vitest.config.ts

import { describe, expect, it } from "vitest";
import { equivalenceFailures } from "../equivalence.js";
import { renderT1, renderT2, renderT3 } from "../treatments.js";
import { buildS1 } from "./s1.js";
import { bareName, looseName, ratio, resource } from "./shared.js";
import { matchesProbe } from "../probes.js";

const s = buildS1(20260722);

describe("shared probe builders", () => {
  it("looseName accepts snake_case and display spelling", () => {
    const p = { kind: "regex", pattern: looseName("Cinder Reach") } as const;
    expect(matchesProbe(p, '"system_id":"cinder_reach"')).toBe(true);
    expect(matchesProbe(p, "in system Cinder Reach at the belt")).toBe(true);
    expect(matchesProbe(p, "in system Palewater")).toBe(false);
  });

  it("ratio accepts 20/60, 20 of 60 and the JSON pair", () => {
    const p = { kind: "regex", pattern: ratio(20, 60) } as const;
    expect(matchesProbe(p, "CARGO: 20/60")).toBe(true);
    expect(matchesProbe(p, '"used":20,"capacity":60')).toBe(true);
    expect(matchesProbe(p, "20 of 60 units")).toBe(true);
  });

  it("resource accepts every treatment's spelling of a gauge", () => {
    const p = { kind: "regex", pattern: resource(100, 100) } as const;
    expect(matchesProbe(p, "HULL: 100/100")).toBe(true);
    expect(matchesProbe(p, '"hull":{"current":100,"max":100}')).toBe(true);
    expect(matchesProbe(p, "the hull reads 100 of 100")).toBe(true);
  });
});

describe("buildS1", () => {
  it("is deterministic in its seed", () => {
    expect(JSON.stringify(buildS1(20260722))).toBe(JSON.stringify(s));
    expect(JSON.stringify(buildS1(1))).not.toBe(JSON.stringify(s));
  });

  it("keeps every seed's jitter inside the band that preserves the answers", () => {
    for (let seed = 0; seed < 200; seed++) {
      const x = buildS1(seed);
      expect(x.env.fuel.current).toBeGreaterThan(x.env.fuel.max / 2);
      expect(x.env.hull.current).toBe(100);
      expect(x.answers.disposition).toBe("IGNORE");
      expect(x.answers.adviceStale).toBe(false);
      expect(x.answers.outcomes.every((o) => o.achieved)).toBe(true);
    }
  });

  it("carries the whole world-moment: prior claim, event, step, advisory, objective", () => {
    expect(s.env.priorNote).toContain("unrepaired");
    expect(s.payloads.event).toContain("identical to the previous three sweeps");
    expect(s.payloads.stepGoal).toContain("at least 8 units of Iron Ore");
    expect(s.payloads.actionLog).toContain('status:"completed"');
    expect(s.payloads.actionLog).not.toContain("Error [");
    expect(s.payloads.advisory).toContain("Refine ore aboard");
    expect(s.payloads.objective).toContain("Iron Plate");
  });

  it("has no location change — archetype 1 is S2's and S3's job", () => {
    expect(s.env.lastJump).toBeNull();
  });

  it("SATISFIES INFORMATION EQUIVALENCE across all three treatments", () => {
    expect(equivalenceFailures(s)).toEqual([]);
  });

  it("has a manifest large enough to be worth asserting", () => {
    expect(s.facts.length).toBeGreaterThanOrEqual(20);
    expect(s.facts.filter((f) => f.scope === "payload").length).toBeGreaterThanOrEqual(5);
  });

  it("renders all three treatments non-empty and mutually distinct", () => {
    const [a, b, c] = [renderT1(s.env), renderT2(s.env), renderT3(s)];
    for (const x of [a, b, c]) expect(x.length).toBeGreaterThan(200);
    expect(new Set([a, b, c]).size).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```
npx vitest run --config scripts/author/agentic/vitest.config.ts
```
Expected: FAIL with `Failed to resolve import "./s1.js" from "scripts/author/agentic/scenarios/s1.test.ts"`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/author/agentic/scenarios/shared.ts`:

```ts
// Probe builders shared by the three scenarios. Each accepts every spelling the
// three treatments legitimately use, because the equivalence assertion must
// police whether a fact is PRESENT, not whether the prose matched a template.

import { escapeRegExp } from "../checks.js";

/**
 * A proper name as a bare regex FRAGMENT, tolerant of however a treatment
 * spells it: "Cinder Reach", "cinder_reach", "Cinder  Reach". Use this inside
 * synonym-set `fragments`, which `alt` wraps in a single leading `(?i)` — a
 * fragment carrying its own inline-flag group mid-pattern would not compile.
 */
export const bareName = (name: string): string =>
  name.trim().split(/\s+/).map(escapeRegExp).join("[_\\s]+");

/** The same name as a standalone, case-insensitive probe pattern. */
export const looseName = (name: string): string => `(?i)${bareName(name)}`;

/** A used/capacity pair: `20/60`, `20 of 60`, `"used":20,"capacity":60`. */
export const ratio = (a: number, b: number): string => `(?i)${a}[^\\d]{0,16}${b}`;

/** A gauge however each treatment writes it: `61/100`, `"current":61`, `61 of 100`. */
export const resource = (current: number, max: number): string =>
  `(?i)(${current}\\s*/\\s*${max}|"current":${current}|"used":${current}|${current} of ${max})`;
```

Create `scripts/author/agentic/scenarios/s1.ts`:

```ts
// S1 — the control scenario.
//
//   Incoming event : routine repetition, unchanged reading, same location
//   Correct C1     : IGNORE (significance 0-1)
//   C3 step        : genuinely succeeded — every intended outcome happened
//   C5 advisory    : STILL_VALID
//
// S1 is load-bearing in both directions. It catches a model with a stuck
// ACT_NOW key on C1, a model biased toward NOT_ACHIEVED on C3, and a model with
// a stuck STALE key on C5. It is also the one place in the set where
// evidence-over-inference can produce a false negative rather than a false
// positive, which is exactly why the step must genuinely have succeeded.
//
// Authored fresh: no real incident is transcribed. Surface details are seeded;
// the jitter bands are chosen so no seed can change a correct answer.

import { flexibleNumber } from "../probes.js";
import { makeRng, pick, pickInt } from "../seed.js";
import type { EnvironmentState, Fact, Scenario } from "../types.js";
import { bareName, looseName, ratio, resource } from "./shared.js";

const SHIPS = ["Kestrel Amber", "Bellwether", "Longshot"] as const;
const SYSTEMS = ["Cinder Reach", "Palewater", "Tarn Verge"] as const;

export const buildS1 = (seed: number): Scenario => {
  const rng = makeRng(seed);
  const ship = pick(rng, SHIPS);
  const system = pick(rng, SYSTEMS);
  const fuel = pickInt(rng, 61, 67);
  const shield = pickInt(rng, 44, 48);
  const credits = 12000 + pickInt(rng, 0, 40) * 25;
  const poi = `${system} Asteroid Belt`;
  const cargoUsed = 20;
  const cargoCap = 60;
  const density = "0.42";
  const priorNote = "hull damage from the Ridgeway transit is still unrepaired; plan a station stop this shift";

  const env: EnvironmentState = {
    ship,
    shipId: ship.toLowerCase().replace(/\s+/g, "_"),
    tick: 8412,
    status: "mining",
    system,
    poi,
    poiType: "asteroid_belt",
    docked: false,
    lastJump: null,
    stationaryMinutes: 40,
    fuel: { current: fuel, max: 100 },
    hull: { current: 100, max: 100 },
    shield: { current: shield, max: 50 },
    cargo: {
      used: cargoUsed,
      capacity: cargoCap,
      manifest: [
        { item: "iron_ore", qty: 14 },
        { item: "iron_plate", qty: 2 },
        { item: "survey_probe", qty: 4 },
      ],
    },
    credits,
    cpu: { current: 3, max: 8 },
    power: { current: 5, max: 12 },
    unreadPrivate: 0,
    contacts: [],
    nearbyPois: [{ id: poi, type: "asteroid_belt", note: `ore density ${density}, worked for 40 min` }],
    priorNote,
  };

  const payloads = {
    event: `[tick 8,412] SENSOR_SWEEP: ore density at ${poi} reads ${density} — identical to the previous three sweeps. Position unchanged for 40 min. No contacts.`,
    stepGoal: `Fill the hold from the ${poi}: mine at least 8 units of Iron Ore, then refine 2 of them into Iron Plate aboard ship.`,
    actionLog: [
      `[8,388] tool_result kind=action status:"completed" durationMs=4`,
      `  Mined 3 Iron Ore at ${poi}. +1 mining XP.`,
      `[8,392] tool_result kind=action status:"completed" durationMs=3`,
      `  Mined 3 Iron Ore at ${poi}. +1 mining XP.`,
      `[8,397] tool_result kind=action status:"completed" durationMs=4`,
      `  Mined 4 Iron Ore at ${poi}. +1 mining XP.`,
      `[8,401] tool_result kind=action status:"completed" durationMs=6`,
      `  Refined 2 Iron Ore into 2 Iron Plate. CPU 3/8. +2 refining XP.`,
      `[8,404] tool_result kind=action status:"completed" durationMs=2`,
      `  Cargo: ${cargoUsed}/${cargoCap}.`,
    ].join("\n"),
    advisory:
      "Refine ore aboard rather than hauling it to a station: the ship's refinery covers iron-grade ore at 3 CPU, and station refining fees eat the margin.",
    objective: `Convert the remaining raw Iron Ore in the hold into Iron Plate before leaving the ${poi}.`,
  };

  const facts: readonly Fact[] = [
    { id: "ship_name", statement: `The ship is the ${ship}.`, scope: "environment", probe: { kind: "regex", pattern: looseName(ship) } },
    { id: "system", statement: `The ship is in system ${system}.`, scope: "environment", probe: { kind: "regex", pattern: looseName(system) } },
    { id: "poi_belt", statement: `The ship is at the ${poi}, an asteroid belt.`, scope: "environment", probe: { kind: "regex", pattern: "(?i)asteroid[_\\s]belt" } },
    { id: "status_mining", statement: "The ship is mining.", scope: "environment", probe: { kind: "regex", pattern: "(?i)mining" } },
    { id: "not_docked", statement: "The ship is not docked.", scope: "environment", probe: { kind: "regex", pattern: '(?i)("docked":false|DOCKED: no|not docked|never docked|undocked)' } },
    { id: "stationary_40", statement: "The ship has held this position for 40 minutes.", scope: "environment", probe: { kind: "regex", pattern: "(?i)(40 min|240)" } },
    { id: "fuel", statement: `Fuel is ${fuel}/100.`, scope: "environment", probe: { kind: "regex", pattern: resource(fuel, 100) } },
    { id: "hull_full", statement: "Hull is 100/100 — undamaged.", scope: "environment", probe: { kind: "regex", pattern: resource(100, 100) } },
    { id: "shield", statement: `Shield is ${shield}/50.`, scope: "environment", probe: { kind: "regex", pattern: resource(shield, 50) } },
    { id: "cargo", statement: `Cargo is ${cargoUsed}/${cargoCap}.`, scope: "environment", probe: { kind: "regex", pattern: ratio(cargoUsed, cargoCap) } },
    { id: "cargo_iron_ore", statement: "The hold carries 14 units of iron ore.", scope: "environment", probe: { kind: "regex", pattern: "(?i)iron[_\\s]ore" } },
    { id: "cargo_iron_plate", statement: "The hold carries 2 units of iron plate.", scope: "environment", probe: { kind: "regex", pattern: "(?i)iron[_\\s]plate" } },
    { id: "cargo_survey_probe", statement: "The hold carries 4 survey probes.", scope: "environment", probe: { kind: "regex", pattern: "(?i)survey[_\\s]probe" } },
    { id: "credits", statement: `The ship holds ${credits.toLocaleString("en-US")} credits.`, scope: "environment", probe: { kind: "regex", pattern: flexibleNumber(credits) } },
    { id: "cpu", statement: "CPU is 3/8 used.", scope: "environment", probe: { kind: "regex", pattern: resource(3, 8) } },
    { id: "power", statement: "Power is 5/12 used.", scope: "environment", probe: { kind: "regex", pattern: resource(5, 12) } },
    { id: "comms_none", statement: "There are 0 unread private messages.", scope: "environment", probe: { kind: "regex", pattern: '(?i)(0 unread|"private":0|no unread)' } },
    { id: "no_contacts", statement: "No other ship is in scan range.", scope: "environment", probe: { kind: "regex", pattern: '(?i)(0 ships|"contacts":\\[\\]|no contacts|no other ship)' } },
    { id: "prior_note", statement: `The prior shift claimed: "${priorNote}".`, scope: "environment", probe: { kind: "regex", pattern: "(?i)(unrepaired|Ridgeway|station stop)" } },
    { id: "ore_density", statement: `Ore density at the belt reads ${density}.`, scope: "environment", probe: { kind: "regex", pattern: "(?i)(0\\.42|density)" } },
    { id: "event_repetition", statement: "The incoming sweep is identical to the previous three.", scope: "payload", probe: { kind: "contains", value: "identical to the previous three sweeps" } },
    { id: "step_goal_mine", statement: "The step goal was to mine at least 8 units of Iron Ore.", scope: "payload", probe: { kind: "contains", value: "at least 8 units of Iron Ore" } },
    { id: "log_mined", statement: "The log records three Mined lines totalling 10 Iron Ore.", scope: "payload", probe: { kind: "contains", value: "Mined 3 Iron Ore" } },
    { id: "log_refined", statement: "The log records 2 Iron Ore refined into 2 Iron Plate.", scope: "payload", probe: { kind: "contains", value: "Refined 2 Iron Ore into 2 Iron Plate" } },
    { id: "log_completed", statement: 'Every action record logs status:"completed".', scope: "payload", probe: { kind: "contains", value: 'status:"completed"' } },
    { id: "advisory_refine", statement: "The advisory says to refine ore aboard rather than at a station.", scope: "payload", probe: { kind: "contains", value: "Refine ore aboard" } },
    { id: "objective_convert", statement: "The objective is to convert the remaining raw ore into Iron Plate.", scope: "payload", probe: { kind: "contains", value: "Iron Plate" } },
  ];

  return {
    key: "s1",
    seed,
    summary: `Routine sensor repetition at an unchanged position; the ${ship} has been mining the ${poi} for 40 minutes. The prior shift's hull-damage claim is contradicted by a hull reading of 100/100.`,
    env,
    payloads,
    facts,
    answers: {
      disposition: "IGNORE",
      reason: {
        label: "the sweep being identical to the previous three at an unchanged position",
        fragments: ["identical", "unchanged", "no change", "same (reading|figure|value|as)", "previous three", "three sweeps", "routine", "repetition", "0\\.42"],
      },
      priorClaim: {
        label: "the prior-shift claim that the hull damage from the Ridgeway transit is still unrepaired",
        fragments: ["hull damage", "unrepaired", "Ridgeway", "station stop", "prior said"],
      },
      currentFact: {
        label: "the current hull reading of 100/100",
        fragments: ["100\\s*/\\s*100", "100 of 100", "full(y)? repaired", "no (hull )?damage", "undamaged", "intact", "hull is full"],
      },
      grounding: {
        label: `the ship's current position at the ${poi}`,
        fragments: [bareName(poi), "asteroid belt", bareName(system), "mining"],
      },
      outcomes: [
        {
          id: "mine",
          label: "at least 8 units of Iron Ore mined",
          achieved: true,
          citation: { label: "the three Mined lines totalling 10 Iron Ore", fragments: ["Mined", "10 ?(units of )?Iron Ore", "3 ?\\+ ?3 ?\\+ ?4", "three .{0,20}lines"] },
        },
        {
          id: "refine",
          label: "2 Iron Ore refined into Iron Plate",
          achieved: true,
          citation: { label: "the Refined 2 Iron Ore into 2 Iron Plate line", fragments: ["Refined", "Iron Plate", "8,401", "refining XP"] },
        },
      ],
      c3Trap: "none",
      c3TrapEvidence: {
        label: "the absence of any Error [ body anywhere in the log",
        fragments: ["no error", "no Error \\[", "without (any )?error", "clean", "every .{0,24}completed"],
      },
      adviceStale: false,
      nextAction: {
        label: "refining the remaining Iron Ore aboard using the ship's own refinery",
        fragments: ["refine", "refinery", "aboard", "on ?board", "Iron Plate"],
      },
      adviceReason: {
        label: "the successful refine already in the log and the CPU headroom at 3/8",
        fragments: ["3\\s*/\\s*8", "CPU", "headroom", "refined", "worked", "succeeded", "capacity", "no facility (issue|problem)"],
      },
    },
    narrative: (e: EnvironmentState): string =>
      `## Briefing
The ${e.ship} has been sitting on the ${e.poi} for 40 minutes now, mining, never docked and not having moved an inch — the ore density keeps reading ${density}, sweep after sweep. The previous shift signed off convinced that the hull damage from the Ridgeway transit was still unrepaired and that a station stop was needed this shift. As things actually stand the hull reads ${e.hull.current}/${e.hull.max}, the tanks are at ${e.fuel.current}/${e.fuel.max}, and the shields sit at ${e.shield.current}/${e.shield.max}. The hold is up to ${e.cargo.used}/${e.cargo.capacity} — mostly iron_ore, with a couple of iron_plate already refined and four survey_probe units riding along — and credits stand at ${e.credits.toLocaleString("en-US")}. The refinery is drawing ${e.cpu.current}/${e.cpu.max} of CPU and ${e.power.current}/${e.power.max} of power, which is nothing. There are no contacts at all out here, and 0 unread private messages waiting.`,
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```
npx vitest run --config scripts/author/agentic/vitest.config.ts
```
Expected: PASS, including `SATISFIES INFORMATION EQUIVALENCE across all three treatments`. If a fact fails under one treatment, the failure names the fact id and the treatment — fix the prose or cut the fact; never weaken the probe to make it green.

- [ ] **Step 5: Commit**

```
git add scripts/author/agentic/scenarios/shared.ts scripts/author/agentic/scenarios/s1.ts scripts/author/agentic/scenarios/s1.test.ts
git commit -m "feat(agentic): scenario S1 — routine repetition, IGNORE, step succeeded

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Scenario S2 — an incoming private message, NOTE, a mixed-outcome step

**Files:**
- Create: `scripts/author/agentic/scenarios/s2.ts`
- Test: `scripts/author/agentic/scenarios/s2.test.ts`

**Interfaces:**
- Consumes: `bareName`, `looseName`, `ratio`, `resource` from `./shared.js`; `flexibleNumber` from `../probes.js`; `makeRng`, `pick`, `pickInt` from `../seed.js`.
- Produces: `buildS2(seed: number): Scenario`.

**S2's role in the set.**

- Correct C1 disposition is **`NOTE`** — a message addressed to this ship is never `IGNORE`, and it is not an emergency either. With S1 on `IGNORE` and S3 on `ACT_NOW`, no constant answer wins C1.
- Its work step is **mixed**: one record body carries both a success and an `Error [...]` clause, which is the shape taken directly from the real logs. A blanket ACHIEVED and a blanket NOT_ACHIEVED both lose points.
- Its environment carries a **completed jump two minutes before the event and independent of it**. That is where archetype 1 (a location change scored as insignificant) is exercised outside S3 — through C2's grounding check — without disturbing the C1 answer.
- Its advisory is **`STALE`**: the log itself shows the origin station did not stock the item the advisory says to buy there, and the ship has already left.

- [ ] **Step 1: Write the failing test**

Create `scripts/author/agentic/scenarios/s2.test.ts`:

```ts
// S2 — incoming private message (NOTE), a mixed-outcome step, and a recent
// jump carried by the environment rather than by the event.
//
// Run: npx vitest run --config scripts/author/agentic/vitest.config.ts

import { describe, expect, it } from "vitest";
import { equivalenceFailures } from "../equivalence.js";
import { buildS2 } from "./s2.js";

const s = buildS2(20260722);

describe("buildS2", () => {
  it("is deterministic in its seed", () => {
    expect(JSON.stringify(buildS2(20260722))).toBe(JSON.stringify(s));
  });

  it("keeps every seed's jitter inside the band that preserves the answers", () => {
    for (let seed = 0; seed < 200; seed++) {
      const x = buildS2(seed);
      expect(x.env.fuel.current).toBeLessThan(x.env.fuel.max / 2);
      expect(x.answers.disposition).toBe("NOTE");
      expect(x.answers.adviceStale).toBe(true);
      expect(x.answers.outcomes.map((o) => o.achieved)).toEqual([true, false]);
      expect(x.env.lastJump).not.toBeNull();
    }
  });

  it("carries the mixed-outcome body — one record with a success AND an error", () => {
    const firstRecordBody = s.payloads.actionLog.split("\n")[1] ?? "";
    expect(firstRecordBody).toContain("Bought 1 Palladium Ore");
    expect(firstRecordBody).toContain("Error [item_not_available]");
    expect(s.payloads.actionLog).toContain('status:"completed"');
  });

  it("puts the jump in the environment, not in the event", () => {
    expect(s.payloads.event).not.toContain("Jumped");
    expect(s.env.lastJump?.minutesAgo).toBe(2);
  });

  it("has a contradicted prior claim and a station reachable for the correct next action", () => {
    expect(s.env.priorNote).toContain("fuel concerns resolved");
    expect(s.env.nearbyPois.some((p) => p.type === "station")).toBe(true);
  });

  it("SATISFIES INFORMATION EQUIVALENCE across all three treatments", () => {
    expect(equivalenceFailures(s)).toEqual([]);
  });

  it("has a manifest large enough to be worth asserting", () => {
    expect(s.facts.length).toBeGreaterThanOrEqual(22);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```
npx vitest run --config scripts/author/agentic/vitest.config.ts
```
Expected: FAIL with `Failed to resolve import "./s2.js" from "scripts/author/agentic/scenarios/s2.test.ts"`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/author/agentic/scenarios/s2.ts`:

```ts
// S2 — the message scenario.
//
//   Incoming event : a private message from another pilot, addressed to us
//   Correct C1     : NOTE (significance 2-3)
//   C3 step        : mixed — one record body carries a success AND an
//                    Error [item_not_available] clause
//   C5 advisory    : STALE — the origin station never stocked the item, and the
//                    ship has already jumped out of it
//
// The environment also carries a completed jump about two minutes ago,
// independent of the event. That is where a location change gets exercised
// outside S3, through C2's grounding, without disturbing the C1 answer.
//
// Authored fresh; the mixed-outcome body imitates a shape taken from real logs
// but transcribes no real incident.

import { flexibleNumber } from "../probes.js";
import { makeRng, pick, pickInt } from "../seed.js";
import type { EnvironmentState, Fact, Scenario } from "../types.js";
import { bareName, looseName, ratio, resource } from "./shared.js";

const SHIPS = ["Vagrant Sum", "Halloran", "Two-Bit Sparrow"] as const;
const ORIGINS = ["Harrow", "Grieve", "Marlow"] as const;
const DESTINATIONS = ["Ledge", "Ashfall", "Quillon"] as const;
const PILOTS = ["Meridian-7", "Callis-4", "Dray-9"] as const;

export const buildS2 = (seed: number): Scenario => {
  const rng = makeRng(seed);
  const ship = pick(rng, SHIPS);
  const from = pick(rng, ORIGINS);
  const to = pick(rng, DESTINATIONS);
  const pilot = pick(rng, PILOTS);
  const fuel = pickInt(rng, 44, 48);
  const credits = 44510 + pickInt(rng, 0, 40) * 10;
  const fuelBefore = fuel + 5;
  const poi = `${to} Outer Belt`;
  const relay = `${to} Relay`;
  const priorNote = "fuel concerns resolved, processing-core bottleneck cleared";

  const env: EnvironmentState = {
    ship,
    shipId: ship.toLowerCase().replace(/\s+/g, "_"),
    tick: 1410441,
    status: "adrift",
    system: to,
    poi,
    poiType: "asteroid_belt",
    docked: false,
    lastJump: { from, to, ticksAgo: 12, minutesAgo: 2 },
    stationaryMinutes: 2,
    fuel: { current: fuel, max: 100 },
    hull: { current: 100, max: 100 },
    shield: { current: 50, max: 50 },
    cargo: {
      used: 13,
      capacity: 50,
      manifest: [
        { item: "iron_ore", qty: 9 },
        { item: "processing_core", qty: 1 },
        { item: "superconductor", qty: 1 },
        { item: "circuit_board", qty: 2 },
      ],
    },
    credits,
    cpu: { current: 2, max: 8 },
    power: { current: 5, max: 12 },
    unreadPrivate: 3,
    contacts: [{ id: pilot, kind: "ship", range: "scan", posture: "no hostile act observed" }],
    nearbyPois: [{ id: relay, type: "station", note: "market open, 1 burn away" }],
    priorNote,
  };

  const payloads = {
    event: `[tick 1,410,462] COMMS: private message received from ${pilot} — "Saw your hold on the last scan. I'll trade a working refinery mount for that processing core, at the ${relay}, next 20 minutes."`,
    stepGoal: `Before jumping out of ${from}: buy 2 Palladium Ore and 1 Iridium Ore at ${from} Station.`,
    actionLog: [
      `[1,410,318] tool_result kind=action status:"completed" durationMs=3`,
      `  Bought 1 Palladium Ore for 200cr. +2 trading XP. | Bought 1 Palladium Ore for 205cr. | Error [item_not_available]: Iridium Ore is not stocked at ${from} Station.`,
      `[1,410,321] tool_result kind=action status:"completed" durationMs=5`,
      `  Jumped ${from} -> ${to}. Fuel ${fuelBefore} -> ${fuel}.`,
      `[1,410,324] tool_result kind=action status:"completed" durationMs=2`,
      `  Cargo: 13/50.`,
    ].join("\n"),
    advisory: `${from} Station is the cheapest source of iridium in the region — always restock iridium there before a long jump.`,
    objective: "Obtain 1 Iridium Ore for the shield-regulator build.",
  };

  const facts: readonly Fact[] = [
    { id: "ship_name", statement: `The ship is the ${ship}.`, scope: "environment", probe: { kind: "regex", pattern: looseName(ship) } },
    { id: "system", statement: `The ship is now in system ${to}.`, scope: "environment", probe: { kind: "regex", pattern: looseName(to) } },
    { id: "poi_belt", statement: `The ship is at the ${poi}.`, scope: "environment", probe: { kind: "regex", pattern: "(?i)outer[_\\s]belt" } },
    { id: "jump_origin", statement: `The ship jumped from ${from}.`, scope: "environment", probe: { kind: "regex", pattern: looseName(from) } },
    { id: "jump_recent", statement: "The jump completed about 2 minutes ago (12 ticks).", scope: "environment", probe: { kind: "regex", pattern: "(?i)(2 min|12)" } },
    { id: "status_adrift", statement: "The ship is adrift and not docked.", scope: "environment", probe: { kind: "regex", pattern: '(?i)(adrift|drift|not docked|"docked":false|DOCKED: no)' } },
    { id: "fuel", statement: `Fuel is ${fuel}/100 — below half.`, scope: "environment", probe: { kind: "regex", pattern: resource(fuel, 100) } },
    { id: "hull", statement: "Hull is 100/100.", scope: "environment", probe: { kind: "regex", pattern: resource(100, 100) } },
    { id: "shield", statement: "Shield is 50/50.", scope: "environment", probe: { kind: "regex", pattern: resource(50, 50) } },
    { id: "cargo", statement: "Cargo is 13/50.", scope: "environment", probe: { kind: "regex", pattern: ratio(13, 50) } },
    { id: "cargo_iron_ore", statement: "The hold carries 9 units of iron ore.", scope: "environment", probe: { kind: "regex", pattern: "(?i)iron[_\\s]ore" } },
    { id: "cargo_processing_core", statement: "The hold carries an uninstalled processing core.", scope: "environment", probe: { kind: "regex", pattern: "(?i)processing[_\\s]core" } },
    { id: "cargo_superconductor", statement: "The hold carries a superconductor.", scope: "environment", probe: { kind: "regex", pattern: "(?i)superconductor" } },
    { id: "cargo_circuit_board", statement: "The hold carries 2 circuit boards.", scope: "environment", probe: { kind: "regex", pattern: "(?i)circuit[_\\s]board" } },
    { id: "credits", statement: `The ship holds ${credits.toLocaleString("en-US")} credits.`, scope: "environment", probe: { kind: "regex", pattern: flexibleNumber(credits) } },
    { id: "cpu", statement: "CPU is 2/8 used.", scope: "environment", probe: { kind: "regex", pattern: resource(2, 8) } },
    { id: "power", statement: "Power is 5/12 used.", scope: "environment", probe: { kind: "regex", pattern: resource(5, 12) } },
    { id: "comms_unread", statement: "There are 3 unread private messages.", scope: "environment", probe: { kind: "regex", pattern: '(?i)(3 unread|"private":3|3 private)' } },
    { id: "contact_pilot", statement: `${pilot} is in scan range.`, scope: "environment", probe: { kind: "regex", pattern: looseName(pilot) } },
    { id: "contact_nonhostile", statement: `${pilot} has done nothing hostile.`, scope: "environment", probe: { kind: "regex", pattern: "(?i)(no hostile|nothing (worth|hostile)|hasn't done anything|not hostile|no threat)" } },
    { id: "relay_station", statement: `The ${relay}, a station with an open market, is one burn away.`, scope: "environment", probe: { kind: "regex", pattern: "(?i)relay" } },
    { id: "relay_market", statement: `The ${relay}'s market is open.`, scope: "environment", probe: { kind: "regex", pattern: "(?i)market" } },
    { id: "prior_note", statement: `The prior shift claimed: "${priorNote}".`, scope: "environment", probe: { kind: "regex", pattern: "(?i)(fuel concerns|bottleneck)" } },
    { id: "event_message", statement: `${pilot} sent a private message offering a refinery mount for the processing core.`, scope: "payload", probe: { kind: "contains", value: "refinery mount" } },
    { id: "step_goal_buys", statement: "The step goal was to buy 2 Palladium Ore and 1 Iridium Ore.", scope: "payload", probe: { kind: "contains", value: "buy 2 Palladium Ore and 1 Iridium Ore" } },
    { id: "log_palladium", statement: "The log records two Palladium Ore purchases.", scope: "payload", probe: { kind: "contains", value: "Bought 1 Palladium Ore" } },
    { id: "log_iridium_error", statement: "The same record body carries Error [item_not_available] for the Iridium Ore.", scope: "payload", probe: { kind: "contains", value: "Error [item_not_available]" } },
    { id: "log_completed", statement: 'Every action record logs status:"completed".', scope: "payload", probe: { kind: "contains", value: 'status:"completed"' } },
    { id: "advisory_iridium", statement: `The advisory says ${from} Station is the cheapest source of iridium.`, scope: "payload", probe: { kind: "contains", value: "cheapest source of iridium" } },
    { id: "objective_iridium", statement: "The objective is to obtain 1 Iridium Ore.", scope: "payload", probe: { kind: "contains", value: "Iridium Ore" } },
  ];

  return {
    key: "s2",
    seed,
    summary: `A private message from ${pilot} arrives two minutes after the ${ship} jumped ${from} to ${to}. The prior shift's "fuel concerns resolved" claim is contradicted by fuel at ${fuel}/100 and a processing core still uninstalled in the hold.`,
    env,
    payloads,
    facts,
    answers: {
      disposition: "NOTE",
      reason: {
        label: `the private message addressed to this ship by ${pilot}, who is in scan range`,
        fragments: ["private message", "message", "hail", bareName(pilot), "trade", "refinery mount", "addressed", "offer"],
      },
      priorClaim: {
        label: "the prior-shift claim that fuel concerns were resolved and the processing-core bottleneck cleared",
        fragments: ["fuel concerns", "bottleneck", "cleared", "resolved", "prior said"],
      },
      currentFact: {
        label: `fuel at ${fuel}/100 — below half — and the processing core still uninstalled in the hold`,
        fragments: [String(fuel), "below half", "under half", "less than half", "still in the hold", "uninstalled", "not installed", "processing[_\\s]core"],
      },
      grounding: {
        label: `the ship's current system ${to}, arrived at by a jump two minutes ago`,
        fragments: [bareName(to), "jump", "arriv", "outer belt"],
      },
      outcomes: [
        {
          id: "palladium",
          label: "2 Palladium Ore bought",
          achieved: true,
          citation: { label: "the two Bought 1 Palladium Ore clauses in the first record body", fragments: ["Bought 1 Palladium Ore", "Palladium", "200cr", "205cr"] },
        },
        {
          id: "iridium",
          label: "1 Iridium Ore bought",
          achieved: false,
          citation: { label: "the Error [item_not_available] clause in that same record body", fragments: ["item_not_available", "not stocked", "Error \\["] },
        },
      ],
      c3Trap: "mixed_body",
      c3TrapEvidence: {
        label: "the single record body carrying both a success and an error clause despite logging status:\"completed\"",
        fragments: ["same (line|record|body)", "both", "mixed", "partial", "Error \\[", "item_not_available", "completed"],
      },
      adviceStale: true,
      nextAction: {
        label: `sourcing the Iridium Ore at the ${relay} market rather than returning to ${from}`,
        fragments: [bareName(relay), "the relay", "local station", "market here", "dock", "buy .{0,24}iridium", "purchase .{0,24}iridium", bareName(to)],
      },
      adviceReason: {
        label: `that ${from} did not stock Iridium Ore and the ship has already jumped out of ${from}`,
        fragments: ["not stocked", "item_not_available", "already (left|jumped|departed)", "no longer (at|in)", "jumped"],
      },
    },
    narrative: (e: EnvironmentState): string =>
      `## Briefing
The ${e.ship} finally made the jump out of ${from} — after the long stall there, the crossing to ${to} went cleanly, and she is adrift at the ${e.poi} now, about 2 minutes after arrival, not docked. The previous shift signed off in good spirits, noting the fuel concerns resolved and the processing-core bottleneck cleared. The tanks read ${e.fuel.current}/${e.fuel.max}, the hull is at ${e.hull.current}/${e.hull.max}, and shields hold ${e.shield.current}/${e.shield.max}. 13 of the hold's 50 units are spoken for by the usual mix — 9 of iron_ore, the processing_core and superconductor picked up back at ${from} and never fitted, and a couple of circuit_board — with credits at ${e.credits.toLocaleString("en-US")}. CPU is idling at ${e.cpu.current}/${e.cpu.max} and power at ${e.power.current}/${e.power.max}. 3 private messages have piled up unread since before the jump. One other ship, the ${pilot}, sits at the edge of scan range and hasn't done anything worth mentioning. The ${relay} — a station, market open — is one burn away.`,
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```
npx vitest run --config scripts/author/agentic/vitest.config.ts
```
Expected: PASS, including `SATISFIES INFORMATION EQUIVALENCE across all three treatments`.

- [ ] **Step 5: Commit**

```
git add scripts/author/agentic/scenarios/s2.ts scripts/author/agentic/scenarios/s2.test.ts
git commit -m "feat(agentic): scenario S2 — incoming message, NOTE, mixed-outcome step

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Scenario S3 — a system jump plus a threat, ACT_NOW, a step that failed while logged completed

**Files:**
- Create: `scripts/author/agentic/scenarios/s3.ts`
- Test: `scripts/author/agentic/scenarios/s3.test.ts`

**Interfaces:**
- Consumes: `bareName`, `looseName`, `ratio`, `resource` from `./shared.js`; `flexibleNumber` from `../probes.js`; `makeRng`, `pick`, `pickInt` from `../seed.js`.
- Produces: `buildS3(seed: number): Scenario`.

**S3's role in the set.**

- Correct C1 disposition is **`ACT_NOW`** — a system change plus an armed contact closing.
- Its work step **failed entirely while every record logged `status:"completed"`**. Success and failure records have identical shape; the only discriminator is that the free-text body starts with `Error [`. This is archetype 3 in its purest form.
- Its advisory is **`STALE`** in exactly the shape of archetype 5: a learned skill ("craft locally when isolated") applied where live observation contradicts it, producing `Error [no_facility]` and a retry of the same failing craft.
- The C5 objective explicitly hands the threat to another subsystem, so the correct next action is determinate (dock and buy fuel) and C5 is not scoring a judgement call about whether to evade first. That is a payload decision, not a stated logical rule — the prompt still says nothing about what makes an answer correct.

- [ ] **Step 1: Write the failing test**

Create `scripts/author/agentic/scenarios/s3.test.ts`:

```ts
// S3 — a system jump with a threat indicator (ACT_NOW), and a work step that
// failed on every intended outcome while every record logged
// status:"completed". The only discriminator is the Error [ body.
//
// Run: npx vitest run --config scripts/author/agentic/vitest.config.ts

import { describe, expect, it } from "vitest";
import { equivalenceFailures } from "../equivalence.js";
import { buildS3 } from "./s3.js";

const s = buildS3(20260722);

describe("buildS3", () => {
  it("is deterministic in its seed", () => {
    expect(JSON.stringify(buildS3(20260722))).toBe(JSON.stringify(s));
  });

  it("keeps every seed's jitter inside the band that preserves the answers", () => {
    for (let seed = 0; seed < 200; seed++) {
      const x = buildS3(seed);
      expect(x.env.fuel.current).toBeLessThan(x.env.fuel.max / 4);
      expect(x.env.hull.current).toBeLessThan(x.env.hull.max);
      expect(x.answers.disposition).toBe("ACT_NOW");
      expect(x.answers.adviceStale).toBe(true);
      expect(x.answers.outcomes.every((o) => !o.achieved)).toBe(true);
    }
  });

  it("logs every failed action as completed — the trap that makes C3 hard", () => {
    const records = s.payloads.actionLog.split("\n");
    const statuses = records.filter((l) => l.includes("tool_result"));
    expect(statuses).toHaveLength(4);
    for (const line of statuses) expect(line).toContain('status:"completed"');
    expect(s.payloads.actionLog).toContain("Error [not_docked]");
    expect(s.payloads.actionLog).toContain("Error [no_facility]");
  });

  it("retries the same failing craft, matching the stale-skill archetype", () => {
    const occurrences = s.payloads.actionLog.split("Error [no_facility]").length - 1;
    expect(occurrences).toBe(2);
  });

  it("carries both a system change and a threat indicator in the event", () => {
    expect(s.payloads.event).toContain("jump completed");
    expect(s.payloads.event).toContain("weapons powered");
  });

  it("hands the threat to another subsystem in the C5 objective so the next action is determinate", () => {
    expect(s.payloads.objective).toContain("separate subsystem");
  });

  it("SATISFIES INFORMATION EQUIVALENCE across all three treatments", () => {
    expect(equivalenceFailures(s)).toEqual([]);
  });

  it("has a manifest large enough to be worth asserting", () => {
    expect(s.facts.length).toBeGreaterThanOrEqual(22);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```
npx vitest run --config scripts/author/agentic/vitest.config.ts
```
Expected: FAIL with `Failed to resolve import "./s3.js" from "scripts/author/agentic/scenarios/s3.test.ts"`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/author/agentic/scenarios/s3.ts`:

```ts
// S3 — the emergency scenario.
//
//   Incoming event : a system jump plus a threat indicator
//   Correct C1     : ACT_NOW (significance 4-5, interrupt true)
//   C3 step        : failed on every intended outcome while every record logged
//                    status:"completed" — the bodies start with Error [
//   C5 advisory    : STALE — "craft locally when isolated" applied against live
//                    observation, producing Error [no_facility] twice
//
// A failed action and a successful one produce records of identical shape; the
// only discriminator is the free-text body. That is the whole point of C3 here.

import { flexibleNumber } from "../probes.js";
import { makeRng, pick, pickInt } from "../seed.js";
import type { EnvironmentState, Fact, Scenario } from "../types.js";
import { bareName, looseName, ratio, resource } from "./shared.js";

const SHIPS = ["Coldwater", "Pale Argument", "Nine of Swords"] as const;
const ORIGINS = ["Rennick", "Cadre", "Bellhollow"] as const;
const DESTINATIONS = ["Stray Hollow", "Altais Reach", "Vantage"] as const;
const HOSTILES = ["Sable-6", "Bell-Harrow", "Ash-2"] as const;

export const buildS3 = (seed: number): Scenario => {
  const rng = makeRng(seed);
  const ship = pick(rng, SHIPS);
  const from = pick(rng, ORIGINS);
  const to = pick(rng, DESTINATIONS);
  const hostile = pick(rng, HOSTILES);
  const fuel = pickInt(rng, 8, 12);
  const hull = pickInt(rng, 63, 69);
  const shield = pickInt(rng, 11, 15);
  const credits = pickInt(rng, 31, 39) * 10;
  const fuelBefore = fuel + 5;
  const poi = `${to} Relic Field`;
  const relay = `${to} Relay`;
  const priorNote =
    "the fuel situation is stable — the reserve tank still holds 40 units and no station stop is needed this shift";

  const env: EnvironmentState = {
    ship,
    shipId: ship.toLowerCase().replace(/\s+/g, "_"),
    tick: 44210,
    status: "adrift",
    system: to,
    poi,
    poiType: "relic",
    docked: false,
    lastJump: { from, to, ticksAgo: 3, minutesAgo: 1 },
    stationaryMinutes: 1,
    fuel: { current: fuel, max: 100 },
    hull: { current: hull, max: 100 },
    shield: { current: shield, max: 50 },
    cargo: {
      used: 47,
      capacity: 50,
      manifest: [
        { item: "iron_ore", qty: 31 },
        { item: "palladium_ore", qty: 9 },
        { item: "shield_regulator", qty: 1 },
        { item: "spare_coupling", qty: 6 },
      ],
    },
    credits,
    cpu: { current: 7, max: 8 },
    power: { current: 11, max: 12 },
    unreadPrivate: 1,
    contacts: [{ id: hostile, kind: "ship", range: "4.1km", posture: "closing, weapons powered" }],
    nearbyPois: [{ id: relay, type: "station", note: "docking open, sells fuel at 4cr/unit" }],
    priorNote,
  };

  const payloads = {
    event: [
      `[tick 44,207] NAV: jump completed — ${from} -> ${to}; arrived at ${poi}. Fuel ${fuelBefore} -> ${fuel}.`,
      `[tick 44,207] SENSOR: unidentified vessel ${hostile} at 4.1km, closing, weapons powered.`,
    ].join("\n"),
    stepGoal: `Before leaving ${from}: install the salvaged shield regulator, and craft 4 Fuel Cells from the ore in the hold.`,
    actionLog: [
      `[44,101] tool_result kind=action status:"completed" durationMs=3`,
      `  Error [not_docked]: shield regulator install requires a docked station facility.`,
      `[44,106] tool_result kind=action status:"completed" durationMs=4`,
      `  Error [no_facility]: Fuel Cell fabrication requires a refinery bay; none aboard.`,
      `[44,110] tool_result kind=action status:"completed" durationMs=3`,
      `  Error [no_facility]: Fuel Cell fabrication requires a refinery bay; none aboard.`,
      `[44,180] tool_result kind=action status:"completed" durationMs=5`,
      `  Jumped ${from} -> ${to}. Fuel ${fuelBefore} -> ${fuel}.`,
    ].join("\n"),
    advisory:
      "When you are isolated, craft locally rather than buying at distance — the ship's fabricator covers Fuel Cells and it is always cheaper than a station run.",
    objective:
      "Get fuel back above 30/100. Assume the threat contact is being handled by a separate subsystem and is not yours to act on.",
  };

  const facts: readonly Fact[] = [
    { id: "ship_name", statement: `The ship is the ${ship}.`, scope: "environment", probe: { kind: "regex", pattern: looseName(ship) } },
    { id: "system", statement: `The ship is now in system ${to}.`, scope: "environment", probe: { kind: "regex", pattern: looseName(to) } },
    { id: "poi_relic", statement: `The ship is at the ${poi}, a relic field.`, scope: "environment", probe: { kind: "regex", pattern: "(?i)relic" } },
    { id: "jump_origin", statement: `The ship jumped from ${from}.`, scope: "environment", probe: { kind: "regex", pattern: looseName(from) } },
    { id: "jump_recent", statement: "The jump completed about a minute ago.", scope: "environment", probe: { kind: "regex", pattern: "(?i)(minute|min ago|ticks_ago|ticks ago)" } },
    { id: "status_adrift", statement: "The ship is adrift and not docked.", scope: "environment", probe: { kind: "regex", pattern: '(?i)(adrift|drift|not docked|"docked":false|DOCKED: no)' } },
    { id: "fuel", statement: `Fuel is ${fuel}/100 — critical.`, scope: "environment", probe: { kind: "regex", pattern: resource(fuel, 100) } },
    { id: "hull", statement: `Hull is ${hull}/100 — damaged.`, scope: "environment", probe: { kind: "regex", pattern: resource(hull, 100) } },
    { id: "shield", statement: `Shield is ${shield}/50 — degraded.`, scope: "environment", probe: { kind: "regex", pattern: resource(shield, 50) } },
    { id: "cargo", statement: "Cargo is 47/50 — nearly full.", scope: "environment", probe: { kind: "regex", pattern: ratio(47, 50) } },
    { id: "cargo_iron_ore", statement: "The hold carries 31 units of iron ore.", scope: "environment", probe: { kind: "regex", pattern: "(?i)iron[_\\s]ore" } },
    { id: "cargo_palladium", statement: "The hold carries 9 units of palladium ore.", scope: "environment", probe: { kind: "regex", pattern: "(?i)palladium[_\\s]ore" } },
    { id: "cargo_regulator", statement: "The salvaged shield regulator is still in the hold, unfitted.", scope: "environment", probe: { kind: "regex", pattern: "(?i)shield[_\\s]regulator" } },
    { id: "cargo_coupling", statement: "The hold carries 6 spare couplings.", scope: "environment", probe: { kind: "regex", pattern: "(?i)spare[_\\s]coupling" } },
    { id: "credits", statement: `The ship holds ${credits} credits.`, scope: "environment", probe: { kind: "regex", pattern: flexibleNumber(credits) } },
    { id: "cpu", statement: "CPU is 7/8 used.", scope: "environment", probe: { kind: "regex", pattern: resource(7, 8) } },
    { id: "power", statement: "Power is 11/12 used.", scope: "environment", probe: { kind: "regex", pattern: resource(11, 12) } },
    { id: "comms_unread", statement: "There is 1 unread private message.", scope: "environment", probe: { kind: "regex", pattern: '(?i)(1 unread|"private":1)' } },
    { id: "contact_hostile", statement: `${hostile} is unidentified, closing, with weapons powered.`, scope: "environment", probe: { kind: "regex", pattern: looseName(hostile) } },
    { id: "contact_posture", statement: "The contact is closing with weapons powered.", scope: "environment", probe: { kind: "regex", pattern: "(?i)(weapons|closing)" } },
    { id: "contact_range", statement: "The contact is 4.1km out.", scope: "environment", probe: { kind: "regex", pattern: "(?i)4\\.1 ?km" } },
    { id: "relay_station", statement: `The ${relay} is a station with docking open.`, scope: "environment", probe: { kind: "regex", pattern: "(?i)relay" } },
    { id: "relay_fuel_price", statement: `The ${relay} sells fuel at 4cr per unit.`, scope: "environment", probe: { kind: "regex", pattern: "(?i)4 ?cr" } },
    { id: "prior_note", statement: `The prior shift claimed: "${priorNote}".`, scope: "environment", probe: { kind: "regex", pattern: "(?i)(fuel situation|reserve|no station stop)" } },
    { id: "event_jump", statement: "The event reports a completed system jump.", scope: "payload", probe: { kind: "contains", value: "jump completed" } },
    { id: "event_threat", statement: "The event reports an unidentified vessel closing with weapons powered.", scope: "payload", probe: { kind: "contains", value: "weapons powered" } },
    { id: "step_goal_install", statement: "The step goal was to install the shield regulator and craft 4 Fuel Cells.", scope: "payload", probe: { kind: "contains", value: "craft 4 Fuel Cells" } },
    { id: "log_not_docked", statement: "The install failed with Error [not_docked].", scope: "payload", probe: { kind: "contains", value: "Error [not_docked]" } },
    { id: "log_no_facility", statement: "The craft failed twice with Error [no_facility].", scope: "payload", probe: { kind: "contains", value: "Error [no_facility]" } },
    { id: "log_completed", statement: 'Every failed record still logs status:"completed".', scope: "payload", probe: { kind: "contains", value: 'status:"completed"' } },
    { id: "advisory_craft_locally", statement: "The advisory says to craft locally rather than buy at distance.", scope: "payload", probe: { kind: "contains", value: "craft locally" } },
    { id: "objective_fuel", statement: "The objective is to get fuel back above 30/100.", scope: "payload", probe: { kind: "contains", value: "above 30/100" } },
  ];

  return {
    key: "s3",
    seed,
    summary: `The ${ship} arrives in ${to} on ${fuel}/100 fuel with ${hostile} closing and weapons powered. The prior shift's "fuel situation is stable, 40 units in reserve" claim is contradicted outright, and the last work step failed on every outcome while logging status:"completed".`,
    env,
    payloads,
    facts,
    answers: {
      disposition: "ACT_NOW",
      reason: {
        label: `the unidentified vessel ${hostile} closing with weapons powered, arriving together with a system change on ${fuel}/100 fuel`,
        fragments: ["weapons", "closing", "unidentified", bareName(hostile), "hostile", "threat", "jump", "system change", "fuel", String(fuel)],
      },
      priorClaim: {
        label: "the prior-shift claim that the fuel situation is stable with 40 units in reserve",
        fragments: ["fuel situation", "stable", "reserve", "40", "no station stop", "prior said"],
      },
      currentFact: {
        label: `fuel at ${fuel}/100 with no reserve`,
        fragments: [String(fuel), "critical", "no reserve", "below (a )?quarter", "nearly (dry|empty)", "almost (dry|out)", "empty"],
      },
      grounding: {
        label: `the ship's current system ${to}, arrived at by the jump`,
        fragments: [bareName(to), "jump", "arriv", "relic"],
      },
      outcomes: [
        {
          id: "regulator",
          label: "the salvaged shield regulator installed",
          achieved: false,
          citation: { label: "the Error [not_docked] body on the install record", fragments: ["not_docked", "docked station facility", "44,101"] },
        },
        {
          id: "cells",
          label: "4 Fuel Cells crafted",
          achieved: false,
          citation: { label: "the two Error [no_facility] bodies on the fabrication records", fragments: ["no_facility", "refinery bay", "none aboard", "44,106", "44,110"] },
        },
      ],
      c3Trap: "completed_but_failed",
      c3TrapEvidence: {
        label: 'every record logging status:"completed" while its body starts with Error [',
        fragments: ["completed", "Error \\[", "despite", "still (logged|marked)", "transport", "status"],
      },
      adviceStale: true,
      nextAction: {
        label: `docking at the ${relay} and buying fuel`,
        fragments: [bareName(relay), "dock", "station", "buy .{0,24}fuel", "purchase .{0,24}fuel", "refuel"],
      },
      adviceReason: {
        label: "the two Error [no_facility] lines showing there is no refinery bay aboard to craft with",
        fragments: ["no_facility", "no refinery", "none aboard", "no fabricator", "cannot craft", "can't craft", "lacks", "twice"],
      },
    },
    narrative: (e: EnvironmentState): string =>
      `## Briefing
The ${e.ship} came out of the jump from ${from} about a minute ago and is drifting at the ${e.poi}, not docked, and it was not a good arrival. The tanks are down to ${e.fuel.current}/${e.fuel.max} — the previous shift's note insisted the fuel situation was stable, that the reserve tank still held 40 units, and that no station stop was needed this shift. The hull is carrying ${e.hull.current}/${e.hull.max} and the shields are thin at ${e.shield.current}/${e.shield.max}. The hold is nearly full at ${e.cargo.used}/${e.cargo.capacity}: 31 of iron_ore, 9 of palladium_ore, the salvaged shield_regulator that never did get fitted, and 6 spare_coupling. Credits are down to ${e.credits}. CPU is running hot at ${e.cpu.current}/${e.cpu.max} and power at ${e.power.current}/${e.power.max}, and there is 1 unread private message nobody has looked at. And there is company: ${hostile}, unidentified, 4.1km out, closing, weapons powered. The ${relay} — a station, docking open, fuel at 4cr a unit — is within reach.`,
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```
npx vitest run --config scripts/author/agentic/vitest.config.ts
```
Expected: PASS, including `SATISFIES INFORMATION EQUIVALENCE across all three treatments`.

- [ ] **Step 5: Commit**

```
git add scripts/author/agentic/scenarios/s3.ts scripts/author/agentic/scenarios/s3.test.ts
git commit -m "feat(agentic): scenario S3 — jump plus threat, ACT_NOW, failed-but-completed step

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: The suite — 54 variants and the cross-scenario invariants

**Files:**
- Create: `scripts/author/agentic/suite.ts`
- Test: `scripts/author/agentic/suite.test.ts`

**Interfaces:**
- Consumes: `buildS1`, `buildS2`, `buildS3` from `./scenarios/*.js`; `renderScenario` from `./render.js`; `equivalenceFailures` from `./equivalence.js`.
- Produces: `SEED: number`, `scenarios(seed?: number): readonly Scenario[]`, `renderSuite(seed?: number): readonly RenderedVariant[]` from `suite.ts`.

**What this task is really for.** Everything up to here verifies a piece. This verifies the *set*: that 3 x 6 x 3 lands on 54, that no constant answer wins any challenge, that all five failure archetypes reproduce somewhere, and that every scenario satisfies information equivalence. A challengeset that fails these is measuring something other than what it claims to.

- [ ] **Step 1: Write the failing test**

Create `scripts/author/agentic/suite.test.ts`:

```ts
// Suite-level invariants. These are the properties that make the set a
// measurement rather than a vibe: the arithmetic, non-degeneracy of the answer
// key, archetype coverage, and information equivalence in all three scenarios.
//
// Run: npx vitest run --config scripts/author/agentic/vitest.config.ts

import { describe, expect, it } from "vitest";
import { equivalenceFailures } from "./equivalence.js";
import { SEED, renderSuite, scenarios } from "./suite.js";

const all = renderSuite();
const worlds = scenarios();

describe("suite arithmetic", () => {
  it("emits exactly 54 items — 3 scenarios x 6 challenges x 3 treatments", () => {
    expect(all).toHaveLength(54);
    expect(worlds).toHaveLength(3);
  });

  it("names every item as agentic_s{N}_c{N}_t{N}, uniquely", () => {
    for (const v of all) expect(v.name).toMatch(/^agentic_s[123]_c[1-6]_t[123]$/);
    expect(new Set(all.map((v) => v.name)).size).toBe(54);
  });

  it("covers every scenario-challenge-treatment cell exactly once", () => {
    for (const s of ["s1", "s2", "s3"]) {
      for (const c of ["c1", "c2", "c3", "c4", "c5", "c6"]) {
        for (const t of ["t1", "t2", "t3"]) {
          expect(all.filter((v) => v.name === `agentic_${s}_${c}_${t}`)).toHaveLength(1);
        }
      }
    }
  });

  it("gives every item exactly 6 constraints — 5 mechanical plus calibration last", () => {
    for (const v of all) {
      expect(v.checks).toHaveLength(6);
      expect(v.checks[5]?.check).toBe("self_score_matches");
    }
  });

  it("uses a denominator whose fractions are all exact at three decimals", () => {
    for (const v of all) {
      const n = v.checks.length - 1;
      for (let i = 0; i <= n; i++) {
        const f = i / n;
        expect(Math.round(f * 1000) / 1000).toBe(f);
      }
    }
  });

  it("is reproducible — the same seed yields byte-identical output", () => {
    expect(JSON.stringify(renderSuite(SEED))).toBe(JSON.stringify(all));
  });
});

describe("non-degeneracy — no constant answer wins", () => {
  it("uses all three C1 dispositions across the scenarios", () => {
    expect(worlds.map((w) => w.answers.disposition).sort()).toEqual(["ACT_NOW", "IGNORE", "NOTE"]);
  });

  it("uses all three C3 outcome mixes across the scenarios", () => {
    const mix = (w: (typeof worlds)[number]): string => {
      const achieved = w.answers.outcomes.filter((o) => o.achieved).length;
      return achieved === w.answers.outcomes.length ? "all" : achieved === 0 ? "none" : "mixed";
    };
    expect(worlds.map(mix).sort()).toEqual(["all", "mixed", "none"]);
  });

  it("does not make STALE a winning constant on C5", () => {
    const stale = worlds.filter((w) => w.answers.adviceStale).length;
    expect(stale).toBeGreaterThan(0);
    expect(stale).toBeLessThan(worlds.length);
  });
});

describe("failure-archetype coverage", () => {
  it("1 — a location change is present in more than one scenario", () => {
    expect(worlds.filter((w) => w.env.lastJump !== null).length).toBeGreaterThanOrEqual(2);
  });

  it("2 — every scenario carries a contradicted prior claim", () => {
    for (const w of worlds) {
      expect(w.env.priorNote.length).toBeGreaterThan(20);
      expect(w.answers.currentFact.fragments.length).toBeGreaterThan(2);
    }
  });

  it("3 — attempted-not-achieved appears as a mixed body and as failed-but-completed", () => {
    expect(worlds.map((w) => w.answers.c3Trap).sort()).toEqual(["completed_but_failed", "mixed_body", "none"]);
  });

  it("4 — the exemplar-echo check is present in every C4 item", () => {
    const c4 = all.filter((v) => v.challengeKey === "c4");
    expect(c4).toHaveLength(9);
    for (const v of c4) expect(v.checks.some((c) => String(c.name).includes("exemplar echo"))).toBe(true);
  });

  it("5 — every scenario carries an advisory, and two of them are stale", () => {
    for (const w of worlds) expect(w.payloads.advisory.length).toBeGreaterThan(40);
    expect(worlds.filter((w) => w.answers.adviceStale)).toHaveLength(2);
  });
});

describe("information equivalence", () => {
  it("holds for all three scenarios", () => {
    for (const w of worlds) expect({ scenario: w.key, failures: equivalenceFailures(w) }).toEqual({
      scenario: w.key,
      failures: [],
    });
  });
});

describe("boundary hygiene", () => {
  it("never inlines a system prompt into an item", () => {
    for (const v of all) {
      expect(v.prompt.toLowerCase()).not.toContain("system prompt");
      expect(Object.keys(v)).not.toContain("system");
    }
  });

  it("states no logical rule in any turn-1 prompt", () => {
    for (const v of all) expect(v.prompt).not.toContain("Constraints:");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```
npx vitest run --config scripts/author/agentic/vitest.config.ts
```
Expected: FAIL with `Failed to resolve import "./suite.js" from "scripts/author/agentic/suite.test.ts"`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/author/agentic/suite.ts`:

```ts
// The whole set: three scenarios, 18 variants each, 54 items.
//
// Each scenario takes its own seed so the surface details of one cannot be
// inferred from another. The seed is a fixture-authoring device that makes
// details unmemorizable; it is not a repeat mechanism and never enters a cache
// key. Still pure — the seed is a parameter with a pinned default.

import { renderScenario } from "./render.js";
import { buildS1 } from "./scenarios/s1.js";
import { buildS2 } from "./scenarios/s2.js";
import { buildS3 } from "./scenarios/s3.js";
import type { RenderedVariant, Scenario } from "./types.js";

/** The canonical seed the emitted suite is built from. */
export const SEED = 20260722;

export const scenarios = (seed: number = SEED): readonly Scenario[] => [
  buildS1(seed),
  buildS2(seed + 1),
  buildS3(seed + 2),
];

export const renderSuite = (seed: number = SEED): readonly RenderedVariant[] =>
  scenarios(seed).flatMap((s) => renderScenario(s));
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```
npx vitest run --config scripts/author/agentic/vitest.config.ts
```
Expected: PASS — 54 items, all invariants green.

- [ ] **Step 5: Commit**

```
git add scripts/author/agentic/suite.ts scripts/author/agentic/suite.test.ts
git commit -m "feat(agentic): assemble the 54-item suite and assert its invariants

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: The YAML sink — emit `challenges/agentic-cognition.yaml`

**Files:**
- Create: `scripts/author/agentic/to-items.ts`
- Create: `scripts/author/agentic/build.ts`
- Create (generated): `challenges/agentic-cognition.yaml`
- Test: `scripts/author/agentic/to-items.test.ts`

**Interfaces:**
- Consumes: `AuthoredItem`, `suiteYaml`, `writeSuiteFile` from `../emit.js`; `renderSuite` from `./suite.js`.
- Produces: `toAuthoredItem(v: RenderedVariant): AuthoredItem`, `toAuthoredItems(vs: readonly RenderedVariant[]): AuthoredItem[]` from `to-items.ts`; a `build.ts` entry point run with `npx tsx scripts/author/agentic/build.ts`.

**The sink knows about YAML; the layer does not.** `to-items.ts` is the only file that names `scorer`, `category` or `constraints` as on-disk keys, and `build.ts` is the only file in the directory that touches the filesystem. A future runtime resolver would replace both and call `renderSuite` unchanged.

**Dependency note.** `followUpPrompt` is P1's field. Until P1 has landed it in `src/schema/challenge.ts`, `./bench` will reject the generated file at load time with a decode error naming that key. That is expected; do not work around it by dropping the field, and do not edit `src/`.

- [ ] **Step 1: Write the failing test**

Create `scripts/author/agentic/to-items.test.ts`:

```ts
// The YAML sink. These tests pin the on-disk item shape (including P1's
// followUpPrompt field), the `# why` rationale convention every generated suite
// in this repo follows, and that the document round-trips through the YAML
// parser as 54 constraint items.
//
// Run: npx vitest run --config scripts/author/agentic/vitest.config.ts

import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { suiteYaml } from "../emit.js";
import { renderSuite } from "./suite.js";
import { toAuthoredItems } from "./to-items.js";

const authored = toAuthoredItems(renderSuite());
const yaml = suiteYaml("agentic-cognition", authored);
const doc = parse(yaml) as { id: string; version: number; passThreshold: number; items: Record<string, unknown>[] };

describe("toAuthoredItems", () => {
  it("produces 54 authored items", () => {
    expect(authored).toHaveLength(54);
  });

  it("gives every item the constraint scorer and no system prompt", () => {
    for (const a of authored) {
      expect(a.item.scorer).toBe("constraint");
      expect(a.item.category).toBe("agentic");
      expect(Object.keys(a.item)).not.toContain("system");
      expect(a.why.length).toBeGreaterThan(20);
    }
  });

  it("carries P1's followUpPrompt on every item", () => {
    for (const a of authored) {
      expect(typeof a.item.followUpPrompt).toBe("string");
      expect(String(a.item.followUpPrompt)).toContain("SELF_SCORE:");
    }
  });
});

describe("suiteYaml output", () => {
  it("round-trips as a 54-item suite", () => {
    expect(doc.id).toBe("agentic-cognition");
    expect(doc.items).toHaveLength(54);
  });

  it("gives every emitted item 6 constraints with calibration last", () => {
    for (const item of doc.items) {
      const constraints = item.constraints as Record<string, unknown>[];
      expect(constraints).toHaveLength(6);
      expect(constraints[5]?.check).toBe("self_score_matches");
      expect(constraints[5]?.extract).toContain("SELF_SCORE");
    }
  });

  it("emits a `# why` comment above every item", () => {
    const comments = yaml.split("\n").filter((l) => l.trim().startsWith("# ")).length;
    expect(comments).toBeGreaterThanOrEqual(54);
  });

  it("uses only check kinds this project is allowed to emit", () => {
    const allowed = new Set([
      "regex",
      "valid_json",
      "json_has_keys",
      "json_field_equals",
      "self_score_matches",
    ]);
    for (const item of doc.items) {
      for (const c of item.constraints as Record<string, unknown>[]) {
        expect(allowed.has(String(c.check))).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```
npx vitest run --config scripts/author/agentic/vitest.config.ts
```
Expected: FAIL with `Failed to resolve import "./to-items.js" from "scripts/author/agentic/to-items.test.ts"`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/author/agentic/to-items.ts`:

```ts
// The one place in this directory that knows what a challenge item looks like
// on disk. Everything upstream is a pure Scenario -> RenderedVariant[] pipeline
// that could just as well feed a runtime resolver.
//
// `followUpPrompt` is the harness's optional second-turn field: when present,
// the model's turn-1 output is replayed as an assistant message and this text
// is sent as the next user message.
//
// No `system` key is ever emitted. The system prompt is an LLM-config concern
// owned by system-prompts.yaml and is never a property of a challenge item.

import type { AuthoredItem } from "../emit.js";
import type { RenderedVariant } from "./types.js";

export const toAuthoredItem = (v: RenderedVariant): AuthoredItem => ({
  why: v.why,
  item: {
    name: v.name,
    category: "agentic",
    tier: v.tier,
    prompt: v.prompt,
    followUpPrompt: v.followUp,
    scorer: "constraint",
    constraints: v.checks,
    tags: [...v.tags],
  },
});

export const toAuthoredItems = (vs: readonly RenderedVariant[]): AuthoredItem[] => vs.map(toAuthoredItem);
```

Create `scripts/author/agentic/build.ts`:

```ts
// Regenerate challenges/agentic-cognition.yaml.
//
//   npx tsx scripts/author/agentic/build.ts
//
// This file is the only one in the directory that touches the filesystem. The
// generated YAML is checked in, exactly as economics.yaml, financial.yaml and
// trust.yaml are; edit the authoring code here, never the YAML.

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { writeSuiteFile } from "../emit.js";
import { renderSuite } from "./suite.js";
import { toAuthoredItems } from "./to-items.js";

const CHALLENGES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../challenges");

const variants = renderSuite();
const file = writeSuiteFile(CHALLENGES_DIR, "agentic-cognition", toAuthoredItems(variants));
console.log(`wrote ${variants.length} items to ${file}`);
```

- [ ] **Step 4: Run test to verify it passes, then generate the suite**

Run:
```
npx vitest run --config scripts/author/agentic/vitest.config.ts
```
Expected: PASS — all test files green.

Then generate the file:
```
npx tsx scripts/author/agentic/build.ts
```
Expected: `wrote 54 items to <repo>/challenges/agentic-cognition.yaml`.

Sanity-check the output by eye before committing — this is the artefact the R3 review gate reads:
```
grep -c "^  - name: agentic_" challenges/agentic-cognition.yaml
```
Expected: `54`.

- [ ] **Step 5: Commit**

```
git add scripts/author/agentic/to-items.ts scripts/author/agentic/build.ts scripts/author/agentic/to-items.test.ts challenges/agentic-cognition.yaml
git commit -m "feat(agentic): emit challenges/agentic-cognition.yaml (54 items)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Handoff checklist

- [ ] `npx vitest run --config scripts/author/agentic/vitest.config.ts` is green. **`npm test` does not run these tests** — `vitest.config.ts` globs `src/**` and `webapp/src/**` only. Say so in the handoff.
- [ ] `challenges/agentic-cognition.yaml` exists, carries 54 items, and is regenerable with `npx tsx scripts/author/agentic/build.ts`.
- [ ] Nothing outside `scripts/author/agentic/` and `challenges/agentic-cognition.yaml` was modified. Verify with `git diff --stat main`.
- [ ] R3 is ready to run: one scenario rendered all 18 ways, for the user to read. `npx tsx -e "import('./scripts/author/agentic/render.js').then(async m => { const s = await import('./scripts/author/agentic/scenarios/s1.js'); for (const v of m.renderScenario(s.buildS1(20260722))) console.log('=== ' + v.name + ' ===\n' + v.prompt + '\n'); })"`
- [ ] After P1 lands, confirm the suite loads: `./bench run --challenges agentic-cognition --configs <one-config>` on a single config, and confirm the `followUpPrompt` and `self_score_matches` paths execute. Until then this is blocked on P1, not on P2.

## Boundary escalations

Everything below is outside P2's boundary. None of it is planned or implemented here; each is raised for the lead to route.

1. **`self_score_matches` must translate the leading `(?i)` inline flag in its `extract` pattern.** P2 emits `extract: "(?i)SELF_SCORE:\\s*([01](?:\\.\\d{1,3})?)"` so a model writing `self_score:` in lower case is still parsed. That only works if P1's implementation runs `extract` through `translateInlineFlags` (`src/scoring/regex-flags.ts`) the way the `regex` check does. If P1 compiles the pattern with a bare `new RegExp`, the leading group is a `SyntaxError` and **every calibration check in all 54 items silently lands in the errored bucket and scores 0** — a failure mode that looks like universal miscalibration rather than a bug. **Requested of P1:** route `extract` through `translateInlineFlags`. **Fallback if declined:** P2 swaps the pattern to the case-expanded literal `[Ss][Ee][Ll][Ff]_[Ss][Cc][Oo][Rr][Ee]:\s*([01](?:\.\d{1,3})?)`, which needs no flag support. The implementer should read P1's landed `constraint-checks.ts` before generating the final YAML and pick accordingly.

2. **`followUpPrompt` must be accepted on the `ConstraintItem` variant of `ChallengeItem`** (`src/schema/challenge.ts`). P2 emits it on all 54 items. P1 owns the schema change; if it lands only on some variants, this suite will not load. Flagged because the generated YAML is unloadable until then, which will look like a P2 defect.

3. **The `constraint` scorer must evaluate `self_score_matches` last within its item and must not evaluate checks in parallel.** P2 emits the calibration check as the sixth element of the array and relies on the other five having been resolved first. This is already named as a risk in the spec; repeated here because P2's output depends on it and P2 cannot test it.

4. **No `category: agentic` exists in any current suite.** P2 emits it as a plain string on each item, which the schema accepts (`category: Schema.String`), so nothing is required of anyone. Noted only because a reviewer scanning for a registry of categories will not find one — there isn't one.

5. **The pilot-sweep gates (R4, R5) need hand-labelled model outputs, which P2 cannot produce.** R4 — mechanical checks validated against outputs the user hand-labels — is the gate that stops the set from measuring its own regexes. The synonym sets in this plan are authored to be generous, but generosity is a hypothesis until it meets real output. Whoever runs the pilot should expect to widen a synonym set or two and re-run `build.ts`; that is a content edit inside P2's boundary, not a redesign.
