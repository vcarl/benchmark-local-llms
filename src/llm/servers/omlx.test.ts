import fsp from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { Effect, Layer } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { homeDirFor, OMLX_DEFAULT_PORT, omlxServer, serverDirFor, stagingDirFor } from "./omlx.js";
import { httpClientLayer, makeMockExecutor, type TestHttpServer } from "./test-mocks.js";

/**
 * HTTP double that answers `/v1/models` (health) with 200 and records every
 * `POST /v1/chat/completions` body so the warmup assertion can inspect what
 * was sent and confirm ordering relative to the health probe.
 */
interface OmlxTestServer extends TestHttpServer {
  readonly warmups: () => ReadonlyArray<Record<string, unknown>>;
  readonly hitPaths: () => ReadonlyArray<string>;
  readonly failWarmup: (on: boolean) => void;
}

const startOmlxServer = (): Promise<OmlxTestServer> =>
  new Promise((resolve) => {
    let hits = 0;
    let warmupShouldFail = false;
    const warmups: Array<Record<string, unknown>> = [];
    const hitPaths: string[] = [];
    const server: Server = createServer((req, res) => {
      hits += 1;
      hitPaths.push(`${req.method} ${req.url}`);
      if (req.method === "POST" && req.url === "/v1/chat/completions") {
        const chunks: Array<Buffer> = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => {
          // The body is always the warmup JSON this module builds, so parse
          // it directly — a malformed body should fail the test loudly.
          warmups.push(JSON.parse(Buffer.concat(chunks).toString("utf-8")));
          if (warmupShouldFail) {
            res.statusCode = 500;
            res.end("boom");
            return;
          }
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ choices: [{ message: { content: "ok" } }] }));
        });
        return;
      }
      res.statusCode = 200;
      res.end("ok");
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        port,
        close: () =>
          new Promise<void>((r) => {
            server.close(() => r());
          }),
        hits: () => hits,
        warmups: () => warmups,
        hitPaths: () => hitPaths,
        failWarmup: (on: boolean) => {
          warmupShouldFail = on;
        },
      });
    });
  });

/**
 * Build a fake HF hub cache containing one usable snapshot for `artifact`,
 * so `resolveMlxModel` resolves without touching the real cache.
 */
const makeFakeCache = async (artifact: string): Promise<string> => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "bench-omlx-cache-"));
  const snapshot = path.join(
    root,
    `models--${artifact.replace(/\//g, "--")}`,
    "snapshots",
    "deadbeef",
  );
  await fsp.mkdir(snapshot, { recursive: true });
  await fsp.writeFile(path.join(snapshot, "config.json"), "{}");
  await fsp.writeFile(path.join(snapshot, "model.safetensors"), "weights");
  // A non-empty chat template so the offline verification gate passes.
  await fsp.writeFile(path.join(snapshot, "chat_template.jinja"), "{{ messages }}");
  return root;
};

const ARTIFACT = "mlx-community/Qwen3-32B-4bit";
const LEAF = "Qwen3-32B-4bit";

