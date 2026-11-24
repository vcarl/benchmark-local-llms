import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { verifyRelease } from "../release/release.js";
import {
  coverageGaps,
  Erratum,
  errataIdProblems,
  evalVersion,
  parseErratumId,
  parseEvalVersion,
  releaseArgProblem,
} from "./errata.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const id = (prompt: string, scorer: string) => ({ prompt, scorer });
const erratum = (over: Partial<Erratum>): Erratum => ({
  id: "0.1",
  date: "2026-11-16",
  kind: "scorer",
  items: ["c/a"],
  description: "d",
  scorerChange: true,
  scorers: {},
  scoresChanged: { lines: 0, configs: 0 },
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

  it("requires recorded scorers on a scorerChange erratum, the latest matching the item", () => {
    const cur = { ...base, "c/a": id("p1", "s9") };
    const { scorers: _, ...unrecorded } = erratum({});
    expect(coverageGaps(base, cur, [unrecorded])).toEqual(["0.1: scorers not recorded"]);
    expect(coverageGaps(base, cur, [erratum({ scorers: { "c/a": "s8" } })])).toEqual([
      "c/a: scorer is s9, erratum 0.1 recorded s8",
    ]);
    expect(
      coverageGaps(base, cur, [
        erratum({ scorers: { "c/a": "s8" } }),
        erratum({ id: "0.2", scorers: { "c/a": "s9" } }),
      ]),
    ).toEqual([]);
  });

  it("accepts an erratum naming an item that has left both snapshots", () => {
    expect(coverageGaps(base, base, [erratum({ kind: "retired", items: ["c/gone"] })])).toEqual([]);
  });
});

describe("Erratum", () => {
  const decode = Schema.decodeUnknownEither(Erratum);
  it("requires scoresChanged as counts of lines and configs", () => {
    const { scoresChanged: _, ...without } = erratum({});
    expect(decode(without)._tag).toBe("Left");
    for (const kind of ["answer-key", "scorer", "prompt-ambiguity", "retired", "added"] as const) {
      expect(decode(erratum({ kind, scoresChanged: { lines: 121, configs: 13 } }))._tag).toBe(
        "Right",
      );
    }
    expect(decode(erratum({ scoresChanged: { lines: -1, configs: 0 } }))._tag).toBe("Left");
    expect(decode(erratum({ scoresChanged: { lines: 1.5, configs: 1 } }))._tag).toBe("Left");
  });
});

describe("parseErratumId", () => {
  it("splits <release>.<n> for the alpha and YYYY.N releases", () => {
    expect(parseErratumId("0.7")).toEqual({ release: "0", n: 7 });
    expect(parseErratumId("2027.1.12")).toEqual({ release: "2027.1", n: 12 });
    expect(parseErratumId("2027.13.1")).toEqual({ release: "2027.13", n: 1 });
  });
  it("rejects other shapes", () => {
    for (const id of ["E-0001", "0", "0.0", "0.01", "2027.1", "2027.0.1", "2027.1.0", "1.1"]) {
      expect(parseErratumId(id)).toBeUndefined();
    }
  });
});

describe("parseEvalVersion", () => {
  it("takes n = 0 (before any erratum)", () => {
    expect(parseEvalVersion("2027.1.0")).toEqual({ release: "2027.1", n: 0 });
    expect(parseEvalVersion("0.7")).toEqual({ release: "0", n: 7 });
    expect(parseEvalVersion("2027.1")).toBeUndefined();
    expect(parseEvalVersion("2027.1.01")).toBeUndefined();
  });
});

describe("errataIdProblems", () => {
  it("accepts contiguous ids from <release>.1", () => {
    expect(errataIdProblems("0", ids("0.1", "0.2", "0.3"))).toEqual([]);
    expect(errataIdProblems("2027.1", ids("2027.1.1", "2027.1.2"))).toEqual([]);
    expect(errataIdProblems("2027.1", [])).toEqual([]);
  });
  it("flags malformed, duplicate, gapped, and other releases' ids", () => {
    expect(errataIdProblems("0", ids("E-0001"))).toEqual(["E-0001: id is not <release>.<n>"]);
    expect(errataIdProblems("0", ids("0.1", "0.1"))).toEqual(["0.1: expected id 0.2"]);
    expect(errataIdProblems("0", ids("0.2"))).toEqual(["0.2: expected id 0.1"]);
    expect(errataIdProblems("2027.1", ids("0.1"))).toEqual([
      "0.1: not an erratum of release 2027.1",
    ]);
  });
  it("rejects errata after the release closed", () => {
    expect(errataIdProblems("0", ids("0.1", "0.2"), "0.2")).toEqual([]);
    expect(errataIdProblems("0", ids("0.1", "0.2", "0.3"), "0.2")).toEqual([
      "0.3: release 0 closed at 0.2",
    ]);
    expect(errataIdProblems("0", [], "2027.1.0")).toEqual([
      "closed 2027.1.0 is not an eval version of release 0",
    ]);
  });
  it("flags a release that is not a version", () => {
    expect(errataIdProblems("initial-main", [])).toEqual([
      "release initial-main is not 0 or YYYY.N",
    ]);
  });
});

describe("evalVersion", () => {
  it("is the release plus its errata count, three-part for YYYY.N", () => {
    expect(evalVersion("0", ids("0.1", "0.2", "0.3"))).toBe("0.3");
    expect(evalVersion("2027.1", ids("2027.1.1"))).toBe("2027.1.1");
    expect(evalVersion("2027.1", [])).toBe("2027.1.0");
  });
});

describe("releaseArgProblem", () => {
  it("takes a YYYY.N release after the latest release", () => {
    expect(releaseArgProblem("2027.1", "0")).toBeUndefined();
    expect(releaseArgProblem("2027.10", "2027.2")).toBeUndefined();
    expect(releaseArgProblem("2027.13", "2027.12")).toBeUndefined();
    expect(releaseArgProblem("2027.1", undefined)).toBeUndefined();
  });
  it("rejects other formats and releases not after the latest", () => {
    for (const v of ["0", "v2027.1", "2027.01", "2027.0", "2027", "27.1", "2027.1.1", "draft"]) {
      expect(releaseArgProblem(v, "0")).toBe(`release ${v} is not YYYY.N (e.g. 2027.1)`);
    }
    expect(releaseArgProblem("2027.1", "2027.1")).toBe("release 2027.1 does not follow 2027.1");
    expect(releaseArgProblem("2026.12", "2027.1")).toBe("release 2026.12 does not follow 2027.1");
  });
});

const releasesDir = path.join(repoRoot, "releases");

// Release 0: errata cover every change since release.json (legacy 12-hex), ids
// in sequence up to `closed`, every recorded blob present. Draft: release.json
// in sync with its challenges (`./bench release sync draft`), every blob present.
describe.each(readdirSync(releasesDir))("releases/%s", (name) => {
  it("verifies: blobs, coverage and recorded scorers, commitment", async () => {
    const { problems } = await Effect.runPromise(
      verifyRelease(path.join(releasesDir, name)).pipe(Effect.provide(NodeFileSystem.layer)),
    );
    expect(problems).toEqual([]);
  });
});
