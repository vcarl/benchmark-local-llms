import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeManifest } from "../../../dataset/manifest.js";
import { MESSAGES_DIGEST, makeDraftRelease } from "../../../release/__tests__/fixtures.js";
import { loadRelease } from "../../../release/release.js";
import { execution, header } from "../../../store/__tests__/fixtures.js";
import { appendExecution, createOpenBundle, sealBundle } from "../../../store/bundle.js";
import { digestOf } from "../../../store/digest.js";
import { readScores } from "../../../store/scores.js";
import { scoreDataset } from "../score.js";

const run = <A, E>(eff: Effect.Effect<A, E, NodeContext.NodeContext>) =>
  Effect.runPromise(eff.pipe(Effect.provide(NodeContext.layer)));

let root: string;
let releases: string;
let store: string;
let datasets: string;
beforeEach(async () => {
  ({ root, releases } = await makeDraftRelease());
  store = path.join(root, "store");
  datasets = path.join(root, "datasets");
  await fsp.mkdir(datasets);
});
afterEach(() => fsp.rm(root, { recursive: true, force: true }));

const exec = (item: string, output: string, runId = "run-1") => ({
  runId,
  e: execution(item, 0, {
    item: `math/${item}`,
    messagesDigest: MESSAGES_DIGEST[`math/${item}`] as string,
    output,
    rawOutput: output,
  }),
});

const seal = (runId: string, execs: ReadonlyArray<ReturnType<typeof exec>>) =>
  run(
    Effect.gen(function* () {
      const open = yield* createOpenBundle(store, header({ run: { ...header().run, id: runId } }));
      for (const { e } of execs) yield* appendExecution(open, e);
      return yield* sealBundle(store, open, "2026-01-01T00:01:00.000Z");
    }),
  );

const manifest = (bundles: string[]) =>
  run(
    writeManifest(path.join(datasets, "d.yaml"), {
      name: "d",
      title: "D",
      release: "draft",
      evalVersion: null,
      ranked: false,
      bundles,
    }),
  );

const score = () =>
  scoreDataset({
    name: "d",
    datasetsDir: datasets,
    store,
    releasesDir: releases,
    harnessGitSha: "x",
  });

describe("scoreDataset", () => {
  it("appends the missing score records at the dataset's eval version, idempotently", async () => {
    const one = await seal("run-1", [exec("a", "4"), exec("b", "4")]);
    await manifest([one]);
    expect(await run(score())).toEqual({ bundles: 1, appended: 2, present: 0 });

    const records = await run(readScores(store, one));
    const draft = await run(loadRelease(path.join(releases, "draft")));
    expect(records.map((r) => [r.scorer, r.score])).toEqual([
      [draft.file.items["math/a"]?.scorer, 1],
      [draft.file.items["math/b"]?.scorer, 0],
    ]);
    expect(records[0]?.execution).toBe(digestOf(exec("a", "4").e));

    expect(await run(score())).toEqual({ bundles: 1, appended: 0, present: 2 });
    expect(await run(readScores(store, one))).toEqual(records);

    const two = await seal("run-2", [exec("chain#1", "2"), exec("chain#2", "5")]);
    await manifest([one, two]);
    expect(await run(score())).toEqual({ bundles: 2, appended: 2, present: 2 });
    expect(await run(readScores(store, one))).toEqual(records);
    expect((await run(readScores(store, two))).map((r) => r.score)).toEqual([1, 0]);
  });

  it("grades nothing for a legacy manifest whose archives hold no lines", async () => {
    await fsp.writeFile(
      path.join(datasets, "d.yaml"),
      "name: d\ntitle: D\nrelease: draft\nevalVersion: null\nranked: true\nlegacy:\n  hardware: { id: unknown }\n  archives: {}\n",
    );
    expect(await run(score())).toEqual({ bundles: 0, appended: 0, present: 0 });
  });

  it("grades no execution whose prompt is not the release's current one", async () => {
    const one = await seal("run-1", [
      { runId: "run-1", e: execution("zz") },
      { runId: "run-1", e: { ...exec("a", "4").e, messagesDigest: "0".repeat(64) } },
    ]);
    await manifest([one]);
    expect(await run(score())).toEqual({ bundles: 1, appended: 0, present: 0 });
  });
});
