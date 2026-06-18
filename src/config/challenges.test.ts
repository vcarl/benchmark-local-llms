import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { resolveChallenge } from "./challenges.js";

const promptEntry = (name: string, hash: string) =>
  ({
    name,
    category: "x",
    tier: 1,
    system: { key: "direct", text: "Be concise." },
    promptText: `q-${name}`,
    scorer: { type: "exact_match", expected: "1", extract: "(\\d)" },
    promptHash: hash,
    tags: [],
  }) as unknown as import("../schema/prompt.js").PromptCorpusEntry;

describe("resolveChallenge", () => {
  it("resolves prompt refs, picks item scorer override, stamps challengeHash", () =>
    Effect.runPromise(
      resolveChallenge(
        {
          id: "c",
          version: 1,
          passThreshold: 0.5,
          items: [
            { prompt: "a", scorer: { type: "constraint", constraints: [] } },
            { prompt: "b" },
          ],
        },
        [promptEntry("a", "h-a"), promptEntry("b", "h-b")],
      ),
    ).then((r) => {
      expect(r.challengeHash).toHaveLength(12);
      expect(r.items.at(0)?.scorer.type).toBe("constraint"); // override wins
      expect(r.items.at(1)?.scorer.type).toBe("exact_match"); // falls back to prompt's
    }));

  it("fails when an item references an unknown prompt", () =>
    Effect.runPromise(
      resolveChallenge(
        { id: "c", version: 1, passThreshold: 0.5, items: [{ prompt: "missing" }] },
        [],
      ).pipe(Effect.match({ onFailure: () => "failed", onSuccess: () => "ok" })),
    ).then((x) => expect(x).toBe("failed")));
});
