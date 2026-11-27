import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MESSAGES_DIGEST, makeDraftRelease } from "../../../release/__tests__/fixtures.js";
import { commitRelease } from "../../../release/release.js";
import { execution, header } from "../../../store/__tests__/fixtures.js";
import {
  appendExecution,
  type BundleHeader,
  bundlePath,
  createOpenBundle,
  type Execution,
  sealBundle,
} from "../../../store/bundle.js";
import { verifyBundles } from "../verify.js";

let root: string;
let releases: string;
let store: string;
beforeEach(async () => {
  ({ root, releases } = await makeDraftRelease());
  store = path.join(root, "store");
});
afterEach(() => fsp.rm(root, { recursive: true, force: true }));

const run = <A, E>(eff: Effect.Effect<A, E, NodeContext.NodeContext>) =>
  Effect.runPromise(eff.pipe(Effect.provide(NodeContext.layer)));

/** An execution of `item` sent the messages the draft's prompt for it produces. */
const pinned = (item: string, over: Partial<Execution> = {}) =>
  execution(item, 0, { messagesDigest: MESSAGES_DIGEST[`math/${item}`] as string, ...over });

const seal = (execs: ReadonlyArray<Execution>, over: Partial<BundleHeader> = {}) =>
  run(
    Effect.gen(function* () {
      const open = yield* createOpenBundle(store, header(over));
      for (const e of execs) yield* appendExecution(open, e);
      return bundlePath(store, yield* sealBundle(store, open, "2026-01-01T00:01:00.000Z"));
    }),
  );

const verify = (...files: string[]) => run(verifyBundles(files, releases));

it("reports ok for a good bundle and FAILED with the reason for a tampered one", async () => {
  const good = await seal([pinned("a")]);
  const tampered = path.join(store, "tampered.jsonl");
  const text = await fsp.readFile(good, "utf8");
  await fsp.writeFile(tampered, text.replace('"executions":1', '"executions":2'));
  const before = await fsp.readdir(root, { recursive: true });

  const r = await verify(good, tampered, path.join(store, "missing.jsonl"));
  expect(r.failed).toBe(2);
  expect(r.lines[0]).toBe(
    `ok ${path.basename(good, ".jsonl")} ${good} (warning: draft release, pinned for local verification only)`,
  );
  expect(r.lines[1]).toMatch(/^FAILED .*tampered\.jsonl: executions: header says 2/);
  expect(r.lines[2]).toMatch(/^FAILED .*missing\.jsonl: /);
  expect(await fsp.readdir(root, { recursive: true })).toEqual(before);
});

describe("release pinning", () => {
  it("accepts every item, a turn's messages built with its gold history", async () => {
    const r = await verify(await seal(["a", "b", "chain#1", "chain#2"].map((i) => pinned(i))));
    expect(r.failed).toBe(0);
  });

  it("rejects an unknown item, a mismatched messagesDigest, and a challenge not in the release", async () => {
    const unknown = await seal([pinned("a"), execution("zz")]);
    const mismatch = await seal([
      pinned("a", { messagesDigest: MESSAGES_DIGEST["math/b"] as string }),
    ]);
    const other = await seal([pinned("a")], { challenge: "other" });
    const r = await verify(unknown, mismatch, other);
    expect(r.failed).toBe(3);
    expect(r.lines[0]).toMatch(/: math\/zz: not an item of math in release draft$/);
    expect(r.lines[1]).toMatch(/: math\/a sample 0: messagesDigest does not match the release$/);
    expect(r.lines[2]).toMatch(/: challenge other is not in release draft$/);
  });

  it("accepts a committed release without a warning and rejects a missing one", async () => {
    await run(commitRelease(releases, "2027.1", path.join(releases, "draft")));
    const committed = await seal([pinned("a")], { release: "2027.1" });
    const missing = await seal([pinned("b")], { release: "2027.2" });
    const r = await verify(committed, missing);
    expect(r.lines[0]).toBe(`ok ${path.basename(committed, ".jsonl")} ${committed}`);
    expect(r.lines[1]).toMatch(/^FAILED .*: release 2027\.2: /);
  });
});
