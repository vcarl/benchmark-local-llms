import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openManifest, sampleResult } from "../../archive/__tests__/fixtures.js";
import { makeTempDir, removeDir } from "../../archive/__tests__/test-utils.js";
import { appendResult, writeManifestHeader } from "../../archive/writer.js";
import { checkCompletion } from "../completion.js";

describe("checkCompletion", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir();
  });
  afterEach(async () => {
    await removeDir(dir);
  });

  it("returns complete=true when every planned cell has a valid result tagged with runId", async () => {
    const runId = "r-2026-04-25-aaaaaa";
    const r = sampleResult({
      runId,
      promptName: "p1",
      promptHash: "h1",
      temperature: 0.7,
      output: "ok",
    });
    const verdict = await Effect.runPromise(
      Effect.gen(function* () {
        yield* writeManifestHeader(
          `${dir}/a.jsonl`,
          openManifest({ artifact: "artifact-A", runId, archiveId: "archive-A" }),
        );
        yield* appendResult(`${dir}/a.jsonl`, r);
        return yield* checkCompletion({
          archiveDir: dir,
          runId,
          plannedCells: [
            {
              artifact: "artifact-A",
              promptName: "p1",
              promptHash: "h1",
              temperature: 0.7,
              kind: "prompt",
            },
          ],
        });
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(verdict.complete).toBe(true);
    expect(verdict.totalCells).toBe(1);
    expect(verdict.validCells).toBe(1);
  });

  it("returns complete=false when a planned cell has no result", async () => {
    const runId = "r-2026-04-25-bbbbbb";
    const verdict = await Effect.runPromise(
      Effect.gen(function* () {
        yield* writeManifestHeader(
          `${dir}/a.jsonl`,
          openManifest({ artifact: "artifact-A", runId, archiveId: "archive-A" }),
        );
        return yield* checkCompletion({
          archiveDir: dir,
          runId,
          plannedCells: [
            {
              artifact: "artifact-A",
              promptName: "p1",
              promptHash: "h1",
              temperature: 0.7,
              kind: "prompt",
            },
          ],
        });
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(verdict.complete).toBe(false);
    expect(verdict.totalCells).toBe(1);
    expect(verdict.validCells).toBe(0);
  });

  it("does not count results from other runIds as valid", async () => {
    const runId = "r-2026-04-25-aaaaaa";
    const r = sampleResult({
      runId: "r-other",
      promptName: "p1",
      promptHash: "h1",
      temperature: 0.7,
      output: "ok",
    });
    const verdict = await Effect.runPromise(
      Effect.gen(function* () {
        yield* writeManifestHeader(
          `${dir}/a.jsonl`,
          openManifest({ artifact: "artifact-A", runId: "r-other", archiveId: "archive-A" }),
        );
        yield* appendResult(`${dir}/a.jsonl`, r);
        return yield* checkCompletion({
          archiveDir: dir,
          runId,
          plannedCells: [
            {
              artifact: "artifact-A",
              promptName: "p1",
              promptHash: "h1",
              temperature: 0.7,
              kind: "prompt",
            },
          ],
        });
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(verdict.complete).toBe(false);
    expect(verdict.validCells).toBe(0);
  });

  it("does not count error or empty-output results as valid", async () => {
    const runId = "r-2026-04-25-aaaaaa";
    const errored = sampleResult({
      runId,
      promptName: "p1",
      promptHash: "h1",
      temperature: 0.7,
      error: "boom",
      output: "",
    });
    const verdict = await Effect.runPromise(
      Effect.gen(function* () {
        yield* writeManifestHeader(
          `${dir}/a.jsonl`,
          openManifest({ artifact: "artifact-A", runId, archiveId: "archive-A" }),
        );
        yield* appendResult(`${dir}/a.jsonl`, errored);
        return yield* checkCompletion({
          archiveDir: dir,
          runId,
          plannedCells: [
            {
              artifact: "artifact-A",
              promptName: "p1",
              promptHash: "h1",
              temperature: 0.7,
              kind: "prompt",
            },
          ],
        });
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(verdict.complete).toBe(false);
  });
});
