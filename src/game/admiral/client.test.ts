import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { Effect, Exit } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { httpClientLayer } from "../../llm/servers/test-mocks.js";
import { makeAdmiralClient } from "./client.js";

interface RecordingServer {
  readonly port: number;
  readonly close: () => Promise<void>;
  readonly requests: Array<{ method: string; path: string; body: string }>;
}

const startServer = (
  handler: (req: IncomingMessage, res: ServerResponse, body: string) => void,
): Promise<RecordingServer> =>
  new Promise((resolve) => {
    const requests: RecordingServer["requests"] = [];
    const server: Server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => {
        body += c;
      });
      req.on("end", () => {
        requests.push({ method: req.method ?? "", path: req.url ?? "", body });
        handler(req, res, body);
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        port,
        requests,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });

describe("makeAdmiralClient", () => {
  let s: RecordingServer | null = null;

  afterEach(async () => {
    if (s) {
      await s.close();
      s = null;
    }
  });

  it("configureProvider sends PUT /api/providers with the expected body", async () => {
    s = await startServer((_req, res) => {
      res.statusCode = 200;
      res.end("{}");
    });
    await Effect.runPromise(
      Effect.gen(function* () {
        const c = yield* makeAdmiralClient({
          baseUrl: `http://127.0.0.1:${s?.port}`,
        });
        yield* c.configureProvider({
          id: "custom",
          baseUrl: "http://llm",
          apiKey: "local",
        });
      }).pipe(Effect.provide(httpClientLayer)),
    );
    const req = s.requests[0];
    expect(req?.method).toBe("PUT");
    expect(req?.path).toBe("/api/providers");
    expect(JSON.parse(req?.body ?? "{}")).toEqual({
      id: "custom",
      base_url: "http://llm",
      api_key: "local",
    });
  });

  it("createProfile POSTs and returns the profile id from the response", async () => {
    s = await startServer((_req, res) => {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ id: "p-42" }));
    });
    const id = await Effect.runPromise(
      Effect.gen(function* () {
        const c = yield* makeAdmiralClient({
          baseUrl: `http://127.0.0.1:${s?.port}`,
        });
        return yield* c.createProfile({
          provider: "custom",
          name: "bench",
          username: "u",
          password: "p",
          model: "qwen3",
          serverUrl: "http://gs",
          directive: "do thing",
          connectionMode: "http_v2",
        });
      }).pipe(Effect.provide(httpClientLayer)),
    );
    expect(id).toBe("p-42");
    const req = s.requests[0];
    expect(req?.method).toBe("POST");
    expect(req?.path).toBe("/api/profiles");
    const parsed = JSON.parse(req?.body ?? "{}");
    // Bare model id — Admiral pairs it with `provider` internally when
    // building the upstream OpenAI-compat request. Sending `${provider}/${model}`
    // here led to a double-prefix that mlx_lm.server rejected with 404.
    expect(parsed.model).toBe("qwen3");
    expect(parsed.provider).toBe("custom");
    expect(parsed.connection_mode).toBe("http_v2");
  });

  it("non-2xx surfaces as AdmiralApiError with the body included", async () => {
    s = await startServer((_req, res) => {
      res.statusCode = 422;
      res.end("invalid");
    });
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const c = yield* makeAdmiralClient({
          baseUrl: `http://127.0.0.1:${s?.port}`,
        });
        yield* c.connectProfile("p-1");
      }).pipe(Effect.provide(httpClientLayer)),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    const json = JSON.stringify(exit);
    expect(json).toContain("AdmiralApiError");
    expect(json).toContain("422");
    expect(json).toContain("invalid");
  });

  it("disconnectProfile and deleteProfile hit the expected endpoints", async () => {
    s = await startServer((_req, res) => {
      res.statusCode = 200;
      res.end("{}");
    });
    await Effect.runPromise(
      Effect.gen(function* () {
        const c = yield* makeAdmiralClient({
          baseUrl: `http://127.0.0.1:${s?.port}`,
        });
        yield* c.disconnectProfile("p-9");
        yield* c.deleteProfile("p-9");
      }).pipe(Effect.provide(httpClientLayer)),
    );
    expect(s.requests[0]?.method).toBe("POST");
    expect(s.requests[0]?.path).toBe("/api/profiles/p-9/connect");
    expect(JSON.parse(s.requests[0]?.body ?? "{}")).toEqual({ action: "disconnect" });
    expect(s.requests[1]?.method).toBe("DELETE");
    expect(s.requests[1]?.path).toBe("/api/profiles/p-9");
  });
});
