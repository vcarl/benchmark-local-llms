import { Effect, Layer } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { llamacppServer } from "./llamacpp.js";
import {
  httpClientLayer,
  makeMockExecutor,
  startHealthyServer,
  type TestHttpServer,
} from "./test-mocks.js";

describe("llamacppServer", () => {
  let ts: TestHttpServer | null = null;

  afterEach(async () => {
    if (ts) {
      await ts.close();
      ts = null;
    }
  });

  it("spawns llama-server with the mandatory prototype flags", async () => {
    ts = await startHealthyServer();
    const mock = makeMockExecutor({ behaviour: "alive" });

    await Effect.runPromise(
      Effect.scoped(
        llamacppServer({
          artifactPath: "/tmp/fake.gguf",
          port: ts.port,
          healthTimeoutSec: 2,
        }),
      ).pipe(Effect.provide(Layer.mergeAll(mock.layer, httpClientLayer))),
    );

    const run = mock.runs[0];
    expect(run).toBeDefined();
    if (!run) return;
    expect(run.log.command).toBe("llama-server");
    expect(run.log.args).toEqual([
      "-m",
      "/tmp/fake.gguf",
      "--host",
      "127.0.0.1",
      "--port",
      String(ts.port),
      "--cache-type-k",
      "q8_0",
      "--cache-type-v",
      "q8_0",
      "--reasoning-format",
      "auto",
    ]);
  });

  it("appends -c <ctxSize> when ctxSize is configured", async () => {
    ts = await startHealthyServer();
    const mock = makeMockExecutor({ behaviour: "alive" });

    await Effect.runPromise(
      Effect.scoped(
        llamacppServer({
          artifactPath: "/tmp/fake.gguf",
          port: ts.port,
          ctxSize: 8192,
          healthTimeoutSec: 2,
        }),
      ).pipe(Effect.provide(Layer.mergeAll(mock.layer, httpClientLayer))),
    );

    const run = mock.runs[0];
    expect(run).toBeDefined();
    if (!run) return;
    expect(run.log.args.slice(-2)).toEqual(["-c", "8192"]);
  });

  it("appends --jinja and --chat-template-file when chatTemplatePath is set", async () => {
    ts = await startHealthyServer();
    const mock = makeMockExecutor({ behaviour: "alive" });

    await Effect.runPromise(
      Effect.scoped(
        llamacppServer({
          artifactPath: "/tmp/fake.gguf",
          port: ts.port,
          chatTemplatePath: "/repo/templates/mistral-v7-tekken.jinja",
          healthTimeoutSec: 2,
        }),
      ).pipe(Effect.provide(Layer.mergeAll(mock.layer, httpClientLayer))),
    );

    const run = mock.runs[0];
    expect(run).toBeDefined();
    if (!run) return;
    expect(run.log.args).toContain("--jinja");
    const idx = run.log.args.indexOf("--chat-template-file");
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(run.log.args[idx + 1]).toBe("/repo/templates/mistral-v7-tekken.jinja");
  });

  it("omits --jinja and --chat-template-file when chatTemplatePath is absent", async () => {
    ts = await startHealthyServer();
    const mock = makeMockExecutor({ behaviour: "alive" });

    await Effect.runPromise(
      Effect.scoped(
        llamacppServer({
          artifactPath: "/tmp/fake.gguf",
          port: ts.port,
          healthTimeoutSec: 2,
        }),
      ).pipe(Effect.provide(Layer.mergeAll(mock.layer, httpClientLayer))),
    );

    const run = mock.runs[0];
    expect(run).toBeDefined();
    if (!run) return;
    expect(run.log.args).not.toContain("--jinja");
    expect(run.log.args).not.toContain("--chat-template-file");
  });

  it("respects a custom binPath override", async () => {
    ts = await startHealthyServer();
    const mock = makeMockExecutor({ behaviour: "alive" });

    await Effect.runPromise(
      Effect.scoped(
        llamacppServer({
          artifactPath: "/tmp/fake.gguf",
          port: ts.port,
          binPath: "/opt/homebrew/bin/llama-server",
          healthTimeoutSec: 2,
        }),
      ).pipe(Effect.provide(Layer.mergeAll(mock.layer, httpClientLayer))),
    );

    const run = mock.runs[0];
    expect(run).toBeDefined();
    if (!run) return;
    expect(run.log.command).toBe("/opt/homebrew/bin/llama-server");
  });
});
