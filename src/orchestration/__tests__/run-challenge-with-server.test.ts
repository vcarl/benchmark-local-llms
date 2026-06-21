import { NodeContext } from "@effect/platform-node";
import { Effect, Schema } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ItemResult } from "../../schema/attempt.js";
import { runChallengeWithServer } from "../run-challenge.js";
import {
  config,
  env,
  fakeServerHandle,
  inertHttpClientLayer,
  makeChallenge,
  makeTempDir,
  okStub,
  readArchiveLines,
  removeDir,
} from "./fixtures.js";

let dir: string;
beforeEach(async () => {
  dir = await makeTempDir();
});
afterEach(async () => {
  await removeDir(dir);
});

it("runs every item against the provided server and finalizes the archive", async () => {
  const challenge = makeChallenge();
  const m = okStub();
  const manifest = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const server = yield* fakeServerHandle();
        return yield* runChallengeWithServer(
          {
            config,
            challenge,
            attemptId: "att-withserver",
            archiveDir: dir,
            archivePath: `${dir}/att-withserver.jsonl`,
            env,
            deps: { llmServer: () => Effect.die("must not boot") } as never,
          },
          server,
        );
      }),
    ).pipe(
      Effect.provide(m.layer),
      Effect.provide(inertHttpClientLayer),
      Effect.provide(NodeContext.layer),
    ),
  );

  expect(manifest.schemaVersion).toBe(2);
  expect(manifest.interrupted).toBe(false);
  expect(manifest.aggregate.score).toBeGreaterThanOrEqual(0);
});

// ── peakMemoryGb threading ─────────────────────────────────────────────────
//
// Conversion factor (from run-prompt.ts): peakRssKbToGb = kb / (1024 * 1024).
// 2_097_152 KB / (1024 * 1024) = 2.0 GB.
//
// Asserts that a server handle whose peakRssKb effect returns a known non-zero
// value flows through executeOrCacheItem into the resulting ItemResult.peakMemoryGb.

describe("runChallengeWithServer — peakMemoryGb threading", () => {
  it("records peakMemoryGb from the server handle — not zero", async () => {
    const PEAK_RSS_KB = 2_097_152; // 2 GiB in KB
    const EXPECTED_PEAK_GB = 2.0; // 2_097_152 / (1024 * 1024)

    const challenge = makeChallenge();
    const m = okStub();
    const archivePath = `${dir}/att-peak.jsonl`;

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const server = yield* fakeServerHandle();
          const serverWithPeak = { ...server, peakRssKb: Effect.succeed(PEAK_RSS_KB) };
          return yield* runChallengeWithServer(
            {
              config,
              challenge,
              attemptId: "att-peak",
              archiveDir: dir,
              archivePath,
              env,
              deps: { llmServer: () => Effect.die("must not boot") } as never,
            },
            serverWithPeak,
          );
        }),
      ).pipe(
        Effect.provide(m.layer),
        Effect.provide(inertHttpClientLayer),
        Effect.provide(NodeContext.layer),
      ),
    );

    const lines = await readArchiveLines(archivePath);
    // lines[0] = header, lines[1] = first item result
    const itemResult = Schema.decodeUnknownSync(ItemResult)(JSON.parse(lines[1] as string));
    expect(itemResult.peakMemoryGb).toBe(EXPECTED_PEAK_GB);
  });
});
