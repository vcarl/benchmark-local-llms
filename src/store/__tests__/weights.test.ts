import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { HttpClient, HttpClientError, HttpClientResponse } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { digestOf, sha256Hex } from "../digest.js";
import {
  ggufShards,
  hfRevisionOf,
  revisionPublishedAt,
  weightsDigest,
  weightsSource,
} from "../weights.js";
import { makeStoreDir } from "./fixtures.js";

const run = <A, E>(eff: Effect.Effect<A, E, NodeContext.NodeContext>) =>
  Effect.runPromise(eff.pipe(Effect.provide(NodeContext.layer)));

let store: string;
let model: string;
beforeEach(async () => {
  store = await makeStoreDir();
  model = path.join(store, "model");
  await fsp.mkdir(model);
  await fsp.writeFile(path.join(model, "config.json"), "{}");
  await fsp.writeFile(path.join(model, "model-00002.safetensors"), "bbb");
  await fsp.writeFile(path.join(model, "model-00001.safetensors"), "aaa");
});
afterEach(async () => {
  await fsp.rm(store, { recursive: true, force: true });
});

describe("weightsDigest", () => {
  it("is the digest of the sorted [shard, sha256] pairs of an MLX model's safetensors", async () => {
    const d = await run(weightsDigest(store, { artifact: model, runtime: "mlx" }));
    expect(d).toBe(
      digestOf([
        ["model-00001.safetensors", sha256Hex("aaa")],
        ["model-00002.safetensors", sha256Hex("bbb")],
      ]),
    );
    expect(await run(weightsDigest(store, { artifact: model, runtime: "omlx" }))).toBe(d);
  });

  it("hashes each file once, cached by path + size + mtime in store/weights.json", async () => {
    const first = await run(weightsDigest(store, { artifact: model, runtime: "mlx" }));
    const cache = JSON.parse(await fsp.readFile(path.join(store, "weights.json"), "utf8"));
    expect(Object.keys(cache)).toHaveLength(2);

    // Same size and mtime: served from the cache, so the edit goes unseen.
    const shard = path.join(model, "model-00001.safetensors");
    const { mtime } = await fsp.stat(shard);
    await fsp.writeFile(shard, "zzz");
    await fsp.utimes(shard, mtime, mtime);
    expect(await run(weightsDigest(store, { artifact: model, runtime: "mlx" }))).toBe(first);

    // A size change re-hashes.
    await fsp.writeFile(shard, "zzzz");
    expect(await run(weightsDigest(store, { artifact: model, runtime: "mlx" }))).not.toBe(first);
  });

  it("is null when the weights cannot be located", async () => {
    const missing = path.join(store, "nope");
    expect(await run(weightsDigest(store, { artifact: missing, runtime: "mlx" }))).toBeNull();
    expect(
      await run(weightsDigest(store, { artifact: "org/absent", runtime: "llamacpp", quant: "Q4" })),
    ).toBeNull();
  });
});

describe("ggufShards", () => {
  it("is the file itself, or every shard of a split GGUF", () => {
    expect(ggufShards("/m/x-Q4_K_M.gguf", ["x-Q4_K_M.gguf", "y.gguf"])).toEqual([
      "/m/x-Q4_K_M.gguf",
    ]);
    expect(
      ggufShards("/m/x-Q8_0-00001-of-00002.gguf", [
        "x-Q8_0-00002-of-00002.gguf",
        "x-Q8_0-00001-of-00002.gguf",
        "x-Q4-00001-of-00002.gguf",
      ]),
    ).toEqual(["/m/x-Q8_0-00001-of-00002.gguf", "/m/x-Q8_0-00002-of-00002.gguf"]);
  });
});

describe("weightsSource", () => {
  const sha = "0bdc580634ceac4c4d921f452777bf44228de9af";
  const hub = (respond: (url: string) => Effect.Effect<Response, Error>) => {
    const urls: string[] = [];
    const layer = Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((req) =>
        Effect.suspend(() => {
          urls.push(req.url);
          return respond(req.url);
        }).pipe(
          Effect.map((r) => HttpClientResponse.fromWeb(req, r)),
          Effect.mapError(
            (cause) =>
              new HttpClientError.RequestError({ request: req, reason: "Transport", cause }),
          ),
        ),
      ),
    );
    return { urls, layer };
  };
  const json = (body: unknown, status = 200) =>
    Effect.succeed(new Response(JSON.stringify(body), { status }));

  it("names the hub repo and revision of a cached file", () => {
    expect(
      hfRevisionOf(`/h/hub/models--ggml-org--Inkling-2-Mini-GGUF/snapshots/${sha}/q/m.gguf`),
    ).toEqual({
      repo: "ggml-org/Inkling-2-Mini-GGUF",
      revision: sha,
    });
    expect(hfRevisionOf("/models/local/m.gguf")).toBeNull();
  });

  it("is the revision's lastModified, asking only for the repo and revision", async () => {
    const h = hub(() =>
      json({
        sha,
        lastModified: "2026-11-25T17:59:57.000Z",
        createdAt: "2026-11-20T13:33:35.000Z",
      }),
    );
    const at = await Effect.runPromise(
      revisionPublishedAt("o/m", sha).pipe(Effect.provide(h.layer)),
    );
    expect(at).toBe("2026-11-25T17:59:57.000Z");
    expect(h.urls).toEqual([`https://huggingface.co/api/models/o/m/revision/${sha}`]);
  });

  it("is null on a transport error, a non-2xx, a bad body or another sha", async () => {
    for (const respond of [
      () => Effect.fail(new Error("offline")),
      () => json({ error: "not found" }, 404),
      () => json({ nope: 1 }),
      () => json({ sha: "f".repeat(40), lastModified: "2026-11-25T17:59:57.000Z" }),
    ])
      expect(
        await Effect.runPromise(
          revisionPublishedAt("o/m", sha).pipe(Effect.provide(hub(respond).layer)),
        ),
      ).toBeNull();
  });

  it("is null for weights outside the hub cache, without a request", async () => {
    const h = hub(() => json({}));
    const src = await Effect.runPromise(
      weightsSource({ artifact: model, runtime: "mlx" }).pipe(Effect.provide(h.layer)),
    );
    expect(src).toBeNull();
    expect(h.urls).toEqual([]);
  });
});
