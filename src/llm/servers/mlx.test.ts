import { Effect, Layer } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { mlxServer } from "./mlx.js";
import {
  httpClientLayer,
  makeMockExecutor,
  startHealthyServer,
  type TestHttpServer,
} from "./test-mocks.js";

describe("mlxServer", () => {
  let ts: TestHttpServer | null = null;

  afterEach(async () => {
    if (ts) {
      await ts.close();
      ts = null;
    }
  });

  it("spawns `python3 -m mlx_lm.server` with the prototype's host/port flags", async () => {
    ts = await startHealthyServer();
    const mock = makeMockExecutor({ behaviour: "alive" });

    await Effect.runPromise(
      Effect.scoped(
        mlxServer({
          artifactPath: "mlx-community/Meta-Llama-3.1-8B-Instruct-4bit",
          port: ts.port,
          healthTimeoutSec: 2,
        }),
      ).pipe(Effect.provide(Layer.mergeAll(mock.layer, httpClientLayer))),
    );

    const run = mock.runs[0];
    expect(run).toBeDefined();
    if (!run) return;
    expect(run.log.command).toBe("python3");
    expect(run.log.args).toEqual([
      "-m",
      "mlx_lm.server",
      "--model",
      "mlx-community/Meta-Llama-3.1-8B-Instruct-4bit",
      "--host",
      "127.0.0.1",
      "--port",
      String(ts.port),
    ]);
  });

  it("respects a custom pythonBin override", async () => {
    ts = await startHealthyServer();
    const mock = makeMockExecutor({ behaviour: "alive" });

    await Effect.runPromise(
      Effect.scoped(
        mlxServer({
          artifactPath: "mlx-community/foo",
          port: ts.port,
          pythonBin: "/usr/local/bin/python3.12",
          healthTimeoutSec: 2,
        }),
      ).pipe(Effect.provide(Layer.mergeAll(mock.layer, httpClientLayer))),
    );

    const run = mock.runs[0];
    expect(run).toBeDefined();
    if (!run) return;
    expect(run.log.command).toBe("/usr/local/bin/python3.12");
  });
});
