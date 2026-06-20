import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { Challenge } from "../schema/challenge.js";
import { loadChallenge, resolveChallenge } from "./challenges.js";

// Absolute path to the repo root (two levels up from src/config/)
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const challengesDir = path.join(repoRoot, "challenges");

/** Inline exact_match item (flat on-disk shape). */
const exactItem = (name: string, prompt: string) => ({
  name,
  category: "x",
  tier: 1,
  prompt,
  scorer: "exact_match" as const,
  expected: "1",
  extract: "(\\d)",
});

const run = <A, E>(eff: Effect.Effect<A, E, never>) => Effect.runPromiseExit(eff);
const provide = <A, E>(
  eff: Effect.Effect<A, E, FileSystem.FileSystem>,
): Effect.Effect<A, E, never> => eff.pipe(Effect.provide(NodeFileSystem.layer));

describe("resolveChallenge", () => {
  it("resolves inline items, computes per-item scorer + hashes, stamps challengeHash", async () => {
    const challenge: Challenge = {
      id: "c",
      version: 1,
      passThreshold: 0.5,
      items: [
        {
          name: "a",
          category: "x",
          tier: 1,
          prompt: "needs json",
          scorer: "constraint",
          constraints: [{ check: "valid_json", name: "j" }],
        },
        exactItem("b", "q-b"),
      ],
    };
    const exit = await run(provide(resolveChallenge(challenge, challengesDir)));
    expect(exit._tag).toBe("Success");
    if (exit._tag !== "Success") return;
    const r = exit.value;
    expect(r.challengeHash).toHaveLength(12);
    expect(r.items.at(0)?.itemHash).toMatch(/^[0-9a-f]{12}$/);
    expect(r.items.at(0)?.itemHash).not.toBe(r.items.at(1)?.itemHash);
    expect(r.items.at(0)?.scorer.type).toBe("constraint");
    expect(r.items.at(1)?.scorer.type).toBe("exact_match");
  });

  it("fails when two items share a name", async () => {
    const challenge: Challenge = {
      id: "c",
      version: 1,
      passThreshold: 0.5,
      items: [exactItem("dup", "p1"), exactItem("dup", "p2")],
    };
    const exit = await run(provide(resolveChallenge(challenge, challengesDir)));
    expect(exit._tag).toBe("Failure");
  });
});

describe("resolveChallenge hashing", () => {
  it("challengeHash is deterministic for fixed inline items", async () => {
    const challenge: Challenge = {
      id: "g",
      version: 1,
      passThreshold: 0.8,
      items: [exactItem("a", "q-a"), exactItem("b", "q-b")],
    };
    const [a, b] = await Promise.all([
      Effect.runPromise(provide(resolveChallenge(challenge, challengesDir))),
      Effect.runPromise(provide(resolveChallenge(challenge, challengesDir))),
    ]);
    expect(a.challengeHash).toBe(b.challengeHash);
    expect(a.challengeHash).toMatch(/^[0-9a-f]{12}$/);
  });

  it("challengeHash drifts when an item's prompt text changes", async () => {
    const base: Challenge = {
      id: "g",
      version: 1,
      passThreshold: 0.8,
      items: [exactItem("a", "q-a")],
    };
    const drifted: Challenge = { ...base, items: [exactItem("a", "DIFFERENT")] };
    const [h1, h2] = await Promise.all([
      Effect.runPromise(provide(resolveChallenge(base, challengesDir))),
      Effect.runPromise(provide(resolveChallenge(drifted, challengesDir))),
    ]);
    expect(h1.challengeHash).not.toBe(h2.challengeHash);
  });
});

describe("loadChallenge against real inline challenge files", () => {
  it.each([
    ["smoke", 4],
    ["code", 12],
    ["constraint", 10],
    ["effect-ts", 26],
    ["factual", 9],
    ["logic", 10],
    ["math", 13],
  ] as const)("loads challenges/%s.yaml (%i inline items)", async (id, count) => {
    const exit = await run(provide(loadChallenge(path.join(challengesDir, `${id}.yaml`))));
    expect(exit._tag).toBe("Success");
    if (exit._tag !== "Success") return;
    expect(exit.value.items).toHaveLength(count);
    expect(exit.value.challengeHash).toMatch(/^[0-9a-f]{12}$/);
    // code_exec items must have their companion test file inlined as testCode.
    for (const item of exit.value.items) {
      if (item.scorer.type === "code_exec") {
        expect(item.scorer.testCode.length).toBeGreaterThan(0);
      }
    }
  });
});
