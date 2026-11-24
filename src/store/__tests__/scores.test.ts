import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stableStringify } from "../../config/hashing.js";
import { digestOf } from "../digest.js";
import { appendScores, conflicts, readScores, type ScoreRecord } from "../scores.js";
import { makeStoreDir } from "./fixtures.js";

const run = <A, E>(eff: Effect.Effect<A, E, NodeContext.NodeContext>) =>
  Effect.runPromise(eff.pipe(Effect.provide(NodeContext.layer)));

let store: string;
beforeEach(async () => {
  store = await makeStoreDir();
});
afterEach(async () => {
  await fsp.rm(store, { recursive: true, force: true });
});

const bundle = digestOf("bundle");
const record = (over: Partial<ScoreRecord> = {}): ScoreRecord => ({
  execution: digestOf("e1"),
  scorer: digestOf("s1"),
  score: 1,
  failureKind: null,
  details: "matched",
  nearMiss: null,
  breakdown: null,
  harnessGitSha: "0".repeat(40),
  scoredAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("score log", () => {
  it("appends canonical lines to scores/<bundleDigest>.jsonl and reads them back", async () => {
    await run(appendScores(store, bundle, [record()]));
    await run(appendScores(store, bundle, [record({ score: 0, failureKind: "wrong" })]));
    const file = path.join(store, "scores", `${bundle}.jsonl`);
    expect(await fsp.readFile(file, "utf8")).toBe(
      `${stableStringify(record())}\n${stableStringify(record({ score: 0, failureKind: "wrong" }))}\n`,
    );
    expect(await run(readScores(store, bundle))).toEqual([
      record(),
      record({ score: 0, failureKind: "wrong" }),
    ]);
  });

  it("reads no records for a bundle never scored", async () => {
    expect(await run(readScores(store, bundle))).toEqual([]);
  });
});

describe("conflicts", () => {
  const items = new Map([[digestOf("e1"), "math/a"]]);

  it("is empty when every record of a key agrees (stamps may differ)", () => {
    expect(conflicts([record(), record({ scoredAt: "2027-01-01T00:00:00.000Z" })], items)).toEqual(
      [],
    );
  });

  it("names the execution, scorer and item of disagreeing records", () => {
    const other = record({ execution: digestOf("e2") });
    expect(conflicts([record(), record({ details: "differs" }), other], items)).toEqual([
      { execution: digestOf("e1"), scorer: digestOf("s1"), item: "math/a" },
    ]);
  });
});
