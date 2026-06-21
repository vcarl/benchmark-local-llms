import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, expect, it } from "vitest";
import { runChallengeWithServer } from "../run-challenge.js";
import {
  config,
  env,
  fakeServerHandle,
  inertHttpClientLayer,
  makeChallenge,
  makeTempDir,
  okStub,
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
