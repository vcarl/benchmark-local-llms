import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import { type CacheKey, findCachedItem, findCachedSamples } from "../cache.js";

const header = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    schemaVersion: 1,
    attemptId: "att-x",
    startedAt: "2026-01-01T00:00:00Z",
    finishedAt: "2026-01-01T00:01:00Z",
    interrupted: false,
    configId: "cfg",
    configHash: "ch",
    artifact: "qwen",
    runtime: "llamacpp",
    quant: "q4",
    temperature: 0,
    systemPrompt: "concise",
    maxTokens: 512,
    challengeId: "code",
    challengeVersion: 1,
    challengeHash: "xh",
    env: {
      hostname: "h",
      platform: "p",
      runtimeVersion: "1",
      nodeVersion: "1",
      benchmarkGitSha: "s",
    },
    aggregate: { score: 1, passed: true },
    ...over,
  });

const item = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    itemId: "i1",
    promptName: "i1",
    promptHash: "ph",
    itemHash: "ih-target",
    executedAt: "2026-01-01T00:00:30Z",
    promptTokens: 10,
    generationTokens: 100,
    promptTps: 1,
    generationTps: 1,
    peakMemoryGb: 0,
    wallTimeSec: 2,
    output: "o",
    reasoning: null,
    rawOutput: "o",
    error: null,
    score: 1,
    ...over,
  });

const KEY: CacheKey = {
  configHash: "ch",
  challengeId: "code",
  challengeVersion: 1,
  itemHash: "ih-target",
};

const run = <A>(
  eff: Effect.Effect<A, unknown, FileSystem.FileSystem | import("@effect/platform").Path.Path>,
  files: Record<string, string>,
  dir: string,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory(dir, { recursive: true });
      for (const [name, body] of Object.entries(files)) {
        yield* fs.writeFileString(`${dir}/${name}`, body);
      }
      return yield* eff;
    }).pipe(Effect.provide(NodeContext.layer)),
  );

describe("findCachedSamples", () => {
  it("returns the newest line per sample index; an unmarked line is sample 0", async () => {
    const dir = `/tmp/p4-cache-samples-${process.pid}`;
    const res = await run(
      findCachedSamples(dir, KEY),
      {
        "a.jsonl": `${header()}\n${item({ output: "s0" })}\n${item({ sample: 1, output: "s1-old" })}\n`,
        "b.jsonl": `${header()}\n${item({ sample: 1, output: "s1-new", executedAt: "2026-02-01T00:00:00Z" })}\n${item({ sample: 2, itemHash: "other" })}\n`,
      },
      dir,
    );
    expect([...res.keys()].sort()).toEqual([0, 1]);
    expect(res.get(0)?.output).toBe("s0");
    expect(res.get(1)?.output).toBe("s1-new");
  });
});

describe("findCachedItem", () => {
  it("returns the matching item from a completed attempt", async () => {
    const dir = `/tmp/p4-cache-hit-${process.pid}`;
    const res = await run(findCachedItem(dir, KEY), { "a.jsonl": `${header()}\n${item()}\n` }, dir);
    expect(Option.isSome(res)).toBe(true);
    if (Option.isSome(res)) expect(res.value.itemHash).toBe("ih-target");
  });

  it("misses when configHash differs", async () => {
    const dir = `/tmp/p4-cache-cfg-${process.pid}`;
    const res = await run(
      findCachedItem(dir, KEY),
      { "a.jsonl": `${header({ configHash: "other" })}\n${item()}\n` },
      dir,
    );
    expect(Option.isNone(res)).toBe(true);
  });

  it("misses when itemHash differs", async () => {
    const dir = `/tmp/p4-cache-ih-${process.pid}`;
    const res = await run(
      findCachedItem(dir, KEY),
      { "a.jsonl": `${header()}\n${item({ itemHash: "other" })}\n` },
      dir,
    );
    expect(Option.isNone(res)).toBe(true);
  });

  it("misses when challengeVersion differs", async () => {
    const dir = `/tmp/p4-cache-ver-${process.pid}`;
    const res = await run(
      findCachedItem(dir, KEY),
      { "a.jsonl": `${header({ challengeVersion: 2 })}\n${item()}\n` },
      dir,
    );
    expect(Option.isNone(res)).toBe(true);
  });

  it("ignores incomplete attempts (interrupted or unfinalized)", async () => {
    const dir = `/tmp/p4-cache-incomplete-${process.pid}`;
    const res = await run(
      findCachedItem(dir, KEY),
      {
        "a.jsonl": `${header({ interrupted: true })}\n${item()}\n`,
        "b.jsonl": `${header({ finishedAt: null })}\n${item()}\n`,
      },
      dir,
    );
    expect(Option.isNone(res)).toBe(true);
  });

  it("tie-breaks on the matched item's executedAt (most recent wins)", async () => {
    const dir = `/tmp/p4-cache-tie-${process.pid}`;
    const res = await run(
      findCachedItem(dir, KEY),
      {
        "old.jsonl": `${header()}\n${item({ executedAt: "2026-01-01T00:00:00Z", output: "old" })}\n`,
        "new.jsonl": `${header()}\n${item({ executedAt: "2026-06-01T00:00:00Z", output: "new" })}\n`,
      },
      dir,
    );
    expect(Option.isSome(res)).toBe(true);
    if (Option.isSome(res)) expect(res.value.output).toBe("new");
  });
});

describe("findCachedSamples cachedFrom", () => {
  it("stamps the executing attempt, preferring it over a verbatim replay found first", async () => {
    const dir = `/tmp/p4-cache-origin-${process.pid}`;
    const res = await run(
      findCachedSamples(dir, KEY),
      {
        // Sorted first: a legacy replay (started after the line executed) holding the same line.
        "a.jsonl": `${header({ attemptId: "att-replay", startedAt: "2026-03-01T00:00:00Z" })}\n${item()}\n`,
        "b.jsonl": `${header({ attemptId: "att-orig" })}\n${item()}\n`,
      },
      dir,
    );
    expect(res.get(0)?.cachedFrom).toEqual({
      attemptId: "att-orig",
      executedAt: "2026-01-01T00:00:30Z",
    });
  });

  it("keeps a line's existing cachedFrom", async () => {
    const dir = `/tmp/p4-cache-origin-keep-${process.pid}`;
    const origin = { attemptId: "att-first", executedAt: "2026-01-01T00:00:30Z" };
    const res = await run(
      findCachedSamples(dir, KEY),
      { "a.jsonl": `${header({ attemptId: "att-replay" })}\n${item({ cachedFrom: origin })}\n` },
      dir,
    );
    expect(res.get(0)?.cachedFrom).toEqual(origin);
  });
});

describe("findCachedSamples hardware scope", () => {
  const env = (hardwareId?: string) => ({
    platform: "p",
    runtimeVersion: "1",
    nodeVersion: "1",
    benchmarkGitSha: "s",
    ...(hardwareId === undefined ? {} : { hardwareId }),
  });

  it("never serves a line from another machine; a legacy line (no hardwareId) is local", async () => {
    const dir = `/tmp/p4-cache-hw-${process.pid}`;
    const res = await run(
      findCachedSamples(dir, { ...KEY, hardwareId: "mine" }),
      {
        "a.jsonl": `${header({ attemptId: "att-other", env: env("other") })}\n${item({ executedAt: "2026-09-01T00:00:00Z", output: "other" })}\n`,
        "b.jsonl": `${header({ attemptId: "att-legacy", env: env() })}\n${item({ output: "legacy" })}\n`,
      },
      dir,
    );
    expect(res.get(0)?.output).toBe("legacy");
  });
});
