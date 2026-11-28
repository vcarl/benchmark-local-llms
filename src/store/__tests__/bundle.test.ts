import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect, Either } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendExecution,
  bundlePath,
  createOpenBundle,
  readBundle,
  readOpenBundle,
  releaseOfChallengesDir,
  sealBundle,
} from "../bundle.js";
import { digestOf, sha256Hex } from "../digest.js";
import { bundleText, execution, hardware, header, makeStoreDir } from "./fixtures.js";

const run = <A, E>(eff: Effect.Effect<A, E, NodeContext.NodeContext>) =>
  Effect.runPromise(eff.pipe(Effect.provide(NodeContext.layer)));

let store: string;
beforeEach(async () => {
  store = await makeStoreDir();
});
afterEach(async () => {
  await fsp.rm(store, { recursive: true, force: true });
});

const FINISHED = "2026-01-01T00:01:00.000Z";

const writeSealed = (execs = [execution("a"), execution("b")]) =>
  run(
    Effect.gen(function* () {
      const open = yield* createOpenBundle(store, header());
      for (const e of execs) yield* appendExecution(open, e);
      return yield* sealBundle(store, open, FINISHED);
    }),
  );

const checkOf = async (file: string): Promise<string> => {
  const r = await run(readBundle(file).pipe(Effect.either));
  if (Either.isRight(r)) throw new Error("expected verification to fail");
  return r.left._tag === "BundleInvalid" ? r.left.check : r.left._tag;
};

describe("open → sealed lifecycle", () => {
  it("names the open file <runId>-<configId>-<challenge>.jsonl and seals it canonically", async () => {
    const open = await run(createOpenBundle(store, header()));
    expect(path.relative(store, open)).toBe("open/run-1-cfg-math.jsonl");
    await run(appendExecution(open, execution("a")));
    const digest = await run(sealBundle(store, open, FINISHED));

    const file = bundlePath(store, digest);
    const bytes = await fsp.readFile(file);
    expect(sha256Hex(bytes)).toBe(digest);
    expect(bytes.toString("utf8")).toBe(
      bundleText([
        header({ run: { ...header().run, finishedAt: FINISHED }, executions: 1 }),
        execution("a"),
      ]),
    );
    await expect(fsp.access(open)).rejects.toThrow();
  });

  it("round-trips header and executions through the verifying reader", async () => {
    const digest = await writeSealed();
    const b = await run(readBundle(bundlePath(store, digest)));
    expect(b.digest).toBe(digest);
    expect(b.header.executions).toBe(2);
    expect(b.header.run.finishedAt).toBe(FINISHED);
    expect(b.executions).toEqual([execution("a"), execution("b")]);
  });

  it("re-sealing identical bytes is a no-op returning the same digest", async () => {
    const first = await writeSealed();
    const second = await writeSealed();
    expect(second).toBe(first);
    expect(await fsp.readdir(path.join(store, "bundles"))).toEqual([`${first}.jsonl`]);
  });

  it("sealing onto a different file stored under the same digest fails, never overwrites", async () => {
    const digest = await writeSealed();
    const file = bundlePath(store, digest);
    await fsp.writeFile(file, "tampered\n");
    const r = await run(
      Effect.gen(function* () {
        const open = yield* createOpenBundle(store, header());
        yield* appendExecution(open, execution("a"));
        yield* appendExecution(open, execution("b"));
        return yield* sealBundle(store, open, FINISHED);
      }).pipe(Effect.either),
    );
    expect(Either.isLeft(r) && r.left._tag).toBe("BundleConflict");
    expect(await fsp.readFile(file, "utf8")).toBe("tampered\n");
  });

  it("a re-executed item×sample replaces the earlier line at seal (last wins)", async () => {
    const digest = await writeSealed([
      execution("a", 0, { error: "timeout", output: "" }),
      execution("a", 0),
    ]);
    const b = await run(readBundle(bundlePath(store, digest)));
    expect(b.executions).toEqual([execution("a", 0)]);
  });

  it("an open file's partial trailing line (crash mid-append) is ignored", async () => {
    const open = await run(createOpenBundle(store, header()));
    await run(appendExecution(open, execution("a")));
    await fsp.appendFile(open, '{"item":"math/b"');
    const o = await run(readOpenBundle(open));
    expect(o.executions).toEqual([execution("a")]);
  });
});

