import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect, Exit } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scoreDataset } from "../cli/commands/score.js";
import { stableStringify } from "../config/hashing.js";
import { writeManifest } from "../dataset/manifest.js";
import { MESSAGES_DIGEST, makeDraftRelease } from "../release/__tests__/fixtures.js";
import { commitRelease } from "../release/release.js";
import { execution, header } from "../store/__tests__/fixtures.js";
import type { Execution } from "../store/bundle.js";
import { appendExecution, createOpenBundle, sealBundle } from "../store/bundle.js";
import { digestOf } from "../store/digest.js";
import { appendScores, readScores } from "../store/scores.js";
import { buildSnapshot, type ReportOptions, runReport } from "./index.js";

const run = <A, E>(eff: Effect.Effect<A, E, NodeContext.NodeContext>) =>
  Effect.runPromise(eff.pipe(Effect.provide(NodeContext.layer)));
const exit = <A, E>(eff: Effect.Effect<A, E, NodeContext.NodeContext>) =>
  Effect.runPromiseExit(eff.pipe(Effect.provide(NodeContext.layer)));

let root: string;
let opts: ReportOptions;
beforeEach(async () => {
  const made = await makeDraftRelease();
  root = made.root;
  await fsp.mkdir(path.join(root, "datasets"));
  opts = {
    datasetsDir: path.join(root, "datasets"),
    store: path.join(root, "store"),
    releasesDir: made.releases,
    legacyRoot: root,
    output: path.join(root, "out"),
    configsPath: path.join(root, "configs.yaml"),
    harnessGitSha: "f".repeat(40),
  };
});
afterEach(() => fsp.rm(root, { recursive: true, force: true }));

const exec = (item: string, output: string, executedAt = "2026-01-01T00:00:01.000Z") =>
  execution(item, 0, {
    item: `math/${item}`,
    messagesDigest: MESSAGES_DIGEST[`math/${item}`] as string,
    output,
    rawOutput: output,
    executedAt,
  });

const seal = (
  runId: string,
  execs: ReadonlyArray<Execution>,
  contributor = "local",
  startedAt = header().run.startedAt,
) =>
  run(
    Effect.gen(function* () {
      const open = yield* createOpenBundle(
        opts.store,
        header({ run: { ...header().run, id: runId, contributor, startedAt } }),
      );
      for (const e of execs) yield* appendExecution(open, e);
      return yield* sealBundle(opts.store, open, "2026-01-01T00:01:00.000Z");
    }),
  );

const manifest = (bundles: string[]) =>
  run(
    writeManifest(path.join(opts.datasetsDir, "d.yaml"), {
      name: "d",
      title: "Draft",
      release: "draft",
      evalVersion: null,
      ranked: false,
      bundles,
    }),
  );

const score = () =>
  run(
    scoreDataset({
      name: "d",
      datasetsDir: opts.datasetsDir,
      store: opts.store,
      releasesDir: opts.releasesDir,
      harnessGitSha: "x",
    }),
  );

const snapshot = async () =>
  (await run(buildSnapshot(path.join(opts.datasetsDir, "d.yaml"), opts))).snapshot;

const ALL = ["a", "b", "chain#1", "chain#2"];

