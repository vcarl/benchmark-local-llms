import * as fsp from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, Exit, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { computePromptHash, legacyItemIdentity } from "../legacy/identity.js";
import { type Challenge, Challenge as ChallengeSchema } from "../schema/challenge.js";
import { defaultScope, loadChallenge, resolveChallenge } from "./challenges.js";
import { stableStringify } from "./hashing.js";

// Absolute path to the repo root (two levels up from src/config/)
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const challengesDir = path.join(repoRoot, "releases", "0", "challenges");

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
    expect(legacyItemIdentity(r).challengeHash).toHaveLength(12);
    expect(legacyItemIdentity(r).items.at(0)?.itemHash).toMatch(/^[0-9a-f]{12}$/);
    expect(legacyItemIdentity(r).items.at(0)?.itemHash).not.toBe(
      legacyItemIdentity(r).items.at(1)?.itemHash,
    );
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

  it("carries declared near misses into the scorer and rejects an uncompilable one", async () => {
    const item = (pattern: string) => ({
      name: "n",
      category: "x",
      tier: 1,
      prompt: "p",
      scorer: "constraint" as const,
      constraints: [{ check: "regex" as const, name: "r", pattern: "0\\.25" }],
      nearMisses: [{ slip: "percent-for-decimal", credit: 0.5, pattern }],
    });
    const ok = await run(
      provide(
        resolveChallenge(
          { id: "c", version: 1, passThreshold: 1, items: [item("25%")] },
          challengesDir,
        ),
      ),
    );
    expect(ok._tag).toBe("Success");
    if (ok._tag !== "Success") return;
    expect(ok.value.items[0]?.scorer).toMatchObject({
      nearMisses: [{ slip: "percent-for-decimal" }],
    });
    const bad = await run(
      provide(
        resolveChallenge(
          { id: "c", version: 1, passThreshold: 1, items: [item("(")] },
          challengesDir,
        ),
      ),
    );
    expect(bad._tag).toBe("Failure");
  });
});

describe("resolveChallenge custom scorer", () => {
  it("inlines the script file (relative to the challenge dir) as the scorer's source", async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "custom-scorer-"));
    await fsp.writeFile(path.join(dir, "score.py"), "print('{\"score\": 1}')\n");
    const challenge: Challenge = {
      id: "c",
      version: 1,
      passThreshold: 0.5,
      items: [
        { name: "k", category: "x", tier: 1, prompt: "p", scorer: "custom", script: "score.py" },
      ],
    };
    const exit = await run(provide(resolveChallenge(challenge, dir)));
    await fsp.rm(dir, { recursive: true, force: true });
    expect(exit._tag).toBe("Success");
    if (exit._tag !== "Success") return;
    expect(exit.value.items.at(0)?.scorer).toEqual({
      type: "custom",
      source: "print('{\"score\": 1}')\n",
    });
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
    expect(legacyItemIdentity(a).challengeHash).toBe(legacyItemIdentity(b).challengeHash);
    expect(legacyItemIdentity(a).challengeHash).toMatch(/^[0-9a-f]{12}$/);
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
    expect(legacyItemIdentity(h1).challengeHash).not.toBe(legacyItemIdentity(h2).challengeHash);
  });

  it("family is metadata: defaults to a singleton (turns share the parent's) and changes no hash", async () => {
    const turn = {
      prompt: "p",
      answer: "1",
      scorer: "exact_match",
      expected: "1",
      extract: "(\\d)",
    };
    const chain = { name: "c", category: "x", tier: 1, turns: [turn, turn] };
    const base = {
      id: "g",
      version: 1,
      passThreshold: 0.8,
      items: [exactItem("a", "q-a"), chain],
    } as unknown as Challenge;
    const tagged = {
      ...base,
      items: [
        { ...exactItem("a", "q-a"), family: "f" },
        { ...chain, family: "f" },
      ],
    } as unknown as Challenge;
    const [u, t] = await Promise.all([
      Effect.runPromise(provide(resolveChallenge(base, challengesDir))),
      Effect.runPromise(provide(resolveChallenge(tagged, challengesDir))),
    ]);
    expect(u.items.map((i) => i.family)).toEqual(["g/a", "g/c", "g/c"]);
    expect(t.items.map((i) => i.family)).toEqual(["f", "f", "f"]);
    expect(legacyItemIdentity(t).challengeHash).toBe(legacyItemIdentity(u).challengeHash);
    expect(legacyItemIdentity(t).items.map((i) => [i.itemHash, i.promptHash])).toEqual(
      legacyItemIdentity(u).items.map((i) => [i.itemHash, i.promptHash]),
    );
  });

  it("scope and seed are metadata: scope defaults by challenge id and changes no hash", async () => {
    const mk = (id: string, extra: object) =>
      ({
        id,
        version: 1,
        passThreshold: 0.8,
        items: [{ ...exactItem("a", "q-a"), ...extra }],
      }) as unknown as Challenge;
    const [core, stretch, tagged] = await Promise.all([
      Effect.runPromise(provide(resolveChallenge(mk("logic", {}), challengesDir))),
      Effect.runPromise(provide(resolveChallenge(mk("financial", {}), challengesDir))),
      Effect.runPromise(
        provide(resolveChallenge(mk("logic", { scope: "stretch", seed: 2 }), challengesDir)),
      ),
    ]);
    expect(core.items[0]?.scope).toBe("core");
    expect(stretch.items[0]?.scope).toBe("stretch");
    expect(tagged.items[0]?.scope).toBe("stretch");
    expect(legacyItemIdentity(tagged).challengeHash).toBe(legacyItemIdentity(core).challengeHash);
    expect(defaultScope("chains")).toBe("stretch");
    expect(defaultScope("extraction")).toBe("core");
  });
});

