import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { PromptCorpusEntry } from "../schema/prompt.js";
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

const stub = (
  name: string,
  promptHash: string,
  scorer: PromptCorpusEntry["scorer"],
): PromptCorpusEntry => ({
  name,
  category: "x",
  tier: 1,
  system: { key: "none", text: "" },
  promptText: "irrelevant to challengeHash",
  scorer,
  promptHash,
});

it("challengeHash is stable for fixed item prompt-hashes + scorers (golden)", async () => {
  const corpus = [
    stub("a", "aaaaaaaaaaaa", { type: "exact_match", expected: "4", extract: "(\\d+)" }),
    stub("b", "bbbbbbbbbbbb", {
      type: "constraint",
      constraints: [{ check: "valid_json", name: "j" }],
    }),
  ];
  const challenge = {
    id: "g",
    version: 1,
    passThreshold: 0.8,
    items: [{ prompt: "a" }, { prompt: "b" }],
  };
  const exit = await Effect.runPromiseExit(resolveChallenge(challenge as never, corpus));
  expect(exit._tag).toBe("Success");
  if (exit._tag !== "Success") return;
  expect(exit.value.challengeHash).toBe("9c2d6d88c900");
});

it("challengeHash drifts when an item prompt-hash changes", async () => {
  const scorer = { type: "exact_match" as const, expected: "4", extract: "(\\d+)" };
  const challenge = { id: "g", version: 1, passThreshold: 0.8, items: [{ prompt: "a" }] };
  const h1 = await Effect.runPromise(
    resolveChallenge(challenge as never, [stub("a", "aaaaaaaaaaaa", scorer)]),
  );
  const h2 = await Effect.runPromise(
    resolveChallenge(challenge as never, [stub("a", "cccccccccccc", scorer)]),
  );
  expect(h1.challengeHash).not.toBe(h2.challengeHash);
});
