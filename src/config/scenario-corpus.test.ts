import { NodeFileSystem } from "@effect/platform-node";
import { Effect, type Exit } from "effect";
import { describe, expect, it } from "vitest";
import { fixturePath } from "./__fixtures__/test-helpers.js";
import { loadScenarioCorpus } from "./scenario-corpus.js";

const run = <A, E>(eff: Effect.Effect<A, E, never>): Promise<Exit.Exit<A, E>> =>
  Effect.runPromiseExit(eff);

describe("loadScenarioCorpus", () => {
  it("decodes scenarios, inlines the companion .md, and computes scenarioHash", async () => {
    const exit = await run(
      loadScenarioCorpus(fixturePath("prompts", "scenarios")).pipe(
        Effect.provide(NodeFileSystem.layer),
      ),
    );
    expect(exit._tag).toBe("Success");
    if (exit._tag !== "Success") return;
    const byName = new Map(exit.value.map((e) => [e.name, e]));

    const boot = byName.get("bootstrap_grind");
    expect(boot).toBeDefined();
    if (!boot) return;
    expect(boot.fixture).toBe("starter_city");
    expect(boot.scenarioMd).toContain("Bootstrap Grind");
    expect(boot.cutoffs).toEqual({
      wallClockSec: 600,
      totalTokens: 50000,
      toolCalls: 100,
    });
    expect(boot.players).toHaveLength(2);
    // scenarioHash is a 12-char hex string
    expect(boot.scenarioHash).toMatch(/^[0-9a-f]{12}$/);

    const pirate = byName.get("combat_pirate");
    expect(pirate).toBeDefined();
    if (!pirate) return;
    // Different inputs produce different hashes
    expect(pirate.scenarioHash).not.toBe(boot.scenarioHash);
    expect(pirate.scenarioMd).toContain("Combat Pirate");
  });

  it("fails with ConfigError when a scenario's .md file is missing", async () => {
    const exit = await run(
      loadScenarioCorpus(fixturePath("scenarios-missing-md")).pipe(
        Effect.provide(NodeFileSystem.layer),
      ),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag !== "Failure") return;
    const body = JSON.stringify(exit.cause);
    expect(body).toContain("ConfigError");
    expect(body).toContain("scenarioMd");
    expect(body).toContain("does_not_exist.md");
  });
});