describe("resolveChallenge multi-turn items", () => {
  const turn = (prompt: string, answer: string) => ({
    prompt,
    answer,
    scorer: "exact_match" as const,
    expected: answer,
    extract: "(\\d+)",
  });
  const chain = (answers: [string, string, string]) =>
    ({
      id: "c",
      version: 1,
      passThreshold: 0.5,
      items: [
        {
          name: "chain",
          category: "x",
          tier: 2,
          tags: ["t"],
          turns: [turn("p1", answers[0]), turn("p2", answers[1]), turn("p3", answers[2])],
        },
      ],
    }) as unknown as Challenge;

  const resolve = async (c: Challenge) => {
    const exit = await run(provide(resolveChallenge(c, challengesDir)));
    if (exit._tag !== "Success") throw new Error(`resolve failed: ${String(exit.cause)}`);
    return exit.value;
  };

  it("expands into one scored unit per turn with parent id, turn index and gold history", async () => {
    const r = await resolve(chain(["1", "2", "3"]));
    expect(r.items.map((i) => i.itemId)).toEqual(["chain#1", "chain#2", "chain#3"]);
    expect(r.items.map((i) => i.parentItemId)).toEqual(["chain", "chain", "chain"]);
    expect(r.items.map((i) => i.turn)).toEqual([1, 2, 3]);
    const t3 = r.items[2];
    expect(t3?.prompt.name).toBe("chain#3");
    expect(t3?.prompt.promptText).toBe("p3");
    expect(t3?.prompt.tier).toBe(2);
    expect(t3?.prompt.history).toEqual([
      { role: "user", content: "p1" },
      { role: "assistant", content: "1" },
      { role: "user", content: "p2" },
      { role: "assistant", content: "2" },
    ]);
    expect(r.items[0]?.prompt.history).toBeUndefined();
  });

  it("hashes turn 1 like a single-shot prompt and later turns over the full conversation", async () => {
    const r = await resolve(chain(["1", "2", "3"]));
    expect(legacyItemIdentity(r).items[0]?.promptHash).toBe(computePromptHash("p1", ""));
    const convo = stableStringify([
      { role: "user", content: "p1" },
      { role: "assistant", content: "1" },
      { role: "user", content: "p2" },
    ]);
    expect(legacyItemIdentity(r).items[1]?.promptHash).toBe(computePromptHash(convo, ""));
  });

  it("changing an earlier gold answer changes every later turn's identity", async () => {
    const a = await resolve(chain(["1", "2", "3"]));
    const b = await resolve(chain(["7", "2", "3"]));
    expect(legacyItemIdentity(b).items[0]?.promptHash).toBe(
      legacyItemIdentity(a).items[0]?.promptHash,
    );
    expect(legacyItemIdentity(b).items[1]?.itemHash).not.toBe(
      legacyItemIdentity(a).items[1]?.itemHash,
    );
    expect(legacyItemIdentity(b).items[2]?.itemHash).not.toBe(
      legacyItemIdentity(a).items[2]?.itemHash,
    );
    expect(legacyItemIdentity(b).challengeHash).not.toBe(legacyItemIdentity(a).challengeHash);
  });

  it("fails when a turn's gold answer does not pass its own scorer", async () => {
    const c = chain(["1", "2", "3"]);
    const bad = {
      ...c,
      items: [
        {
          ...(c.items[0] as object),
          turns: [turn("p1", "1"), { ...turn("p2", "2"), expected: "9" }],
        },
      ],
    } as unknown as Challenge;
    const exit = await run(provide(resolveChallenge(bad, challengesDir)));
    expect(exit._tag).toBe("Failure");
  });

  it("carries a turn's near misses into its scorer; a gold answer that is only a near miss fails", async () => {
    const c = chain(["1", "2", "3"]);
    const withNear = (answer: string) =>
      Effect.runSync(
        Schema.decodeUnknown(ChallengeSchema)({
          ...c,
          items: [
            {
              ...(c.items[0] as object),
              turns: [
                turn("p1", "1"),
                {
                  ...turn("p2", answer),
                  expected: "2",
                  nearMisses: [{ slip: "off-by-one", credit: 0.5, expected: "3" }],
                },
              ],
            },
          ],
        }),
      );
    const r = await resolve(withNear("2"));
    expect(r.items[1]?.scorer).toMatchObject({
      nearMisses: [{ slip: "off-by-one", credit: 0.5, expected: "3" }],
    });
    const exit = await run(provide(resolveChallenge(withNear("3"), challengesDir)));
    expect(exit._tag).toBe("Failure");
  });

  it("rejects a multi-turn item with fewer than two turns", () => {
    const c = chain(["1", "2", "3"]);
    const one = {
      ...c,
      items: [{ ...(c.items[0] as object), turns: [turn("p1", "1")] }],
    };
    expect(Exit.isFailure(Effect.runSyncExit(Schema.decodeUnknown(ChallengeSchema)(one)))).toBe(
      true,
    );
  });

  it("fails when a turn id collides with another item name", async () => {
    const c = chain(["1", "2", "3"]);
    const clash = {
      ...c,
      items: [...c.items, exactItem("chain#2", "q")],
    } as unknown as Challenge;
    const exit = await run(provide(resolveChallenge(clash, challengesDir)));
    expect(exit._tag).toBe("Failure");
  });
});

