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

describe("resolveChallenge entity scorers (set_match / ordered_match)", () => {
  const entityItem = (scorer: "set_match" | "ordered_match", expected: string[]) => ({
    name: "e",
    category: "x",
    tier: 1,
    prompt: "who colluded?",
    scorer,
    vocabulary: ["Alice", "Bob", "Carol"],
    expected,
  });

  it("resolves a well-formed set_match item, copying vocabulary/expected through", async () => {
    const challenge: Challenge = {
      id: "c",
      version: 1,
      passThreshold: 0.5,
      items: [entityItem("set_match", ["Alice", "Bob"])],
    };
    const exit = await run(provide(resolveChallenge(challenge, challengesDir)));
    expect(exit._tag).toBe("Success");
    if (exit._tag !== "Success") return;
    const scorer = exit.value.items.at(0)?.scorer;
    expect(scorer?.type).toBe("set_match");
    if (scorer?.type !== "set_match") return;
    expect(scorer.vocabulary).toEqual(["Alice", "Bob", "Carol"]);
    expect(scorer.expected).toEqual(["Alice", "Bob"]);
  });

  it("resolves a well-formed ordered_match item", async () => {
    const challenge: Challenge = {
      id: "c",
      version: 1,
      passThreshold: 0.5,
      items: [entityItem("ordered_match", ["Carol", "Alice"])],
    };
    const exit = await run(provide(resolveChallenge(challenge, challengesDir)));
    expect(exit._tag).toBe("Success");
    if (exit._tag !== "Success") return;
    expect(exit.value.items.at(0)?.scorer.type).toBe("ordered_match");
  });

  it("fails when an expected token is not in the vocabulary (unwinnable item)", async () => {
    const challenge: Challenge = {
      id: "c",
      version: 1,
      passThreshold: 0.5,
      items: [entityItem("set_match", ["Alice", "Zara"])],
    };
    const exit = await run(provide(resolveChallenge(challenge, challengesDir)));
    expect(exit._tag).toBe("Failure");
  });

  it("fails when expected is empty", async () => {
    const challenge: Challenge = {
      id: "c",
      version: 1,
      passThreshold: 0.5,
      items: [entityItem("ordered_match", [])],
    };
    const exit = await run(provide(resolveChallenge(challenge, challengesDir)));
    expect(exit._tag).toBe("Failure");
  });

  it("fails when expected contains a duplicate", async () => {
    const challenge: Challenge = {
      id: "c",
      version: 1,
      passThreshold: 0.5,
      items: [entityItem("set_match", ["Alice", "Alice"])],
    };
    const exit = await run(provide(resolveChallenge(challenge, challengesDir)));
    expect(exit._tag).toBe("Failure");
  });
});

describe("resolveChallenge regex pattern validation", () => {
  const constraintChallenge = (constraints: readonly unknown[]): Challenge =>
    ({
      id: "regex-val",
      version: 1,
      passThreshold: 0.5,
      items: [
        {
          name: "item_under_test",
          category: "x",
          tier: 1,
          prompt: "p",
          scorer: "constraint",
          constraints,
        },
      ],
    }) as unknown as Challenge;

  it("fails fast on a regex pattern that cannot compile even after flag translation", async () => {
    const challenge = constraintChallenge([
      { check: "regex", name: "midpattern_group", pattern: "foo(?i)bar" },
    ]);
    const exit = await run(provide(resolveChallenge(challenge, challengesDir)));
    expect(exit._tag).toBe("Failure");
    if (exit._tag !== "Failure") return;
    const rendered = String(exit.cause);
    expect(rendered).toContain("regex-val");
    expect(rendered).toContain("midpattern_group");
    expect(rendered).toContain("foo(?i)bar");
  });

  it("accepts leading Python inline flags (translated before compiling)", async () => {
    const challenge = constraintChallenge([
      { check: "regex", name: "ok_i", pattern: String.raw`(?i)Data\.TaggedError` },
      { check: "regex", name: "ok_m", pattern: String.raw`(?m)^yield\*` },
      { check: "regex_count_min", name: "ok_count", pattern: "(?i)effect", min: 2 },
    ]);
    const exit = await run(provide(resolveChallenge(challenge, challengesDir)));
    expect(exit._tag).toBe("Success");
  });

  it("validates regex_count_min patterns too", async () => {
    const challenge = constraintChallenge([
      { check: "regex_count_min", name: "broken_count", pattern: "[unclosed", min: 1 },
    ]);
    const exit = await run(provide(resolveChallenge(challenge, challengesDir)));
    expect(exit._tag).toBe("Failure");
    if (exit._tag !== "Failure") return;
    expect(String(exit.cause)).toContain("broken_count");
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
