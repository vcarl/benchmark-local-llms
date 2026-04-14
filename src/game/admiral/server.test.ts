/**
 * Admiral server lifecycle tests. Mirrors the C2 llamacpp test pattern:
 * spawn through a `MockExecutor`, verify the spawned command is shaped
 * correctly, and confirm the supervised handle exposes the base URL.
 */
import { Effect, Layer } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import {
  httpClientLayer,
  makeMockExecutor,
  startHealthyServer,
  type TestHttpServer,
} from "../../llm/servers/test-mocks.js";
import { admiralServer } from "./server.js";

describe("admiralServer", () => {
  let ts: TestHttpServer | null = null;

  afterEach(async () => {
    if (ts) {
      await ts.close();
      ts = null;
    }
  });

  it("spawns `bun run src/server/index.ts` in the configured admiralDir", async () => {
    ts = await startHealthyServer();
    const mock = makeMockExecutor({ behaviour: "alive" });

    const handle = await Effect.runPromise(
      Effect.scoped(
        admiralServer({
          admiralDir: "/tmp/fake-admiral",
          port: ts.port,
          healthTimeoutSec: 2,
        }),
      ).pipe(Effect.provide(Layer.mergeAll(mock.layer, httpClientLayer))),
    );

    const run = mock.runs[0];
    expect(run).toBeDefined();
    if (!run) return;
    expect(run.log.command).toBe("bun");
    expect(run.log.args).toEqual(["run", "src/server/index.ts"]);
    expect(handle.port).toBe(ts.port);
    expect(handle.baseUrl).toBe(`http://127.0.0.1:${ts.port}`);
  });

  it("respects a custom binPath override", async () => {
    ts = await startHealthyServer();
    const mock = makeMockExecutor({ behaviour: "alive" });

    await Effect.runPromise(
      Effect.scoped(
        admiralServer({
          admiralDir: "/tmp/fake-admiral",
          port: ts.port,
          binPath: "/opt/homebrew/bin/bun",
          healthTimeoutSec: 2,
        }),
      ).pipe(Effect.provide(Layer.mergeAll(mock.layer, httpClientLayer))),
    );

    const run = mock.runs[0];
    expect(run?.log.command).toBe("/opt/homebrew/bin/bun");
  });
});
