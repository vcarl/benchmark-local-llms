import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Effect } from "effect";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { resolveLlamacppGguf } from "./resolve-gguf.js";

let home: string;
beforeEach(async () => {
  home = await fsp.mkdtemp(path.join(os.tmpdir(), "gguf-home-"));
  vi.stubEnv("HOME", home);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await fsp.rm(home, { recursive: true, force: true });
});

it("ignores hf .no_exist markers and returns the snapshot file", async () => {
  const repo = path.join(home, ".cache", "huggingface", "hub", "models--Org--M-GGUF");
  const marker = path.join(repo, ".no_exist", "sha1");
  const snap = path.join(repo, "snapshots", "sha1");
  await fsp.mkdir(marker, { recursive: true });
  await fsp.mkdir(snap, { recursive: true });
  await fsp.writeFile(path.join(marker, "*-BF16.gguf"), "");
  await fsp.writeFile(path.join(snap, "M-BF16.gguf"), "x");
  const found = await Effect.runPromise(resolveLlamacppGguf("Org/M-GGUF", "BF16"));
  expect(found).toBe(path.join(snap, "M-BF16.gguf"));
});