describe("verifying reader", () => {
  const sealedLines = (over: Parameters<typeof header>[0] = {}, execs = [execution("a")]) => [
    header({
      run: { ...header().run, finishedAt: FINISHED },
      executions: execs.length,
      ...over,
    }),
    ...execs,
  ];
  const writeLoose = async (text: string): Promise<string> => {
    const file = path.join(store, "outside.jsonl");
    await fsp.writeFile(file, text);
    return file;
  };

  it("reports the computed digest of a valid file outside the store", async () => {
    const text = bundleText(sealedLines());
    const b = await run(readBundle(await writeLoose(text)));
    expect(b.digest).toBe(sha256Hex(text));
  });

  it("verifies a header with or without env.weightsSource, and rejects an unknown env field", async () => {
    const plain = bundleText(sealedLines());
    expect(
      (await run(readBundle(await writeLoose(plain)))).header.env.weightsSource,
    ).toBeUndefined();
    const weightsSource = { repo: "o/m", revision: "a".repeat(40), publishedAt: null };
    const text = bundleText(sealedLines({ env: { ...header().env, weightsSource } }));
    expect((await run(readBundle(await writeLoose(text)))).header.env.weightsSource).toEqual(
      weightsSource,
    );
    const extra = bundleText(sealedLines({ env: { ...header().env, weightsDate: "x" } as never }));
    expect(await checkOf(await writeLoose(extra))).toBe("schema");
  });

  it("fails `name` when an edited byte makes the digest differ from the file name", async () => {
    const digest = await writeSealed();
    const file = bundlePath(store, digest);
    const text = await fsp.readFile(file, "utf8");
    await fsp.writeFile(file, text.replace('"output":"4"', '"output":"5"'));
    expect(await checkOf(file)).toBe("name");
  });

  it("fails `name` for a valid bundle stored under another digest", async () => {
    const digest = await writeSealed();
    const other = bundlePath(store, "f".repeat(64));
    await fsp.copyFile(bundlePath(store, digest), other);
    expect(await checkOf(other)).toBe("name");
  });

  it("fails `canonical` on a non-canonical line", async () => {
    const lines = sealedLines();
    const text = bundleText(lines).replace(/\n$/, "").split("\n");
    text[1] = JSON.stringify(lines[1], null, 1).replace(/\n/g, "");
    expect(await checkOf(await writeLoose(`${text.join("\n")}\n`))).toBe("canonical");
  });

  it("fails `json` on an unparseable line and `schema` on a wrong envelope", async () => {
    expect(await checkOf(await writeLoose(`${bundleText(sealedLines())}{oops\n`))).toBe("json");
    const v3 = sealedLines();
    expect(await checkOf(await writeLoose(bundleText([{ ...v3[0], schemaVersion: 3 }])))).toBe(
      "schema",
    );
    expect(
      await checkOf(
        await writeLoose(bundleText([v3[0], { ...execution("a"), score: 1 } as unknown])),
      ),
    ).toBe("schema");
  });

  it("fails `configDigest` when the config does not hash to configDigest", async () => {
    const text = bundleText(sealedLines({ configDigest: digestOf({ other: true }) }));
    expect(await checkOf(await writeLoose(text))).toBe("configDigest");
  });

  it("fails `hardwareId` when the hardware does not hash to hardwareId", async () => {
    const env = { ...header().env, hardware: { ...hardware, memoryGb: 128 } };
    expect(await checkOf(await writeLoose(bundleText(sealedLines({ env }))))).toBe("hardwareId");
  });

  it("fails `executions` on a wrong count or an unsealed header", async () => {
    expect(await checkOf(await writeLoose(bundleText(sealedLines({ executions: 2 }))))).toBe(
      "executions",
    );
    expect(await checkOf(await writeLoose(bundleText(sealedLines({ executions: null }))))).toBe(
      "executions",
    );
  });

  it("fails `duplicate` on a repeated item×sample", async () => {
    const text = bundleText(sealedLines({}, [execution("a"), execution("a")]));
    expect(await checkOf(await writeLoose(text))).toBe("duplicate");
  });
});

describe("releaseOfChallengesDir", () => {
  it("is the release name for releases/<name>/challenges, else draft", () => {
    expect(releaseOfChallengesDir("releases/2027.1/challenges")).toBe("2027.1");
    expect(releaseOfChallengesDir("/abs/releases/0/challenges/")).toBe("0");
    expect(releaseOfChallengesDir("challenges")).toBe("draft");
    expect(releaseOfChallengesDir("challenges-next")).toBe("draft");
  });
});