describe("v4 rows", () => {
  it("one row per config × hardware × contributor, cells over the release's challenge set", async () => {
    const mine = await seal("r1", [
      exec("a", "4"),
      exec("b", "9"),
      exec("chain#1", "2"),
      exec("chain#2", "4"),
    ]);
    const theirs = await seal("r2", [exec("a", "4"), exec("b", "0")], "bob");
    await manifest([mine, theirs]);
    await score();
    const snap = await snapshot();
    expect(snap.dataset).toMatchObject({
      label: "d",
      release: "draft",
      version: null,
      legacy: false,
      ranked: false,
    });
    expect(snap.inputs.runners).toEqual([]);
    expect(
      snap.rows.map((r) => [r.rowId.split("@")[2], r.passed, r.items, r.cells["math"]?.status]),
    ).toEqual([
      ["local", 4, 4, "scored"],
      ["bob", 0, 4, "not_run"],
    ]);
    const row = snap.rows[0];
    expect(row?.cells["math"]?.sourceAttempts).toEqual([mine]);
    expect(row?.provenance.submitters).toEqual(["local"]);
    expect(row?.configHash).toBe(header().configDigest);
    expect(Object.keys(snap.hardware)).toEqual([header().env.hardwareId]);
  });

  it("a cell counts exactly one complete bundle: the most recent, a tie going to the lower digest", async () => {
    const all = (outputs: Record<string, string>) =>
      ALL.map((i) => exec(i, outputs[i] ?? "wrong", "2026-01-01T00:00:01.000Z"));
    const day = (d: number) => `2026-01-0${d}T00:00:00.000Z`;
    // Run 1 passes a and b; run 2 passes only b; a later, incomplete run 3 passes a.
    const one = await seal("r1", all({ a: "4", b: "9" }), "local", day(1));
    const two = await seal("r2", all({ b: "9" }), "local", day(2));
    const three = await seal("r3", [exec("a", "4")], "local", day(3));
    await manifest([one, two, three]);
    await score();
    let cell = (await snapshot()).rows[0]?.cells["math"];
    // Run 2's results only: no pooling of run 1's pass on a, run 3 is incomplete.
    expect(cell).toMatchObject({ status: "scored", passed: 1, sourceAttempts: [two] });

    // Two complete runs started together: the lower bundle digest counts.
    const tieA = await seal("r4", all({ a: "4" }), "local", day(4));
    const tieB = await seal("r5", all({ a: "4", b: "9" }), "local", day(4));
    await manifest([one, two, three, tieA, tieB]);
    await score();
    cell = (await snapshot()).rows[0]?.cells["math"];
    const lower = tieA < tieB ? tieA : tieB;
    expect(cell).toMatchObject({ passed: lower === tieA ? 1 : 2, sourceAttempts: [lower] });
  });

  it("a bundle missing a sample below its highest is incomplete: samples run 0..k-1", async () => {
    const day = (d: number) => `2026-01-0${d}T00:00:00.000Z`;
    const one = await seal(
      "r1",
      ALL.map((i) => exec(i, "4")),
      "local",
      day(1),
    );
    // A later bundle holding samples 1 and 2 of every item, but no sample 0.
    const gappy = await seal(
      "r2",
      ALL.flatMap((i) => [1, 2].map((s) => ({ ...exec(i, "wrong"), sample: s }))),
      "local",
      day(2),
    );
    await manifest([one, gappy]);
    await score();
    expect((await snapshot()).rows[0]?.cells["math"]).toMatchObject({
      status: "scored",
      sourceAttempts: [one],
    });
  });

  it("a cell with no complete bundle is not run", async () => {
    const part = await seal("r1", [exec("a", "4")]);
    await manifest([part]);
    await score();
    expect((await snapshot()).rows[0]?.cells["math"]).toMatchObject({
      status: "not_run",
      passed: 0,
    });
  });

  it("each config version of one configId is its own row", async () => {
    const config = (maxTokens: number) => ({ ...header().config, maxTokens });
    const bundle = (runId: string, maxTokens: number) =>
      run(
        Effect.gen(function* () {
          const h = header({ run: { ...header().run, id: runId } });
          const open = yield* createOpenBundle(opts.store, {
            ...h,
            config: config(maxTokens),
            configDigest: digestOf(config(maxTokens)),
          });
          yield* appendExecution(open, exec("a", "4"));
          return yield* sealBundle(opts.store, open, "2026-01-01T00:01:00.000Z");
        }),
      );
    await manifest([await bundle("r1", 128), await bundle("r2", 256)]);
    await score();
    const rows = (await snapshot()).rows;
    expect(rows.map((r) => [r.configId, r.variantLabel]).sort()).toEqual([
      ["cfg", "maxTokens 128"],
      ["cfg", "maxTokens 256"],
    ]);
  });

  it("tells config versions apart by weights digest, unknown when unrecorded", async () => {
    const config = (weightsDigest: string | null) => ({ ...header().config, weightsDigest });
    const bundle = (runId: string, weightsDigest: string | null) =>
      run(
        Effect.gen(function* () {
          const h = header({ run: { ...header().run, id: runId } });
          const open = yield* createOpenBundle(opts.store, {
            ...h,
            config: config(weightsDigest),
            configDigest: digestOf(config(weightsDigest)),
          });
          yield* appendExecution(open, exec("a", "4"));
          return yield* sealBundle(opts.store, open, "2026-01-01T00:01:00.000Z");
        }),
      );
    await manifest([await bundle("r1", null), await bundle("r2", "ab".repeat(32))]);
    await score();
    const rows = (await snapshot()).rows;
    expect(rows.map((r) => r.variantLabel).sort()).toEqual([
      "weights abababababab",
      "weights unknown",
    ]);
  });

  it("counts an execution only when its messagesDigest is the release's current prompt", async () => {
    const stale = { ...exec("a", "4"), messagesDigest: "0".repeat(64) };
    const one = await seal("r1", [stale, ...["b", "chain#1", "chain#2"].map((i) => exec(i, "4"))]);
    await manifest([one]);
    await score();
    // The stale execution needs no score record and leaves the cell stale.
    expect((await run(readScores(opts.store, one))).length).toBe(3);
    const snap = await snapshot();
    // A bundle with a stale execution is not complete, so the cell is not run.
    expect(snap.rows[0]?.cells["math"]).toMatchObject({ status: "not_run", passed: 0 });
    // No cell references the bundle, so its detail file is pruned.
    expect((await run(runReport(opts))).detailsPruned).toBe(1);
    await expect(fsp.access(path.join(opts.output, "details", `${one}.json`))).rejects.toThrow();
  });

  it("fails on a missing score record, naming ./bench score", async () => {
    const one = await seal("r1", [exec("a", "4")]);
    await manifest([one]);
    const r = await exit(buildSnapshot(path.join(opts.datasetsDir, "d.yaml"), opts));
    expect(Exit.isFailure(r) && String(r.cause)).toMatch(/math\/a.*\.\/bench score --dataset d/s);
  });

  it("fails naming the item when two records of one execution disagree", async () => {
    const one = await seal("r1", [exec("a", "4"), exec("b", "9")]);
    await manifest([one]);
    await score();
    const [first] = (await run(readScores(opts.store, one))).filter((x) => x.score === 1);
    if (first === undefined) throw new Error("no record");
    await run(appendScores(opts.store, one, [{ ...first, score: 0 }]));
    const r = await exit(buildSnapshot(path.join(opts.datasetsDir, "d.yaml"), opts));
    expect(Exit.isFailure(r) && String(r.cause)).toMatch(/math\/a.*nondeterministic/s);
  });

  it("writes details/<bundleDigest>.json with the release's prompt text", async () => {
    const one = await seal(
      "r1",
      ALL.map((i) => exec(i, "4")),
    );
    await manifest([one]);
    await score();
    const summary = await run(runReport(opts));
    expect(summary.detailsWritten).toBe(1);
    const detail = JSON.parse(
      await fsp.readFile(path.join(opts.output, "details", `${one}.json`), "utf8"),
    );
    expect(detail.attempt_id).toBe(one);
    expect(detail.system_prompt_text).toBe(header().config.systemPrompt);
    expect(detail.items.map((i: { item_id: string }) => i.item_id)).toEqual(ALL);
    // Prompt text lives in the shared prompt pack the detail names.
    const pack = JSON.parse(
      await fsp.readFile(path.join(opts.output, "prompts", `${detail.prompts}.json`), "utf8"),
    );
    expect(pack[ALL[0] as string]).toBe("What is 2+2?");
    expect(detail.items[0].prompt_text).toBeUndefined();
    expect(detail.items[0]).toMatchObject({
      score: 1,
      scorer: { type: "exact_match" },
    });
    expect(detail.items[3]).toMatchObject({
      parent_item_id: "chain",
      turn: 2,
      prior_turn_passed: false,
    });
    const snap = JSON.parse(
      await fsp.readFile(
        path.join(opts.output, `${summary.snapshots[0]?.entry.digest}.json`),
        "utf8",
      ),
    );
    expect(stableStringify(snap.rows[0].cells.math.sourceAttempts)).toBe(stableStringify([one]));
  });
});

