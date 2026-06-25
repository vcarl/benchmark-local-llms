import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Effect, Layer } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { llamacppServer } from "./llamacpp.js";
import {
  httpClientLayer,
  makeMockExecutor,
  startHealthyTemplateServer,
  type TestHttpServer,
} from "./test-mocks.js";

// `startHealthyServer` answers 200 "ok" on every path; once the supervisor
// runs the template gate, llamacpp boots need a server that also answers the
// /props + /apply-template routes. `startHealthyTemplateServer` does both.
const startHealthyServer = startHealthyTemplateServer;

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
      "--jinja",
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
    // --jinja must precede --chat-template-file so llama.cpp treats the file as
    // arbitrary Jinja, and must appear exactly once (no duplicate from base + cond).
    const jinjaIdx = run.log.args.indexOf("--jinja");
    expect(jinjaIdx).toBeGreaterThanOrEqual(0);
    expect(jinjaIdx).toBeLessThan(idx);
    expect(run.log.args.filter((a) => a === "--jinja")).toHaveLength(1);
  });

  it("always passes --jinja even when chatTemplatePath is absent", async () => {
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
    expect(run.log.args).toContain("--jinja");
    expect(run.log.args.filter((a) => a === "--jinja")).toHaveLength(1);
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

  it("aborts boot with TemplateVerificationError when /props reports an empty chat_template", async () => {
    // Stand up a server that is healthy (/v1/models → 200) but reports an
    // empty chat_template — the ChatML-fallback symptom the gate must catch.
    let server: Server | null = null;
    const port = await new Promise<number>((resolve) => {
      server = createServer((req, res) => {
        if (req.method === "GET" && req.url === "/props") {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ chat_template: "" }));
          return;
        }
        res.statusCode = 200;
        res.end("ok");
      });
      server.listen(0, "127.0.0.1", () => {
        resolve((server?.address() as AddressInfo).port);
      });
    });

    const mock = makeMockExecutor({ behaviour: "alive" });
    const exit = await Effect.runPromiseExit(
      Effect.scoped(
        llamacppServer({
          artifactPath: "/tmp/fake.gguf",
          port,
          healthTimeoutSec: 2,
        }),
      ).pipe(Effect.provide(Layer.mergeAll(mock.layer, httpClientLayer))),
    );

    await new Promise<void>((r) => (server as unknown as Server).close(() => r()));

    expect(exit._tag).toBe("Failure");
    expect(JSON.stringify(exit)).toContain("TemplateVerificationError");
    // The subprocess must still have been torn down (scope-close finalizer).
    const run = mock.runs[0];
    expect(run).toBeDefined();
    if (run) expect(run.log.signalsReceived).toContain("SIGTERM");
  });
});
