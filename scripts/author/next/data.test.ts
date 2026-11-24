import { readFileSync } from "node:fs";
import * as path from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { loadChallenge } from "../../../src/config/challenges.js";
import { scoreByConfig } from "../../../src/scoring/dispatch.js";
import { buildSet, DATA_SETS, NEXT_DIR, renderAll } from "./draft-data.js";

const score = (output: string, scorer: Parameters<typeof scoreByConfig>[1]) =>
  Effect.runPromise(
    scoreByConfig(output, scorer).pipe(
      Effect.map((s) => s.score),
      Effect.provide(NodeContext.layer),
    ),
  );

describe("data-work pilot sets (releases/draft/challenges/)", () => {
  it("files on disk match a fresh render (seeded generation is deterministic)", () => {
    for (const [name, content] of renderAll()) {
      expect(readFileSync(path.join(NEXT_DIR, name), "utf8"), name).toBe(content);
    }
  }, 60_000); // codefix screens its mutants in the sandbox

  it("has the pilot sizes: 12 extraction, 12 transform, 9 sql, 9 regex, 12 codefix", () => {
    expect(DATA_SETS.map((s) => [s.id, buildSet(s).length])).toEqual([
      ["extraction", 12],
      ["transform", 12],
      ["sql", 9],
      ["regex", 9],
      ["codefix", 12],
    ]);
  });

  for (const set of DATA_SETS) {
    it(`${set.id}: every gold answer scores 1 and every planted wrong answer scores below 1`, async () => {
      const loaded = await Effect.runPromise(
        loadChallenge(path.join(NEXT_DIR, `${set.id}.yaml`)).pipe(
          Effect.provide(NodeContext.layer),
        ),
      );
      const generated = buildSet(set);
      expect(loaded.items.map((i) => i.itemId)).toEqual(
        generated.map((g) => g.authored.item["name"]),
      );
      await Promise.all(
        generated.map(async (g, k) => {
          const item = loaded.items[k];
          if (item === undefined) throw new Error("missing item");
          expect(item.prompt.promptText, item.itemId).toBe(g.authored.item["prompt"]);
          expect(item.scope).toBe("core");
          expect(await score(g.gold, item.scorer), `${item.itemId} gold`).toBe(1);
          expect(g.wrong.length).toBeGreaterThan(0);
          for (const w of g.wrong) {
            expect(
              await score(w, item.scorer),
              `${item.itemId} wrong: ${w.slice(0, 80)}`,
            ).toBeLessThan(1);
          }
        }),
      );
    }, 60_000);
  }
});