describe("evaluation timing", () => {
  it("labels a frozen release's items against each counted bundle's weights date", async () => {
    await run(commitRelease(opts.releasesDir, "2027.1", path.join(opts.releasesDir, "draft")));
    const frozen = JSON.parse(
      await fsp.readFile(path.join(opts.releasesDir, "2027.1", "release.json"), "utf8"),
    );
    const bundle = (contributor: string, publishedAt: string | null) =>
      run(
        Effect.gen(function* () {
          const h = header({
            release: "2027.1",
            run: { ...header().run, id: contributor, contributor },
          });
          const weightsSource = { repo: "o/m", revision: "a".repeat(40), publishedAt };
          const open = yield* createOpenBundle(opts.store, {
            ...h,
            env: { ...h.env, weightsSource },
          });
          for (const i of ALL) yield* appendExecution(open, exec(i, "4"));
          return yield* sealBundle(opts.store, open, "2026-01-01T00:01:00.000Z");
        }),
      );
    const bundles = [
      await bundle("old", "2020-01-01T00:00:00.000Z"),
      await bundle("new", "2099-01-01T00:00:00.000Z"),
      await bundle("offline", null),
    ];
    await run(
      writeManifest(path.join(opts.datasetsDir, "d.yaml"), {
        name: "d",
        title: "Frozen",
        release: "2027.1",
        evalVersion: "2027.1.0",
        ranked: true,
        bundles,
      }),
    );
    await score();
    const { timing, rows } = await snapshot();
    expect(Object.values(timing?.items ?? {})).toEqual(ALL.map(() => frozen.committedAt));
    const labels = rows.map((r) => [
      r.provenance.submitters[0],
      timing?.rows[r.rowId]?.["math"]?.labels,
    ]);
    expect(Object.fromEntries(labels)).toEqual({
      old: { predates: 4, exposable: 0, unknown: 0 },
      new: { predates: 0, exposable: 4, unknown: 0 },
      offline: { predates: 0, exposable: 0, unknown: 4 },
    });
  });

  it("gives a draft dataset no timing", async () => {
    await manifest([await seal("r1", [exec("a", "4")])]);
    await score();
    expect((await snapshot()).timing).toBeNull();
  });
});
