import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect, Option } from "effect";
import { afterEach, beforeEach, expect, it } from "vitest";
import { freezeHardware } from "../legacy.js";

const run = <A, E>(eff: Effect.Effect<A, E, NodeContext.NodeContext>) =>
  Effect.runPromise(Effect.provide(eff, NodeContext.layer));

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "legacy-freeze-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const profile = { cpu: "Test CPU", cpuCores: 4, memoryGb: 16, os: "TestOS 1" };

it("a re-freeze keeps the machine the existing manifest pinned, profile included", async () => {
  const file = join(dir, "alpha.yaml");
  await writeFile(
    file,
    `name: alpha\ntitle: A\nrelease: "0"\nevalVersion: "0.7"\nranked: false\nlegacy:\n  hardware:\n    id: abc123abc123\n    profile:\n      cpu: Test CPU\n      cpuCores: 4\n      memoryGb: 16\n      os: TestOS 1\n  archives: {}\n`,
  );
  expect(await run(freezeHardware(Option.none(), file))).toEqual({ id: "abc123abc123", profile });
});

it("an explicit --legacy-hardware id wins over the manifest", async () => {
  expect(await run(freezeHardware(Option.some("unknown"), join(dir, "none.yaml")))).toEqual({
    id: "unknown",
  });
});

it("without a manifest, the default probes this machine", async () => {
  const hw = await run(freezeHardware(Option.none(), join(dir, "none.yaml")));
  expect(hw.id).toMatch(/^[0-9a-f]{12}$/);
  expect(hw).toHaveProperty("profile");
});