describe("omlxServer", () => {
  let ts: OmlxTestServer | null = null;
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    if (ts) {
      await ts.close();
      ts = null;
    }
    for (const c of cleanups.splice(0)) await c();
  });

  const withCache = async (): Promise<string> => {
    const root = await makeFakeCache(ARTIFACT);
    cleanups.push(() => fsp.rm(root, { recursive: true, force: true }));
    return root;
  };

  it("defaults to port 18082", () => {
    expect(OMLX_DEFAULT_PORT).toBe(18082);
  });

  it("spawns `omlx serve` against the staging dir with host/port flags", async () => {
    ts = await startOmlxServer();
    const cacheRoot = await withCache();
    const mock = makeMockExecutor({ behaviour: "alive" });
    cleanups.push(() => fsp.rm(serverDirFor(ts?.port ?? 0), { recursive: true, force: true }));

    await Effect.runPromise(
      Effect.scoped(
        omlxServer({ artifact: ARTIFACT, port: ts.port, healthTimeoutSec: 2, cacheRoot }),
      ).pipe(Effect.provide(Layer.mergeAll(mock.layer, httpClientLayer))),
    );

    const run = mock.runs[0];
    expect(run).toBeDefined();
    if (!run) throw new Error("no run recorded");
    expect(run.log.command).toBe("omlx");
    expect(run.log.args).toEqual([
      "serve",
      "--model-dir",
      stagingDirFor(ts.port),
      "--host",
      "127.0.0.1",
      "--port",
      String(ts.port),
    ]);
  });

  it("honours binPath and appends extraArgs after the built-in flags", async () => {
    ts = await startOmlxServer();
    const cacheRoot = await withCache();
    const mock = makeMockExecutor({ behaviour: "alive" });
    cleanups.push(() => fsp.rm(serverDirFor(ts?.port ?? 0), { recursive: true, force: true }));

    await Effect.runPromise(
      Effect.scoped(
        omlxServer({
          artifact: ARTIFACT,
          port: ts.port,
          healthTimeoutSec: 2,
          cacheRoot,
          binPath: "/opt/homebrew/bin/omlx",
          extraArgs: ["--memory-guard", "0.9"],
        }),
      ).pipe(Effect.provide(Layer.mergeAll(mock.layer, httpClientLayer))),
    );

    const run = mock.runs[0];
    expect(run).toBeDefined();
    if (!run) throw new Error("no run recorded");
    expect(run.log.command).toBe("/opt/homebrew/bin/omlx");
    expect(run.log.args.slice(-2)).toEqual(["--memory-guard", "0.9"]);
  });

  it("stages exactly one leaf-named symlink pointing at the resolved snapshot", async () => {
    ts = await startOmlxServer();
    const cacheRoot = await withCache();
    const mock = makeMockExecutor({ behaviour: "alive" });
    const staging = stagingDirFor(ts.port);
    const root = serverDirFor(ts.port);
    cleanups.push(() => fsp.rm(root, { recursive: true, force: true }));

    // A stale entry at the exact staging path must be replaced, not merged.
    await fsp.mkdir(staging, { recursive: true });
    await fsp.writeFile(path.join(staging, "Stale-Model"), "junk");

    await Effect.runPromise(
      Effect.scoped(
        omlxServer({ artifact: ARTIFACT, port: ts.port, healthTimeoutSec: 2, cacheRoot }),
      ).pipe(Effect.provide(Layer.mergeAll(mock.layer, httpClientLayer))),
    );

    const entries = await fsp.readdir(staging);
    expect(entries).toEqual([LEAF]);
    const target = await fsp.readlink(path.join(staging, LEAF));
    expect(target).toBe(
      path.join(cacheRoot, `models--${ARTIFACT.replace(/\//g, "--")}`, "snapshots", "deadbeef"),
    );
  });

  it("points HOME at a per-port scratch dir so the operator's ~/.omlx is untouched", async () => {
    // oMLX reads AND writes $HOME/.omlx/settings.json. Inheriting the real one
    // means the child picks up the operator's `auth.api_key` (every request
    // 401s) and `huggingface.hf_cache_enabled` (the whole HF cache is served
    // alongside the staged model), and `omlx serve` writes our flags back over
    // their `model_dir`/`port`. The scratch HOME severs both directions.
    ts = await startOmlxServer();
    const cacheRoot = await withCache();
    const mock = makeMockExecutor({ behaviour: "alive" });
    cleanups.push(() => fsp.rm(serverDirFor(ts?.port ?? 0), { recursive: true, force: true }));

    await Effect.runPromise(
      Effect.scoped(
        omlxServer({ artifact: ARTIFACT, port: ts.port, healthTimeoutSec: 2, cacheRoot }),
      ).pipe(Effect.provide(Layer.mergeAll(mock.layer, httpClientLayer))),
    );

    const run = mock.runs[0];
    if (!run) throw new Error("no run recorded");
    expect(run.log.env["HOME"]).toBe(homeDirFor(ts.port));
    expect(run.log.env["HOME"]).not.toBe(os.homedir());
    // The directory must exist before spawn — oMLX writes settings on boot.
    const stat = await fsp.stat(homeDirFor(ts.port));
    expect(stat.isDirectory()).toBe(true);
    // And it must sit outside the directory oMLX scans for models, or the
    // settings file would register as a discovery candidate.
    expect(homeDirFor(ts.port).startsWith(stagingDirFor(ts.port))).toBe(false);
  });

  it("issues a max_tokens=1 warmup for the leaf model id after health passes", async () => {
    ts = await startOmlxServer();
    const cacheRoot = await withCache();
    const mock = makeMockExecutor({ behaviour: "alive" });
    cleanups.push(() => fsp.rm(serverDirFor(ts?.port ?? 0), { recursive: true, force: true }));

    await Effect.runPromise(
      Effect.scoped(
        omlxServer({ artifact: ARTIFACT, port: ts.port, healthTimeoutSec: 2, cacheRoot }),
      ).pipe(Effect.provide(Layer.mergeAll(mock.layer, httpClientLayer))),
    );

    const warmups = ts.warmups();
    expect(warmups).toHaveLength(1);
    expect(warmups[0]?.["model"]).toBe(LEAF);
    expect(warmups[0]?.["max_tokens"]).toBe(1);

    // Ordering: the health probe (GET /v1/models) precedes the warmup POST.
    const paths = ts.hitPaths();
    const healthIdx = paths.indexOf("GET /v1/models");
    const warmIdx = paths.indexOf("POST /v1/chat/completions");
    expect(healthIdx).toBeGreaterThanOrEqual(0);
    expect(warmIdx).toBeGreaterThan(healthIdx);
  });

  it("fails acquisition with ServerSpawnError when the warmup request fails", async () => {
    ts = await startOmlxServer();
    ts.failWarmup(true);
    const cacheRoot = await withCache();
    const mock = makeMockExecutor({ behaviour: "alive" });
    cleanups.push(() => fsp.rm(serverDirFor(ts?.port ?? 0), { recursive: true, force: true }));

    const outcome = await Effect.runPromise(
      Effect.scoped(
        omlxServer({ artifact: ARTIFACT, port: ts.port, healthTimeoutSec: 2, cacheRoot }),
      ).pipe(Effect.provide(Layer.mergeAll(mock.layer, httpClientLayer)), Effect.either),
    );

    expect(outcome._tag).toBe("Left");
    if (outcome._tag !== "Left") throw new Error("expected failure");
    expect(outcome.left._tag).toBe("ServerSpawnError");
    expect(JSON.stringify(outcome.left)).toContain("omlx");
  });

  it("fails with ServerSpawnError tagged omlx when the artifact is not cached", async () => {
    const cacheRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "bench-omlx-empty-"));
    cleanups.push(() => fsp.rm(cacheRoot, { recursive: true, force: true }));
    const mock = makeMockExecutor({ behaviour: "alive" });

    const outcome = await Effect.runPromise(
      Effect.scoped(omlxServer({ artifact: ARTIFACT, port: 65123, cacheRoot })).pipe(
        Effect.provide(Layer.mergeAll(mock.layer, httpClientLayer)),
        Effect.either,
      ),
    );

    expect(outcome._tag).toBe("Left");
    if (outcome._tag !== "Left") throw new Error("expected failure");
    expect(outcome.left._tag).toBe("ServerSpawnError");
    expect((outcome.left as { readonly runtime?: string }).runtime).toBe("omlx");
    expect(mock.runs).toHaveLength(0);
  });
});
