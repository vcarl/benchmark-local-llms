import { readdir, readFile } from "node:fs/promises";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, expect, it } from "vitest";
import { runMatrix } from "../run-matrix.js";
import {
  config,
  env,
  fakeDeps,
  fakeServerHandle,
  inertHttpClientLayer,
  makeChallenge,
  makeTempDir,
  okStub,
  removeDir,
} from "./fixtures.js";

let dir: string;
beforeEach(async () => {
  dir = await makeTempDir();
});
afterEach(async () => {
  await removeDir(dir);
});

const challengeA = { stem: "alpha", resolved: { ...makeChallenge(), id: "alpha" } };
const challengeB = { stem: "beta", resolved: { ...makeChallenge(), id: "beta" } };

it("boots the server ONCE per configuration and reuses it across challenges", async () => {
  let boots = 0;
  const deps = {
    ...fakeDeps(),
    llmServer: () => {
      boots += 1;
      return fakeServerHandle();
    },
  };
  const m = okStub();

  const cells = await Effect.runPromise(
    runMatrix({
      configs: [config],
      challenges: [challengeA, challengeB],
      store: dir,
      release: "draft",
      runId: "run-1",
      contributor: "tester",
      env,
      present: [],
      deps: deps as never,
    }).pipe(
      Effect.provide(m.layer),
      Effect.provide(inertHttpClientLayer),
      Effect.provide(NodeContext.layer),
    ),
  );

  expect(boots).toBe(1); // the proof: one model load for two challenges
  expect(cells).toHaveLength(2);
  expect(cells.map((c) => c.challengeStem)).toEqual(["alpha", "beta"]);
  // two sealed bundles written
  const files = await readdir(`${dir}/bundles`);
  expect(files.filter((f) => f.endsWith(".jsonl"))).toHaveLength(2);
});

it("isolates a boot failure: that row is SKIPPED, later configs still run", async () => {
  const configB = { ...config, id: "cfg-b", maxTokens: 129 };
  const deps = {
    ...fakeDeps(),
    llmServer: (model: { name: string }) =>
      model.name === config.id ? Effect.fail(new Error("boom")) : fakeServerHandle(),
  };
  const m = okStub();

  const cells = await Effect.runPromise(
    runMatrix({
      configs: [config, configB],
      challenges: [challengeA],
      store: dir,
      release: "draft",
      runId: "run-1",
      contributor: "tester",
      env,
      present: [],
      deps: deps as never,
    }).pipe(
      Effect.provide(m.layer),
      Effect.provide(inertHttpClientLayer),
      Effect.provide(NodeContext.layer),
    ),
  );

  const a = cells.find((c) => c.configId === config.id);
  const b = cells.find((c) => c.configId === "cfg-b");
  expect(a?.status).toBe("SKIPPED");
  expect(b?.status === "PASS" || b?.status === "FAIL").toBe(true);
});

it("stamps the probed runtime version into each bundle's env, probing once per runtime", async () => {
  const probes: string[] = [];
  const deps = {
    ...fakeDeps(),
    runtimeVersion: (rt: string) => {
      probes.push(rt);
      return Effect.succeed(`probed-${rt}`);
    },
  };
  await Effect.runPromise(
    runMatrix({
      configs: [config],
      challenges: [challengeA, challengeB],
      store: dir,
      release: "draft",
      runId: "run-1",
      contributor: "tester",
      env,
      present: [],
      deps: deps as never,
    }).pipe(
      Effect.provide(okStub().layer),
      Effect.provide(inertHttpClientLayer),
      Effect.provide(NodeContext.layer),
    ),
  );
  expect(probes).toEqual([config.runtime]);
  const files = (await readdir(`${dir}/bundles`)).filter((f) => f.endsWith(".jsonl"));
  expect(files).toHaveLength(2);
  for (const f of files) {
    const header = JSON.parse((await readFile(`${dir}/bundles/${f}`, "utf8")).split("\n")[0] ?? "");
    expect(header.env.runtimeVersion).toBe(`probed-${config.runtime}`);
  }
});
