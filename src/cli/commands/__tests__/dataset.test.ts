import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect, Exit } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { datasetAdd } from "../dataset.js";

const run = <A, E>(eff: Effect.Effect<A, E, NodeContext.NodeContext>) =>
  Effect.runPromiseExit(Effect.provide(eff, NodeContext.layer));
const d = (c: string) => c.repeat(64);

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "dataset-add-"));
  await mkdir(join(dir, "datasets"));
  await mkdir(join(dir, "store", "bundles"), { recursive: true });
  await writeFile(
    join(dir, "datasets", "r.yaml"),
    `name: r\ntitle: R\nrelease: "2027.1"\nevalVersion: "2027.1.0"\nranked: true\nbundles:\n  - ${d("a")} # old · logic\n`,
  );
  await writeFile(
    join(dir, "store", "bundles", `${d("b")}.jsonl`),
    `${JSON.stringify({ schemaVersion: 4, configId: "cfg-b", challenge: "math" })}\n{}\n`,
  );
  await writeFile(
    join(dir, `${d("c")}.jsonl`),
    `${JSON.stringify({ configId: "cfg-c", challenge: "code" })}\n`,
  );
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const add = (name: string, bundles: string[]) =>
  run(
    datasetAdd({
      datasetsDir: join(dir, "datasets"),
      store: join(dir, "store"),
      name,
      bundles,
    }),
  );

describe("dataset add", () => {
  it("appends digests and bundle paths with header comments, keeping existing entries", async () => {
    const exit = await add("r", [d("b"), join(dir, `${d("c")}.jsonl`), d("a"), d("e")]);
    expect(Exit.isSuccess(exit)).toBe(true);
    const text = await readFile(join(dir, "datasets", "r.yaml"), "utf8");
    expect(text).toContain(
      [
        "bundles:",
        `  - ${d("a")} # old · logic`,
        `  - ${d("b")} # cfg-b · math`,
        `  - ${d("c")} # cfg-c · code`,
        `  - ${d("e")}`,
        "",
      ].join("\n"),
    );
  });

  it("refuses a legacy manifest", async () => {
    await writeFile(
      join(dir, "datasets", "alpha.yaml"),
      `name: alpha\ntitle: A\nrelease: "0"\nevalVersion: "0.7"\nranked: false\nlegacy:\n  hardware:\n    id: x\n  archives: {}\n`,
    );
    const exit = await add("alpha", [d("b")]);
    expect(exit).toEqual(Exit.fail(expect.objectContaining({ _tag: "ConfigError" })));
  });

  it("refuses an argument that is neither a digest nor a bundle path", async () => {
    expect(Exit.isFailure(await add("r", ["nope"]))).toBe(true);
  });
});
