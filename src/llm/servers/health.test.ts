import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { FetchHttpClient } from "@effect/platform";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { waitForHealthy } from "./health.js";

interface TestServer {
  server: Server;
  port: number;
  close: () => Promise<void>;
}

const startServer = (
  handler: (req: unknown, res: { statusCode: number; end: (body?: string) => void }) => void,
): Promise<TestServer> =>
  new Promise((resolve) => {
    const server = createServer((req, res) => handler(req, res));
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        server,
        port,
        close: () =>
          new Promise<void>((r) => {
            server.close(() => r());
          }),
      });
    });
  });

describe("waitForHealthy", () => {
  let ts: TestServer | null = null;

  afterEach(async () => {
    if (ts) {
      await ts.close();
      ts = null;
    }
  });

  it("resolves when the endpoint returns 200 on the first poll", async () => {
    ts = await startServer((_req, res) => {
      res.statusCode = 200;
      res.end("ok");
    });

    const port = ts.port;
    await Effect.runPromise(
      waitForHealthy({
        url: `http://127.0.0.1:${port}/health`,
        timeoutSec: 2,
        pollIntervalMs: 50,
      }).pipe(Effect.provide(FetchHttpClient.layer)),
    );
    // If the effect completed, we pass.
    expect(true).toBe(true);
  });

  it("eventually succeeds after initial 503 responses", async () => {
    let hits = 0;
    ts = await startServer((_req, res) => {
      hits += 1;
      if (hits < 3) {
        res.statusCode = 503;
        res.end("starting");
        return;
      }
      res.statusCode = 200;
      res.end("ok");
    });

    const port = ts.port;
    await Effect.runPromise(
      waitForHealthy({
        url: `http://127.0.0.1:${port}/health`,
        timeoutSec: 2,
        pollIntervalMs: 25,
      }).pipe(Effect.provide(FetchHttpClient.layer)),
    );
    expect(hits).toBeGreaterThanOrEqual(3);
  });

  it("fails with HealthCheckTimeout when the endpoint never responds healthy", async () => {
    ts = await startServer((_req, res) => {
      res.statusCode = 503;
      res.end("still warming");
    });

    const port = ts.port;
    const exit = await Effect.runPromiseExit(
      waitForHealthy({
        url: `http://127.0.0.1:${port}/health`,
        timeoutSec: 1,
        pollIntervalMs: 25,
      }).pipe(Effect.provide(FetchHttpClient.layer)),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(JSON.stringify(exit.cause)).toContain("HealthCheckTimeout");
    }
  });

  it("fails with HealthCheckTimeout when the host is unreachable", async () => {
    // Pick a port that's almost certainly not bound (ephemeral reserved).
    const exit = await Effect.runPromiseExit(
      waitForHealthy({
        url: "http://127.0.0.1:1/health",
        timeoutSec: 1,
        pollIntervalMs: 25,
      }).pipe(Effect.provide(FetchHttpClient.layer)),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(JSON.stringify(exit.cause)).toContain("HealthCheckTimeout");
    }
  });
});
