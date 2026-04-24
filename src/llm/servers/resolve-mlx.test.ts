import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findMlxSnapshot } from "./resolve-mlx.js";

const mkSnapshot = async (
  cacheRoot: string,
  artifact: string,
  sha: string,
  files: ReadonlyArray<string>,
): Promise<string> => {
  const dir = path.join(cacheRoot, `models--${artifact.replace(/\//g, "--")}`, "snapshots", sha);
  await fsp.mkdir(dir, { recursive: true });
  for (const f of files) {
    await fsp.writeFile(path.join(dir, f), "x");
  }
  return dir;
};

describe("findMlxSnapshot", () => {
  let cacheRoot: string;
  beforeEach(async () => {
    cacheRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "mlx-cache-"));
  });
  afterEach(async () => {
    await fsp.rm(cacheRoot, { recursive: true, force: true });
  });

  it("returns undefined when no cache dir exists", () => {
    expect(findMlxSnapshot(cacheRoot, "nonexistent/repo")).toBeUndefined();
  });

  it("returns the snapshot when config.json + .safetensors are present", async () => {
    const dir = await mkSnapshot(cacheRoot, "mlx-community/Foo-4bit", "sha123", [
      "config.json",
      "model.safetensors",
    ]);
    expect(findMlxSnapshot(cacheRoot, "mlx-community/Foo-4bit")).toBe(dir);
  });

  it("rejects a snapshot missing config.json", async () => {
    await mkSnapshot(cacheRoot, "mlx-community/Foo-4bit", "sha123", ["model.safetensors"]);
    expect(findMlxSnapshot(cacheRoot, "mlx-community/Foo-4bit")).toBeUndefined();
  });

  it("rejects a snapshot missing .safetensors", async () => {
    await mkSnapshot(cacheRoot, "mlx-community/Foo-4bit", "sha123", [
      "config.json",
      "tokenizer.json",
    ]);
    expect(findMlxSnapshot(cacheRoot, "mlx-community/Foo-4bit")).toBeUndefined();
  });

  it("rejects a snapshot with a broken .safetensors symlink", async () => {
    const dir = await mkSnapshot(cacheRoot, "mlx-community/Foo-4bit", "sha123", ["config.json"]);
    await fsp.symlink("/nonexistent/blob", path.join(dir, "model.safetensors"));
    expect(findMlxSnapshot(cacheRoot, "mlx-community/Foo-4bit")).toBeUndefined();
  });

  it("picks the alphabetically-latest sha when multiple snapshots exist", async () => {
    await mkSnapshot(cacheRoot, "mlx-community/Foo-4bit", "aaa111", [
      "config.json",
      "model.safetensors",
    ]);
    const newer = await mkSnapshot(cacheRoot, "mlx-community/Foo-4bit", "zzz999", [
      "config.json",
      "model.safetensors",
    ]);
    expect(findMlxSnapshot(cacheRoot, "mlx-community/Foo-4bit")).toBe(newer);
  });

  it("handles multi-shard safetensors", async () => {
    const dir = await mkSnapshot(cacheRoot, "mlx-community/Big-4bit", "sha", [
      "config.json",
      "model-00001-of-00003.safetensors",
      "model-00002-of-00003.safetensors",
      "model-00003-of-00003.safetensors",
      "model.safetensors.index.json",
    ]);
    expect(findMlxSnapshot(cacheRoot, "mlx-community/Big-4bit")).toBe(dir);
  });
});
