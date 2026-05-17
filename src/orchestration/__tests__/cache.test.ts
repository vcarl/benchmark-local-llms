import * as path from "node:path";
import { Effect, Option } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openManifest } from "../../archive/__tests__/fixtures.js";
import { appendResult, writeManifestHeader } from "../../archive/writer.js";
import { isValidCachedResult, lookupCache } from "../cache.js";
import { makeTempDir, platformLayer, removeDir, sampleExistingResult } from "./fixtures.js";

describe("lookupCache", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir();
  });
  afterEach(async () => {
    await removeDir(dir);
  });

  it("returns None for an empty archive directory (nothing to hit)", async () => {
    const result = await Effect.runPromise(
      lookupCache({
        archiveDir: dir,
        artifact: "artifact-1",
        runId: "prior-run",
        promptName: "p1",
        promptHash: "h",
        temperature: 0.7,
        fresh: false,
      }).pipe(Effect.provide(platformLayer)),
    );
    expect(Option.isNone(result)).toBe(true);
  });

  it("returns Some when a matching result exists in an archive with matching artifact", async () => {
    const archivePath = path.join(dir, "prior.jsonl");
    const prog = Effect.gen(function* () {
      yield* writeManifestHeader(
        archivePath,
        openManifest({ artifact: "artifact-X", runId: "prior-run" }),
      );
      yield* appendResult(
        archivePath,
        sampleExistingResult({
          promptName: "p1",
          promptHash: "hash-p1",
          temperature: 0.7,
        }),
      );
    });
    await Effect.runPromise(prog.pipe(Effect.provide(platformLayer)));

    const result = await Effect.runPromise(
      lookupCache({
        archiveDir: dir,
        artifact: "artifact-X",
        runId: "prior-run",
        promptName: "p1",
        promptHash: "hash-p1",
        temperature: 0.7,
        fresh: false,
      }).pipe(Effect.provide(platformLayer)),
    );
    expect(Option.isSome(result)).toBe(true);
  });

  it("is `fresh`-aware — returns None even with a cache hit", async () => {
    const archivePath = path.join(dir, "prior.jsonl");
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* writeManifestHeader(
          archivePath,
          openManifest({ artifact: "a", runId: "prior-run" }),
        );
        yield* appendResult(
          archivePath,
          sampleExistingResult({
            promptName: "p1",
            promptHash: "hash-p1",
            temperature: 0.7,
          }),
        );
      }).pipe(Effect.provide(platformLayer)),
    );

    const fresh = await Effect.runPromise(
      lookupCache({
        archiveDir: dir,
        artifact: "a",
        runId: "prior-run",
        promptName: "p1",
        promptHash: "hash-p1",
        temperature: 0.7,
        fresh: true,
      }).pipe(Effect.provide(platformLayer)),
    );
    expect(Option.isNone(fresh)).toBe(true);
  });

  it("treats different temperatures as a cache miss", async () => {
    const archivePath = path.join(dir, "prior.jsonl");
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* writeManifestHeader(
          archivePath,
          openManifest({ artifact: "a", runId: "prior-run" }),
        );
        yield* appendResult(
          archivePath,
          sampleExistingResult({
            promptName: "p1",
            promptHash: "hash-p1",
            temperature: 0.7,
          }),
        );
      }).pipe(Effect.provide(platformLayer)),
    );

    const miss = await Effect.runPromise(
      lookupCache({
        archiveDir: dir,
        artifact: "a",
        runId: "prior-run",
        promptName: "p1",
        promptHash: "hash-p1",
        // Different temperature — no hit.
        temperature: 0.3,
        fresh: false,
      }).pipe(Effect.provide(platformLayer)),
    );
    expect(Option.isNone(miss)).toBe(true);
  });

  it("filters out errored cache entries (invalid results)", async () => {
    const archivePath = path.join(dir, "prior.jsonl");
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* writeManifestHeader(
          archivePath,
          openManifest({ artifact: "a", runId: "prior-run" }),
        );
        yield* appendResult(
          archivePath,
          sampleExistingResult({
            promptName: "p1",
            promptHash: "hash-p1",
            temperature: 0.7,
            error: "LlmTimeoutError: ...",
            output: "",
          }),
        );
      }).pipe(Effect.provide(platformLayer)),
    );

    const result = await Effect.runPromise(
      lookupCache({
        archiveDir: dir,
        artifact: "a",
        runId: "prior-run",
        promptName: "p1",
        promptHash: "hash-p1",
        temperature: 0.7,
        fresh: false,
      }).pipe(Effect.provide(platformLayer)),
    );
    expect(Option.isNone(result)).toBe(true);
  });

  it("returns None when artifact and prompt match but runId differs", async () => {
    const archivePath = path.join(dir, "prior.jsonl");
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* writeManifestHeader(archivePath, openManifest({ artifact: "a", runId: "r-A" }));
        yield* appendResult(
          archivePath,
          sampleExistingResult({
            promptName: "p1",
            promptHash: "hash-p1",
            temperature: 0.7,
            runId: "r-A",
          }),
        );
      }).pipe(Effect.provide(platformLayer)),
    );

    const miss = await Effect.runPromise(
      lookupCache({
        archiveDir: dir,
        artifact: "a",
        runId: "r-B", // different run-id — should miss
        promptName: "p1",
        promptHash: "hash-p1",
        temperature: 0.7,
        fresh: false,
      }).pipe(Effect.provide(platformLayer)),
    );
    expect(Option.isNone(miss)).toBe(true);
  });
});

describe("isValidCachedResult", () => {
  it("rejects results with errors", () => {
    expect(isValidCachedResult(sampleExistingResult({ error: "boom", output: "content" }))).toBe(
      false,
    );
  });
  it("accepts a prompt with non-empty output and no error", () => {
    expect(isValidCachedResult(sampleExistingResult({ output: "hi", error: null }))).toBe(true);
  });
  it("rejects a prompt with empty output", () => {
    expect(isValidCachedResult(sampleExistingResult({ output: "", error: null }))).toBe(false);
  });
  it("accepts a scenario with a termination reason and no error", () => {
    expect(
      isValidCachedResult(
        sampleExistingResult({
          output: "",
          error: null,
          scenarioName: "s",
          scenarioHash: "h",
          terminationReason: "completed",
        }),
      ),
    ).toBe(true);
  });
});
