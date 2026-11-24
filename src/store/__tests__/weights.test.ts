import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { digestOf, sha256Hex } from "../digest.js";
import { ggufShards, weightsDigest } from "../weights.js";
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
