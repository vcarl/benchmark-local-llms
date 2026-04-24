import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { Effect, Exit } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { httpClientLayer } from "../../llm/servers/test-mocks.js";
import { makeGameAdminClient } from "./admin-client.js";

interface RecordingServer {
  readonly port: number;
  readonly close: () => Promise<void>;
  readonly requests: Array<{
    method: string;
    path: string;
    auth: string | undefined;
    body: string;
  }>;
}

const startServer = (
  handler: (req: IncomingMessage, res: ServerResponse, body: string) => void,
): Promise<RecordingServer> =>
  new Promise((resolve) => {
    const requests: RecordingServer["requests"] = [];
    const server: Server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        requests.push({
          method: req.method ?? "",
          path: req.url ?? "",
          auth: req.headers["authorization"] as string | undefined,
          body,
        });
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

describe("makeGameAdminClient", () => {
  let s: RecordingServer | null = null;

  afterEach(async () => {
    if (s) {
      await s.close();
      s = null;
    }
  });

  it("reset POSTs the fixture and parses the players array", async () => {
    s = await startServer((_req, res) => {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          players: [
            { username: "alice", password: "p1", player_id: "a-1" },
            { username: "bob", password: "p2", player_id: "b-1" },
          ],
        }),
      );
    });

    const players = await Effect.runPromise(
      Effect.gen(function* () {
        const c = yield* makeGameAdminClient({
          baseUrl: `http://127.0.0.1:${s?.port}`,
          adminToken: "tok",
        });
        return yield* c.reset("default");
      }).pipe(Effect.provide(httpClientLayer)),
    );

    expect(players.length).toBe(2);
    expect(players[0]?.username).toBe("alice");
    const req = s.requests[0];
    expect(req?.method).toBe("POST");
    expect(req?.path).toBe("/api/admin/benchmark/reset");
    expect(req?.auth).toBe("Bearer tok");
    expect(JSON.parse(req?.body ?? "{}")).toEqual({ fixture: "default" });
  });

  it("reset surfaces non-2xx as GameFixtureResetError", async () => {
    s = await startServer((_req, res) => {
      res.statusCode = 500;
      res.end("boom");
    });

    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const c = yield* makeGameAdminClient({
          baseUrl: `http://127.0.0.1:${s?.port}`,
          adminToken: "tok",
        });
        return yield* c.reset("default");
      }).pipe(Effect.provide(httpClientLayer)),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(JSON.stringify(exit)).toContain("GameFixtureResetError");
  });

  it("resolveCredential matches by username OR player_id, fails with mismatch otherwise", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const c = yield* makeGameAdminClient({
          baseUrl: "http://unused",
          adminToken: "tok",
        });
        const ok = yield* c.resolveCredential(
          [
            { username: "alice", password: "p1", player_id: "a-1" },
            { username: "bob", password: "p2", player_id: "b-1" },
          ],
          "b-1",
        );
        return ok;
      }).pipe(Effect.provide(httpClientLayer)),
    );
    expect(result.username).toBe("bob");

    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const c = yield* makeGameAdminClient({
          baseUrl: "http://unused",
          adminToken: "tok",
        });
        return yield* c.resolveCredential(
          [{ username: "alice", password: "p1", player_id: "a-1" }],
          "ghost",
        );
      }).pipe(Effect.provide(httpClientLayer)),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(JSON.stringify(exit)).toContain("GameCredentialMismatch");
  });

  it("getPlayerStats GETs with the player_id query param and parses the body", async () => {
    s = await startServer((_req, res) => {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ credits: 42, stats: { systems_explored: 3 } }));
    });

    const stats = await Effect.runPromise(
      Effect.gen(function* () {
        const c = yield* makeGameAdminClient({
          baseUrl: `http://127.0.0.1:${s?.port}`,
          adminToken: "tok",
        });
        return yield* c.getPlayerStats("alice");
      }).pipe(Effect.provide(httpClientLayer)),
    );

    expect(stats["credits"]).toBe(42);
    const req = s.requests[0];
    expect(req?.method).toBe("GET");
    expect(req?.path).toBe("/api/admin/benchmark/player-stats?player_id=alice");
  });
});
