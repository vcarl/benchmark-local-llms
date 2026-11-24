import * as fsp from "node:fs/promises";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendExecution, createOpenBundle, sealBundle } from "../bundle.js";
import { digestOf } from "../digest.js";
import { executionKey, findOpenBundle, loadPresent } from "../store-index.js";
import { execution, header, makeStoreDir } from "./fixtures.js";

const run = <A, E>(eff: Effect.Effect<A, E, NodeContext.NodeContext>) =>
  Effect.runPromise(eff.pipe(Effect.provide(NodeContext.layer)));

let store: string;
beforeEach(async () => {
  store = await makeStoreDir();
});
afterEach(async () => {
  await fsp.rm(store, { recursive: true, force: true });
});

const h = header();
const keyOf = (item: string, over: Partial<Parameters<typeof executionKey>[0]> = {}) =>
  executionKey({
    configDigest: h.configDigest,
    hardwareId: h.env.hardwareId,
    item: `math/${item}`,
    messagesDigest: execution(item).messagesDigest,
    sample: 0,
    ...over,
  });

describe("loadPresent (skip-if-present)", () => {
  beforeEach(async () => {
    await run(
      Effect.gen(function* () {
        const open = yield* createOpenBundle(store, h);
        yield* appendExecution(open, execution("ok"));
        yield* appendExecution(open, execution("errored", 0, { error: "timeout", output: "" }));
        yield* appendExecution(
          open,
          execution("overran", 0, { error: "context_exceeded", output: "" }),
        );
        yield* appendExecution(
          open,
          execution("truncated", 0, { error: "thinking_truncated", output: "" }),
        );
        yield* sealBundle(store, open, "2026-01-01T00:01:00.000Z");
      }),
    );
  });

  it("holds the sealed, non-errored execution under its exact key", async () => {
    const [present] = await run(loadPresent(store));
    expect(present?.get(keyOf("ok"))).toEqual(execution("ok"));
    expect(present?.has(keyOf("errored"))).toBe(false);
  });

  it("holds token-limit outcomes: they are the model's result, not a harness failure", async () => {
    const [present] = await run(loadPresent(store));
    expect(present?.has(keyOf("overran"))).toBe(true);
    expect(present?.has(keyOf("truncated"))).toBe(true);
  });

  it("misses on a different messagesDigest, sample, hardware or config", async () => {
    const [present] = await run(loadPresent(store));
    expect(present?.has(keyOf("ok", { messagesDigest: digestOf("other") }))).toBe(false);
    expect(present?.has(keyOf("ok", { sample: 1 }))).toBe(false);
    expect(present?.has(keyOf("ok", { hardwareId: digestOf("other") }))).toBe(false);
    expect(present?.has(keyOf("ok", { configDigest: digestOf("other") }))).toBe(false);
  });

  it("is empty for a store with no bundles yet", async () => {
    const empty = await makeStoreDir();
    expect(await run(loadPresent(empty))).toEqual([]);
    await fsp.rm(empty, { recursive: true, force: true });
  });
});

describe("findOpenBundle (resume)", () => {
  const match = {
    configDigest: h.configDigest,
    hardwareId: h.env.hardwareId,
    release: h.release,
    challenge: h.challenge,
  };

  it("adopts the open file with the same config, hardware, release and challenge", async () => {
    const path = await run(createOpenBundle(store, h));
    await run(appendExecution(path, execution("a")));
    const open = await run(findOpenBundle(store, match));
    expect(open?.path).toBe(path);
    expect(open?.header.run.id).toBe("run-1");
    expect(open?.executions).toEqual([execution("a")]);
  });

  it("ignores open files for another release or challenge, and a missing open dir", async () => {
    expect(await run(findOpenBundle(store, match))).toBeUndefined();
    await run(createOpenBundle(store, h));
    expect(await run(findOpenBundle(store, { ...match, release: "2027.1" }))).toBeUndefined();
    expect(await run(findOpenBundle(store, { ...match, challenge: "code" }))).toBeUndefined();
  });
});
