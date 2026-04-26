import type { FileSystem, Path } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, Option } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openManifest, sampleResult } from "../../archive/__tests__/fixtures.js";
import { makeTempDir, removeDir } from "../../archive/__tests__/test-utils.js";
import { appendResult, writeManifestHeader } from "../../archive/writer.js";
import { checkCompletion, type PlannedCell } from "../../orchestration/completion.js";
import { clearRunState, loadRunState, saveRunState } from "../run-state.js";

const provideAll = <A, E>(
  eff: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
): Effect.Effect<A, E, never> => eff.pipe(Effect.provide(NodeContext.layer));

describe("resume integration", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir();
  });
  afterEach(async () => {
    await removeDir(dir);
  });

  it("partial run: state preserved, missing cell flagged", async () => {
    const runId = "r-2026-04-25-aaaaaa";
    const planned: PlannedCell[] = [
      {
        artifact: "art-A",
        promptName: "p1",
        promptHash: "h1",
        temperature: 0.7,
        kind: "prompt",
      },
      {
        artifact: "art-A",
        promptName: "p2",
        promptHash: "h2",
        temperature: 0.7,
        kind: "prompt",
      },
    ];
    const r1 = sampleResult({
      runId,
      promptName: "p1",
      promptHash: "h1",
      temperature: 0.7,
      output: "ok",
    });

    await Effect.runPromise(
      provideAll(
        Effect.gen(function* () {
          yield* writeManifestHeader(
            `${dir}/a.jsonl`,
            openManifest({ artifact: "art-A", runId, archiveId: "archive-A" }),
          );
          yield* appendResult(`${dir}/a.jsonl`, r1);
          yield* saveRunState(dir, { runId, createdAt: "2026-04-25T12:00:00.000Z" });
        }),
      ),
    );

    const verdict = await Effect.runPromise(
      provideAll(checkCompletion({ archiveDir: dir, runId, plannedCells: planned })),
    );
    expect(verdict.complete).toBe(false);
    expect(verdict.totalCells).toBe(2);
    expect(verdict.validCells).toBe(1);

    // Simulating "next invocation reads the state": loadRunState returns the same id.
    const loaded = await Effect.runPromise(provideAll(loadRunState(dir)));
    expect(Option.isSome(loaded)).toBe(true);
    if (Option.isSome(loaded)) expect(loaded.value.runId).toBe(runId);
  });

  it("completion: state cleared", async () => {
    const runId = "r-2026-04-25-bbbbbb";
    const planned: PlannedCell[] = [
      {
        artifact: "art-A",
        promptName: "p1",
        promptHash: "h1",
        temperature: 0.7,
        kind: "prompt",
      },
    ];
    const r1 = sampleResult({
      runId,
      promptName: "p1",
      promptHash: "h1",
      temperature: 0.7,
      output: "ok",
    });

    await Effect.runPromise(
      provideAll(
        Effect.gen(function* () {
          yield* writeManifestHeader(
            `${dir}/a.jsonl`,
            openManifest({ artifact: "art-A", runId, archiveId: "archive-A" }),
          );
          yield* appendResult(`${dir}/a.jsonl`, r1);
          yield* saveRunState(dir, { runId, createdAt: "2026-04-25T12:00:00.000Z" });
        }),
      ),
    );

    const verdict = await Effect.runPromise(
      provideAll(checkCompletion({ archiveDir: dir, runId, plannedCells: planned })),
    );
    expect(verdict.complete).toBe(true);

    // CLI handler would call clearRunState — simulate that:
    await Effect.runPromise(provideAll(clearRunState(dir)));
    const loaded = await Effect.runPromise(provideAll(loadRunState(dir)));
    expect(Option.isNone(loaded)).toBe(true);
  });
});
