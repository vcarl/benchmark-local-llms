import { describe, expect, it } from "vitest";
import type { ResolvedChallenge } from "../config/challenges.js";
import type { Row } from "../legacy/rows.js";
import { sha256Hex } from "../store/digest.js";
import { frozenAt, hasTiming, timingLabel, timingOf } from "./timing.js";

describe("timingLabel", () => {
  const item = "2027-02-01T12:00:00.000Z";
  it("compares the weights' and the item's UTC days", () => {
    expect(timingLabel(item, "2027-01-31T23:59:59.000Z")).toBe("predates");
    expect(timingLabel(item, "2027-02-02T00:00:00.000Z")).toBe("exposable");
    expect(timingLabel(item, "2027-02-01T00:00:01.000Z")).toBe("unknown");
    expect(timingLabel(item, "2027-02-01T23:00:00.000Z")).toBe("unknown");
    expect(timingLabel(item, null)).toBe("unknown");
    expect(timingLabel(item, undefined)).toBe("unknown");
  });
});

describe("timingOf (frozen release)", () => {
  const challenge = (id: string, prompts: string[]) =>
    ({
      id,
      items: prompts.map((p, n) => ({ itemId: `i${n}`, prompt: { promptText: p } })),
    }) as unknown as ResolvedChallenge;
  const row = (rowId: string, sources: string[]) =>
    ({ rowId, cells: { ch: { status: "scored", sourceAttempts: sources } } }) as unknown as Row;
  const releases = [
    { release: "0", items: { "ch/a": { prompt: sha256Hex("old") } } },
    { release: "draft", items: { "ch/a": { prompt: sha256Hex("old") } } },
    {
      release: "2027.1",
      committedAt: "2027-02-01T00:00:00.000Z",
      items: { "ch/i0": { prompt: sha256Hex("old") } },
    },
    {
      release: "2027.2",
      committedAt: "2027-05-01T00:00:00.000Z",
      items: { "ch/i0": { prompt: sha256Hex("old") }, "ch/i1": { prompt: sha256Hex("new") } },
    },
  ];
  const weights = (publishedAt: string | null) => ({ repo: "o/m", revision: "r", publishedAt });

  it("dates an item by the earliest frozen release holding its prompt", () => {
    const frozen = frozenAt(releases);
    expect(frozen.get(sha256Hex("old"))).toBe("2027-02-01T00:00:00.000Z");
    expect(frozen.get(sha256Hex("new"))).toBe("2027-05-01T00:00:00.000Z");
  });

  it("labels each counted cell against its bundle's weights date", () => {
    const t = timingOf(
      [row("a", ["b1"]), row("b", ["b2"]), row("c", ["b3"])],
      [challenge("ch", ["old", "new", "unreleased"])],
      frozenAt(releases),
      new Map([
        ["b1", weights("2027-03-01T00:00:00.000Z")],
        ["b2", weights(null)],
      ]),
    );
    expect(t.items).toEqual({
      "ch/i0": "2027-02-01T00:00:00.000Z",
      "ch/i1": "2027-05-01T00:00:00.000Z",
    });
    // Between the two freezes: exposable to i0, predates i1; i2 is in no frozen release.
    // b: the lookup failed; c: the bundle recorded no source. Both unknown.
    const none = { predates: 0, exposable: 0, unknown: 2 };
    expect(t.rows).toEqual({
      a: {
        ch: {
          weights: weights("2027-03-01T00:00:00.000Z"),
          labels: { predates: 1, exposable: 1, unknown: 0 },
        },
      },
      b: { ch: { weights: weights(null), labels: none } },
      c: { ch: { weights: null, labels: none } },
    });
  });

  it("gives alpha and draft no timing labels", () => {
    expect(hasTiming("0")).toBe(false);
    expect(hasTiming("draft")).toBe(false);
    expect(hasTiming("2027.1")).toBe(true);
  });
});
