import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect, Exit } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addBundles,
  type LegacyManifest,
  readManifest,
  type V4Manifest,
  writeManifest,
} from "./manifest.js";

const run = <A, E>(eff: Effect.Effect<A, E, NodeContext.NodeContext>) =>
  Effect.runPromiseExit(Effect.provide(eff, NodeContext.layer));

const d = (c: string) => c.repeat(64);

const V4: V4Manifest = {
  name: "2027.1",
  title: "Release 2027.1",
  release: "2027.1",
  evalVersion: "2027.1.0",
  ranked: true,
  bundles: [d("b"), d("a")],
};

const LEGACY: LegacyManifest = {
  name: "alpha",
  title: "Alpha challenge set",
  release: "0",
  evalVersion: "0.7",
  ranked: false,
  legacy: {
    hardware: { id: "hw1" },
    archives: {
      "benchmark-archive": {
        attempts: { "z.jsonl": d("1"), "a.jsonl": d("2") },
        blobs: { "system/abc.txt": d("3") },
      },
      "other-archive": { attempts: {}, blobs: {} },
    },
  },
};

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "manifest-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("dataset manifests", () => {
  it("round-trips a v4 manifest with its bundle comments", async () => {
    const p = join(dir, "m.yaml");
    await run(writeManifest(p, V4, { [d("b")]: "cfg-b · math" }));
    const text = await readFile(p, "utf8");
    expect(text).toContain(`- ${d("b")} # cfg-b · math\n`);
    expect(text).toContain('release: "2027.1"');
    const back = await run(readManifest(p));
    expect(back).toEqual(Exit.succeed({ manifest: V4, comments: { [d("b")]: "cfg-b · math" } }));
  });

  it("writes a legacy manifest with sorted attempt and blob keys, archives in given order", async () => {
    const p = join(dir, "alpha.yaml");
    await run(writeManifest(p, LEGACY));
    const text = await readFile(p, "utf8");
    expect(text.indexOf("a.jsonl")).toBeLessThan(text.indexOf("z.jsonl"));
    expect(text.indexOf("benchmark-archive")).toBeLessThan(text.indexOf("other-archive"));
    expect(text).toContain('release: "0"');
    const back = await run(readManifest(p));
    expect(Exit.isSuccess(back) && back.value.manifest).toEqual(LEGACY);
    // Stable: writing what was read reproduces the bytes.
    await run(writeManifest(p, LEGACY));
    expect(await readFile(p, "utf8")).toBe(text);
  });

  it("rejects a malformed manifest", async () => {
    const p = join(dir, "bad.yaml");
    await writeFile(
      p,
      "name: x\ntitle: x\nrelease: '1'\nevalVersion: null\nranked: true\nbundles: [nothex]\n",
    );
    expect(Exit.isFailure(await run(readManifest(p)))).toBe(true);
  });

  it("addBundles appends new digests in order and drops duplicates", () => {
    const out = addBundles(V4, [d("c"), d("a"), d("c"), d("d")]);
    expect(out.bundles).toEqual([d("b"), d("a"), d("c"), d("d")]);
  });
});
