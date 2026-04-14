import { Effect, TestClock, TestContext } from "effect";
import { describe, expect, it } from "vitest";
import { archiveFileName, makeRunId } from "../run-id.js";
import { sampleModel } from "./fixtures.js";

describe("run-id", () => {
  it("produces a runId with date, slug, quant, and shortId parts", async () => {
    const model = sampleModel({ name: "Qwen 3 32B", quant: "4bit" });
    const program = Effect.gen(function* () {
      // Pin to a known millis value via TestClock.
      yield* TestClock.setTime(new Date("2026-04-14T12:34:56Z").getTime());
      return yield* makeRunId(model);
    });
    const result = await Effect.runPromise(program.pipe(Effect.provide(TestContext.TestContext)));
    expect(result.runId.startsWith("2026-04-14_")).toBe(true);
    expect(result.runId).toContain("qwen-3-32b");
    expect(result.runId).toContain("4bit");
    expect(result.startedAt).toBe("2026-04-14T12:34:56.000Z");
  });

  it("is deterministic for a pinned clock (same model => same runId)", async () => {
    const model = sampleModel({ name: "Same Model", quant: "q4" });
    const build = Effect.gen(function* () {
      yield* TestClock.setTime(1_700_000_000_000);
      return yield* makeRunId(model);
    });
    const first = await Effect.runPromise(build.pipe(Effect.provide(TestContext.TestContext)));
    const second = await Effect.runPromise(build.pipe(Effect.provide(TestContext.TestContext)));
    expect(first.runId).toBe(second.runId);
  });

  it("falls back to artifact when no display name is configured", async () => {
    const model = sampleModel({ name: undefined, artifact: "weird/path-to-model-99B" });
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* TestClock.setTime(Date.now());
        return yield* makeRunId(model);
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
    expect(result.runId).toContain("weird-path-to-model-99b");
  });

  it("archiveFileName produces `{runId}.jsonl`", () => {
    expect(archiveFileName("abc_123")).toBe("abc_123.jsonl");
  });
});
