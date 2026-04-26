import { NodeContext } from "@effect/platform-node";
import { Effect, Option } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureLogs } from "../../cli/__tests__/log-capture.js";
import { findCachedResult } from "../cache.js";
import { appendResult, writeManifestHeader } from "../writer.js";
import { openManifest, sampleResult } from "./fixtures.js";
import { makeTempDir, removeDir } from "./test-utils.js";

describe("findCachedResult", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir();
  });
  afterEach(async () => {
    await removeDir(dir);
  });

  const seed = (
    file: string,
    artifact: string,
    results: ReadonlyArray<ReturnType<typeof sampleResult>>,
  ) =>
    Effect.gen(function* () {
      yield* writeManifestHeader(`${dir}/${file}`, openManifest({ artifact }));
      for (const r of results) {
        yield* appendResult(`${dir}/${file}`, r);
      }
    });

  it("returns None for an empty archive directory", async () => {
    const exit = await Effect.runPromise(
      findCachedResult(dir, {
        artifact: "any",
        runId: "r-2026-04-14-deadbe",
        promptName: "p",
        promptHash: "h",
        temperature: 0.7,
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(Option.isNone(exit)).toBe(true);
  });

  it("returns Some(result) for a single-archive match", async () => {
    const r = sampleResult({ promptName: "p1", promptHash: "h1", temperature: 0.7 });
    const exit = await Effect.runPromise(
      Effect.gen(function* () {
        yield* seed("a.jsonl", "artifact-A", [r]);
        return yield* findCachedResult(dir, {
          artifact: "artifact-A",
          runId: "r-2026-04-14-deadbe",
          promptName: "p1",
          promptHash: "h1",
          temperature: 0.7,
        });
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(Option.isSome(exit)).toBe(true);
    if (Option.isSome(exit)) {
      expect(exit.value.promptName).toBe("p1");
    }
  });

  it("only considers archives whose manifest artifact matches the key", async () => {
    const rWrongArtifact = sampleResult({ promptName: "p1", promptHash: "h1", temperature: 0.7 });
    const rRightArtifact = sampleResult({
      promptName: "p1",
      promptHash: "h1",
      temperature: 0.7,
      output: "from-right",
    });
    const exit = await Effect.runPromise(
      Effect.gen(function* () {
        yield* seed("wrong.jsonl", "artifact-X", [rWrongArtifact]);
        yield* seed("right.jsonl", "artifact-A", [rRightArtifact]);
        return yield* findCachedResult(dir, {
          artifact: "artifact-A",
          runId: "r-2026-04-14-deadbe",
          promptName: "p1",
          promptHash: "h1",
          temperature: 0.7,
        });
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(Option.isSome(exit)).toBe(true);
    if (Option.isSome(exit)) {
      expect(exit.value.output).toBe("from-right");
    }
  });

  it("returns the most recent match by executedAt when multiple archives match", async () => {
    const older = sampleResult({
      promptName: "p1",
      promptHash: "h1",
      temperature: 0.7,
      executedAt: "2026-01-01T00:00:00.000Z",
      output: "old",
    });
    const newer = sampleResult({
      promptName: "p1",
      promptHash: "h1",
      temperature: 0.7,
      executedAt: "2026-04-14T12:00:00.000Z",
      output: "new",
    });
    const exit = await Effect.runPromise(
      Effect.gen(function* () {
        yield* seed("older.jsonl", "artifact-A", [older]);
        yield* seed("newer.jsonl", "artifact-A", [newer]);
        return yield* findCachedResult(dir, {
          artifact: "artifact-A",
          runId: "r-2026-04-14-deadbe",
          promptName: "p1",
          promptHash: "h1",
          temperature: 0.7,
        });
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(Option.isSome(exit)).toBe(true);
    if (Option.isSome(exit)) {
      expect(exit.value.output).toBe("new");
    }
  });

  it("returns None when promptHash differs even with matching name+temperature", async () => {
    const stored = sampleResult({ promptName: "p1", promptHash: "old-hash", temperature: 0.7 });
    const exit = await Effect.runPromise(
      Effect.gen(function* () {
        yield* seed("a.jsonl", "artifact-A", [stored]);
        return yield* findCachedResult(dir, {
          artifact: "artifact-A",
          runId: "r-2026-04-14-deadbe",
          promptName: "p1",
          promptHash: "new-hash",
          temperature: 0.7,
        });
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(Option.isNone(exit)).toBe(true);
  });

  it("returns None when temperature differs", async () => {
    const stored = sampleResult({ promptName: "p1", promptHash: "h1", temperature: 0.7 });
    const exit = await Effect.runPromise(
      Effect.gen(function* () {
        yield* seed("a.jsonl", "artifact-A", [stored]);
        return yield* findCachedResult(dir, {
          artifact: "artifact-A",
          runId: "r-2026-04-14-deadbe",
          promptName: "p1",
          promptHash: "h1",
          temperature: 0.3,
        });
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(Option.isNone(exit)).toBe(true);
  });

  it("emits Debug logs for scan start and candidate count with scope=cache", async () => {
    const r = sampleResult({ promptName: "p1", promptHash: "h1", temperature: 0.7 });
    const lines: Array<string> = [];
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* seed("a.jsonl", "artifact-A", [r]);
        return yield* findCachedResult(dir, {
          artifact: "artifact-A",
          runId: "r-2026-04-14-deadbe",
          promptName: "p1",
          promptHash: "h1",
          temperature: 0.7,
        });
      }).pipe(Effect.provide(NodeContext.layer), Effect.provide(captureLogs(lines))),
    );
    const joined = lines.join("\n");
    expect(joined).toContain("DBG cache");
    expect(joined).toMatch(
      /scanning .+ \(1 files\) for key=\(artifact-A,r-2026-04-14-deadbe,p1,h1,0\.7\)/,
    );
    expect(joined).toContain("1 candidates, picked archiveId=");
    expect(joined).toContain("(most recent)");
  });

  it("emits '0 candidates' Debug log when the archive is empty", async () => {
    const lines: Array<string> = [];
    await Effect.runPromise(
      findCachedResult(dir, {
        artifact: "artifact-A",
        runId: "r-2026-04-14-deadbe",
        promptName: "p1",
        promptHash: "h1",
        temperature: 0.7,
      }).pipe(Effect.provide(NodeContext.layer), Effect.provide(captureLogs(lines))),
    );
    const joined = lines.join("\n");
    expect(joined).toContain("scanning");
    expect(joined).toContain("(0 files)");
    expect(joined).toContain("0 candidates");
  });

  it("only returns a hit when the manifest's runId matches the cache key", async () => {
    const r = sampleResult({
      promptName: "p1",
      promptHash: "h1",
      temperature: 0.7,
      runId: "r-run-A",
    });
    const exit = await Effect.runPromise(
      Effect.gen(function* () {
        yield* writeManifestHeader(
          `${dir}/a.jsonl`,
          openManifest({ artifact: "artifact-A", runId: "r-run-A" }),
        );
        yield* appendResult(`${dir}/a.jsonl`, r);
        return yield* findCachedResult(dir, {
          artifact: "artifact-A",
          runId: "r-run-B", // different run
          promptName: "p1",
          promptHash: "h1",
          temperature: 0.7,
        });
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(Option.isNone(exit)).toBe(true);
  });

  it("returns the hit when manifest runId matches", async () => {
    const r = sampleResult({
      promptName: "p1",
      promptHash: "h1",
      temperature: 0.7,
      runId: "r-run-A",
    });
    const exit = await Effect.runPromise(
      Effect.gen(function* () {
        yield* writeManifestHeader(
          `${dir}/a.jsonl`,
          openManifest({ artifact: "artifact-A", runId: "r-run-A" }),
        );
        yield* appendResult(`${dir}/a.jsonl`, r);
        return yield* findCachedResult(dir, {
          artifact: "artifact-A",
          runId: "r-run-A",
          promptName: "p1",
          promptHash: "h1",
          temperature: 0.7,
        });
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(Option.isSome(exit)).toBe(true);
  });
});
