import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";
import * as YAML from "yaml";
import { loadSelectedChallenges } from "./challenges.js";
import {
  coverageGaps,
  ErrataFile,
  type Erratum,
  ReleaseBaseline,
  snapshotItems,
} from "./errata.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const id = (promptHash: string, scorerHash: string) => ({ promptHash, scorerHash });
const erratum = (over: Partial<Erratum>): Erratum => ({
  id: "E1",
  date: "2026-11-16",
  kind: "scorer",
  items: ["c/a"],
  description: "d",
  scorerChange: true,
  promptFix: "none",
  ...over,
});

describe("coverageGaps", () => {
  const base = { "c/a": id("p1", "s1"), "c/b": id("p2", "s2") };

  it("is empty when nothing changed", () => {
    expect(coverageGaps(base, base, [])).toEqual([]);
  });

  it("requires a scorerChange erratum for a scorer change", () => {
    const cur = { ...base, "c/a": id("p1", "s9") };
    expect(coverageGaps(base, cur, [])).toEqual([
      "c/a: scorer changed without an erratum (scorerChange: true)",
    ]);
    expect(coverageGaps(base, cur, [erratum({ scorerChange: false })])).toHaveLength(1);
    expect(coverageGaps(base, cur, [erratum({})])).toEqual([]);
  });

  it("requires a promptFix erratum for a prompt change", () => {
    const cur = { ...base, "c/b": id("p9", "s2") };
    expect(coverageGaps(base, cur, [erratum({ items: ["c/b"] })])).toEqual([
      "c/b: prompt changed without an erratum (promptFix)",
    ]);
    expect(
      coverageGaps(base, cur, [erratum({ items: ["c/b"], promptFix: "pending-next-release" })]),
    ).toEqual([]);
  });

  it("requires a retired erratum for a removed item and an added one for a new item", () => {
    const cur = { "c/a": id("p1", "s1"), "c/z": id("p3", "s3") };
    expect(coverageGaps(base, cur, [])).toEqual([
      "c/b: removed without an erratum",
      "c/z: added without an erratum",
    ]);
    expect(
      coverageGaps(base, cur, [
        erratum({ id: "E1", kind: "retired", items: ["c/b"], scorerChange: false }),
        erratum({ id: "E2", kind: "added", items: ["c/z"], scorerChange: false }),
      ]),
    ).toEqual([]);
  });

  it("flags duplicate ids and a release label out of step with promptFix", () => {
    expect(
      coverageGaps(base, base, [erratum({}), erratum({ promptFix: "fixed-in-release" })]).sort(),
    ).toEqual(["E1: release is set iff promptFix is fixed-in-release", "duplicate erratum id E1"]);
  });

  it("accepts an erratum naming an item that has left both snapshots", () => {
    expect(coverageGaps(base, base, [erratum({ kind: "retired", items: ["c/gone"] })])).toEqual([]);
  });
});

describe("repository errata", () => {
  it("cover every item change since the release baseline", async () => {
    const errata = Schema.decodeUnknownSync(ErrataFile)(
      YAML.parse(readFileSync(path.join(repoRoot, "errata.yaml"), "utf8")),
    );
    const baseline = Schema.decodeUnknownSync(ReleaseBaseline)(
      JSON.parse(readFileSync(path.join(repoRoot, "release-baseline.json"), "utf8")),
    );
    const { challenges } = await Effect.runPromise(
      loadSelectedChallenges(path.join(repoRoot, "challenges")).pipe(
        Effect.provide(NodeFileSystem.layer),
      ),
    );
    const current = snapshotItems(challenges.map((c) => c.resolved));
    expect(coverageGaps(baseline.items, current, errata.errata)).toEqual([]);
  });
});