describe("releases/draft/challenges/chains.yaml", () => {
  const load = async (id: string) => {
    const dir =
      id === "chains" ? path.join(repoRoot, "releases", "draft", "challenges") : challengesDir;
    const exit = await run(provide(loadChallenge(path.join(dir, `${id}.yaml`))));
    if (exit._tag !== "Success") throw new Error(`load ${id} failed: ${String(exit.cause)}`);
    return exit.value;
  };

  it("loads (every gold answer passes its turn's scorer) and expands to 13 turn units", async () => {
    const chains = await load("chains");
    expect(chains.items.map((i) => i.itemId)).toEqual([
      ...[1, 2, 3, 4].map((k) => `chain_amortization#${k}`),
      ...[1, 2, 3, 4].map((k) => `chain_tax_incidence#${k}`),
      ...[1, 2, 3, 4, 5].map((k) => `chain_monopoly#${k}`),
    ]);
  });

  it("asks turn 1 exactly as its single-shot baseline item", async () => {
    const [chains, financial, economics] = await Promise.all(
      ["chains", "financial", "economics"].map(load),
    );
    const hash = (c: typeof chains | undefined, id: string) =>
      c && legacyItemIdentity(c).items.find((i) => i.itemId === id)?.promptHash;
    expect(hash(chains, "chain_amortization#1")).toBe(
      hash(financial, "financial_amort_monthly_payment"),
    );
    expect(hash(chains, "chain_tax_incidence#1")).toBe(hash(economics, "econ_tax_quantity"));
    expect(hash(chains, "chain_monopoly#1")).toBe(hash(economics, "econ_monopoly_quantity"));
  });
});

describe("loadChallenge against real inline challenge files", () => {
  it.each([
    ["smoke", 4],
    ["code", 12],
    ["constraint", 10],
    ["effect-ts", 26],
    ["factual", 7],
    ["logic", 10],
    ["math", 13],
  ] as const)("loads challenges/%s.yaml (%i inline items)", async (id, count) => {
    const exit = await run(provide(loadChallenge(path.join(challengesDir, `${id}.yaml`))));
    expect(exit._tag).toBe("Success");
    if (exit._tag !== "Success") return;
    expect(exit.value.items).toHaveLength(count);
    expect(legacyItemIdentity(exit.value).challengeHash).toMatch(/^[0-9a-f]{12}$/);
    // code_exec items must have their companion test file inlined as testCode.
    for (const item of exit.value.items) {
      if (item.scorer.type === "code_exec") {
        expect(item.scorer.testCode.length).toBeGreaterThan(0);
      }
    }
  });
});
