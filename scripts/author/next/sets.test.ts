// Validates every generated pilot item through the real loader and scorers:
// the committed YAML equals a fresh regeneration (determinism), the loader
// accepts it (schema + multi-turn gold check), every gold scores 1, every
// plausible wrong answer scores below 1, and every near miss scores exactly
// its partial credit (never full credit).

import { readFileSync } from "node:fs";
import * as path from "node:path";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { loadChallenge } from "../../../src/config/challenges.js";
import type { ScorerConfig } from "../../../src/schema/scorer.js";
import { scoreConstraints } from "../../../src/scoring/constraint.js";
import { scoreExactMatch } from "../../../src/scoring/exact-match.js";
import { scoreSetMatch } from "../../../src/scoring/set-match.js";
import { INT_EXTRACT, suiteYaml } from "../emit.js";
import { OUT_DIR, SETS } from "./draft-sets.js";

const score = (output: string, s: ScorerConfig): number => {
  if (s.type === "exact_match") return Effect.runSync(scoreExactMatch(output, s)).score;
  if (s.type === "constraint") return Effect.runSync(scoreConstraints(output, s)).score;
  if (s.type === "set_match") return Effect.runSync(scoreSetMatch(output, s)).score;
  throw new Error(`unexpected scorer ${s.type}`);
};

const EXPECTED_COUNTS: Record<string, number> = {
  ifeval: 12,
  dates: 12,
  longctx: 8,
  stretch: 15,
  toolcall: 240,
  classify: 12,
  followups: 12,
};

describe.each(Object.entries(SETS))("releases/draft/challenges/%s.yaml", (id, gen) => {
  const generated = gen();
  const file = path.join(OUT_DIR, `${id}.yaml`);

  it("regenerates byte-identically (seeded, deterministic)", () => {
    expect(readFileSync(file, "utf8")).toBe(
      suiteYaml(
        id,
        generated.map((g) => g.authored),
      ),
    );
    expect(generated).toHaveLength(EXPECTED_COUNTS[id] ?? -1);
  });

  it("loads; gold = 1, wrong < 1, near miss = its credit", async () => {
    const resolved = await Effect.runPromise(
      loadChallenge(file).pipe(Effect.provide(NodeFileSystem.layer)),
    );
    const units = generated.flatMap((g) => g.units);
    expect(resolved.items).toHaveLength(units.length);
    resolved.items.forEach((item, i) => {
      const u = units[i];
      if (u === undefined) throw new Error("unit mismatch");
      expect(score(u.gold, item.scorer), `${item.itemId} gold`).toBe(1);
      expect(u.wrong.length, `${item.itemId} has a wrong answer`).toBeGreaterThan(0);
      for (const w of u.wrong)
        expect(score(w, item.scorer), `${item.itemId} wrong ${w}`).toBeLessThan(1);
      for (const n of u.nearMiss ?? []) {
        expect(score(n.answer, item.scorer), `${item.itemId} near miss ${n.answer}`).toBe(n.credit);
      }
      const stretch = id === "stretch" || item.itemId.includes("_32k");
      expect(item.scope, `${item.itemId} scope`).toBe(stretch ? "stretch" : "core");
      expect(item.family).not.toMatch(/\//); // explicit family, not the per-item default
    });
  });
});

describe("stretch INT_EXTRACT", () => {
  const s = (output: string) =>
    score(output, { type: "exact_match", extract: INT_EXTRACT, expected: "426000" });
  it("reads a whole-dollar answer with commas or a .00/.0 tail as the integer", () => {
    for (const o of ["$426,000.00", "426,000", "426000", "Total: $426,000.0."])
      expect(s(o), o).toBe(1);
  });
  it("rejects a different integer or a non-zero cents tail", () => {
    for (const o of ["426,001", "$426,000.50"]) expect(s(o), o).toBe(0);
  });
});
