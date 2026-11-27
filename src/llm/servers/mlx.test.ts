import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
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

  it("appends extraArgs after the built-in flags", async () => {
    ts = await startHealthyServer();
    const mock = makeMockExecutor({ behaviour: "alive" });

    await Effect.runPromise(
      Effect.scoped(
        mlxServer({
          artifactPath: "mlx-community/Hunyuan-A13B-Instruct-4bit",
          port: ts.port,
          healthTimeoutSec: 2,
          extraArgs: ["--trust-remote-code"],
        }),
      ).pipe(Effect.provide(Layer.mergeAll(mock.layer, httpClientLayer))),
    );

    const run = mock.runs[0];
    expect(run).toBeDefined();
    if (!run) return;
    expect(run.log.args).toEqual([
      "-m",
      "mlx_lm.server",
      "--model",
      "mlx-community/Hunyuan-A13B-Instruct-4bit",
      "--host",
      "127.0.0.1",
      "--port",
      String(ts.port),
      "--trust-remote-code",
    ]);
  });

  it("fails boot with ModelLoadError as soon as the generation thread dies on load", async () => {
    // mlx_lm.server answers /v1/models while its generation thread is dead, and
    // every completion then hangs. Only the thread's traceback says so.
    const server = createServer((req, res) => {
      if (req.method === "POST") return; // never answers, like the real hang
      res.end("ok");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;
    ts = {
      port,
      hits: () => 0,
      close: () =>
        new Promise<void>((r) => {
          server.closeAllConnections();
          server.close(() => r());
        }),
    };
    const mock = makeMockExecutor({
      behaviour: "alive",
      stderrLines: [
        "Exception in thread Thread-1 (_generate):",
        "Traceback (most recent call last):",
        "ValueError: Received 126 parameters not in model:",
      ],
    });

    const started = Date.now();
    const outcome = await Effect.runPromise(
      Effect.scoped(mlxServer({ artifactPath: "/snap", port, healthTimeoutSec: 30 })).pipe(
        Effect.provide(Layer.mergeAll(mock.layer, httpClientLayer)),
        Effect.either,
      ),
    );

    expect(Date.now() - started).toBeLessThan(10_000);
    expect(outcome._tag).toBe("Left");
    if (outcome._tag !== "Left") return;
    expect(outcome.left._tag).toBe("ModelLoadError");
    expect(String((outcome.left as { logTail?: string }).logTail)).toContain(
      "Received 126 parameters not in model",
    );
  });
});
