import { describe, expect, it } from "vitest";
import {
  detailUrl,
  altEntry,
  defaultEntry,
  setChipName,
  entryFor,
  indexCounts,
  INDEX_URL,
  parseIndex,
  releaseGroups,
  releaseHeading,
  shortDigest,
  snapshotUrl,
} from "./snapshots";
import { compareReleases } from "../../../src/config/release-order";

const entry = (over: Record<string, unknown> = {}) => ({
  dataset: "alpha",
  title: "Alpha challenge set",
  release: "0",
  evalVersion: "0.7",
  ranked: false,
  legacy: true,
  digest: "3ac6f0e1d2c3b4a5968778695a4b3c2d1e0f",
  rows: 109,
  challenges: 10,
  span: "2026-06-19 – 2026-08-27",
  ...over,
});

describe("snapshot urls", () => {
  it("are document-relative", () => {
    expect(INDEX_URL).toBe("./snapshots/index.json");
    expect(snapshotUrl("abc")).toBe("./snapshots/abc.json");
    expect(detailUrl("id1")).toBe("./snapshots/details/id1.json");
  });
});

describe("parseIndex", () => {
  it("keeps the file's order", () => {
    const r = parseIndex({ snapshots: [entry(), entry({ dataset: "draft", digest: "d" })] });
    expect(r?.map((e) => e.dataset)).toEqual(["alpha", "draft"]);
  });
  it("rejects a malformed or empty index", () => {
    expect(parseIndex({})).toBeNull();
    expect(parseIndex({ snapshots: [{ dataset: "x" }] })).toBeNull();
    expect(parseIndex({ snapshots: [] })).toBeNull();
    expect(parseIndex(null)).toBeNull();
  });
});

describe("entryFor", () => {
  const index = parseIndex({ snapshots: [entry(), entry({ dataset: "draft" })] }) ?? [];
  it("finds by label, else the default dataset", () => {
    expect(entryFor(index, "draft")?.dataset).toBe("draft");
    expect(entryFor(index, "nope")?.dataset).toBe("alpha");
    expect(entryFor([], "x")).toBeUndefined();
  });
  it("finds the label's current snapshot: its first entry", () => {
    const i = [entry({ digest: "aaaa1111" }), entry({ digest: "bbbb2222", evalVersion: "0.6" })] as never;
    expect(entryFor(i, "alpha")?.digest).toBe("aaaa1111");
  });
});

describe("releases", () => {
  const index = [
    entry({ digest: "a7" }),
    entry({ dataset: "2026-10", title: "Alpha 2026-10", digest: "b7" }),
    entry({ digest: "a6", evalVersion: "0.6" }),
    entry({ dataset: "draft", release: "draft", evalVersion: null, digest: "d" }),
  ] as never;
  it("groups each dataset's current snapshot under its release, in index order", () => {
    expect(releaseGroups(index).map((g) => [g.release, g.entries.map((e) => e.digest)])).toEqual([
      ["0", ["a7", "b7"]],
      ["draft", ["d"]],
    ]);
  });
  it("orders releases: alpha, YYYY.N numerically, the draft newest", () => {
    expect(["draft", "2027.10", "0", "2027.2", "2028.1"].sort(compareReleases)).toEqual([
      "0",
      "2027.2",
      "2027.10",
      "2028.1",
      "draft",
    ]);
  });
  it("defaults to the newest release's dataset, the draft counting as newest; the alt preset takes the next", () => {
    expect(defaultEntry(index)?.dataset).toBe("draft");
    expect(altEntry(index)?.digest).toBe("a7");
    const released = [...(index as unknown[]), entry({ dataset: "2027.1", release: "2027.1", digest: "r" })] as never;
    expect(defaultEntry(released)?.dataset).toBe("draft");
    expect(altEntry(released)?.dataset).toBe("2027.1");
    expect(defaultEntry([entry()] as never)?.dataset).toBe("alpha");
    expect(altEntry([entry()] as never)).toBeUndefined();
    expect(entryFor(index, "alpha")?.digest).toBe("a7");
  });
  it("names a dataset for its preset chip", () => {
    expect(setChipName(entry() as never)).toBe("Alpha set");
    expect(setChipName(entry({ release: "draft" }) as never)).toBe("Draft set");
    expect(setChipName(entry({ release: "2027.1" }) as never)).toBe("Release 2027.1");
  });
  it("names releases", () => {
    expect(releaseHeading("0")).toBe("Alpha challenge set · release 0");
    expect(releaseHeading("draft")).toBe("Pre-release (draft)");
    expect(releaseHeading("2027.1")).toBe("Release 2027.1");
  });
});

describe("index facts", () => {
  it("counts rows and challenges, then the eval version when present", () => {
    expect(indexCounts(entry({ rows: 1, challenges: 2, evalVersion: null }) as never)).toBe("1 row · 2 challenges");
    expect(indexCounts(entry() as never)).toBe("109 rows · 10 challenges · eval 0.7");
  });
  it("shortens a digest to 12 hex", () => {
    expect(shortDigest("3ac6f0e1d2c3b4a5968778")).toBe("3ac6f0e1d2c3");
  });
});
