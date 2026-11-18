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
  errataIdProblems,
  evalVersion,
  parseErratumId,
  ReleaseBaseline,
  releaseArgProblem,
  snapshotItems,
} from "./errata.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const id = (promptHash: string, scorerHash: string) => ({ promptHash, scorerHash });
const erratum = (over: Partial<Erratum>): Erratum => ({
  id: "0.1",
  date: "2026-11-16",
  kind: "scorer",
  items: ["c/a"],
  description: "d",
  scorerChange: true,
  releaseStatus: "none",
  ...over,
});

const ids = (...xs: string[]): Erratum[] => xs.map((id) => erratum({ id }));

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

  it("requires a releaseStatus erratum for a prompt change", () => {
    const cur = { ...base, "c/b": id("p9", "s2") };
    expect(coverageGaps(base, cur, [erratum({ items: ["c/b"] })])).toEqual([
      "c/b: prompt changed without an erratum (releaseStatus)",
    ]);
    expect(
      coverageGaps(base, cur, [erratum({ items: ["c/b"], releaseStatus: "next-release" })]),
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
        erratum({ id: "0.1", kind: "retired", items: ["c/b"], scorerChange: false }),
        erratum({ id: "0.2", kind: "added", items: ["c/z"], scorerChange: false }),
      ]),
    ).toEqual([]);
  });

  it("flags releasedIn out of step with releaseStatus", () => {
    expect(coverageGaps(base, base, [erratum({ releaseStatus: "released" })])).toEqual([
      "0.1: releasedIn is set iff releaseStatus is released",
    ]);
    expect(
      coverageGaps(base, base, [erratum({ releaseStatus: "released", releasedIn: "2027.1" })]),
    ).toEqual([]);
  });

  it("accepts an erratum naming an item that has left both snapshots", () => {
    expect(coverageGaps(base, base, [erratum({ kind: "retired", items: ["c/gone"] })])).toEqual([]);
  });
});

describe("parseErratumId", () => {
  it("splits <release>.<n> for the pre-release and CalVer releases", () => {
    expect(parseErratumId("0.7")).toEqual({ release: "0", n: 7 });
    expect(parseErratumId("2027.1.12")).toEqual({ release: "2027.1", n: 12 });
    expect(parseErratumId("2027.12.1")).toEqual({ release: "2027.12", n: 1 });
  });
  it("rejects other shapes", () => {
    for (const id of ["E-0001", "0", "0.0", "0.01", "2027.1", "2027.0.1", "2027.13.1", "1.1"]) {
      expect(parseErratumId(id)).toBeUndefined();
    }
  });
});

describe("errataIdProblems", () => {
  it("accepts contiguous ids from <release>.1 per release, older releases as history", () => {
    expect(errataIdProblems("0", ids("0.1", "0.2", "0.3"))).toEqual([]);
    expect(errataIdProblems("2027.1", ids("0.1", "0.2", "2027.1.1", "2027.1.2"))).toEqual([]);
    expect(errataIdProblems("2027.1", ids("0.1"))).toEqual([]);
  });
  it("flags malformed, duplicate, gapped, and future ids", () => {
    expect(errataIdProblems("0", ids("E-0001"))).toEqual(["E-0001: id is not <release>.<n>"]);
    expect(errataIdProblems("0", ids("0.1", "0.1"))).toEqual(["0.1: expected id 0.2"]);
    expect(errataIdProblems("0", ids("0.2"))).toEqual(["0.2: expected id 0.1"]);
    expect(errataIdProblems("0", ids("2027.1.1"))).toEqual([
      "2027.1.1: release 2027.1 is newer than the baseline release 0",
    ]);
  });
  it("flags a baseline release that is not a version", () => {
    expect(errataIdProblems("initial-main", [])).toEqual([
      "baseline release initial-main is not 0 or YYYY.M",
    ]);
  });
});

describe("evalVersion", () => {
  it("is the baseline release plus its errata count", () => {
    expect(evalVersion("0", ids("0.1", "0.2", "0.3"))).toBe("0.3");
    expect(evalVersion("2027.1", ids("0.1", "0.2", "2027.1.1"))).toBe("2027.1.1");
    expect(evalVersion("2027.1", ids("0.1"))).toBe("2027.1");
  });
});

describe("releaseArgProblem", () => {
  it("takes a CalVer release after the baseline release", () => {
    expect(releaseArgProblem("2027.1", "0")).toBeUndefined();
    expect(releaseArgProblem("2027.10", "2027.2")).toBeUndefined();
    expect(releaseArgProblem("2027.1", undefined)).toBeUndefined();
  });
  it("rejects other formats and releases not after the baseline", () => {
    for (const v of ["0", "v2027.1", "2027.01", "2027.13", "2027", "27.1", "2027.1.1"]) {
      expect(releaseArgProblem(v, "0")).toBe(`release ${v} is not YYYY.M (e.g. 2027.1)`);
    }
    expect(releaseArgProblem("2027.1", "2027.1")).toBe("release 2027.1 does not follow 2027.1");
    expect(releaseArgProblem("2026.12", "2027.1")).toBe("release 2026.12 does not follow 2027.1");
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
    expect(errataIdProblems(baseline.release, errata.errata)).toEqual([]);
  });
});
