import { describe, expect, it } from "vitest";
import type { ResolvedChallenge } from "../config/challenges.js";
import type { Row } from "../legacy/rows.js";
import { sha256Hex } from "../store/digest.js";
import {
  compareDays,
  frozenAt,
  hasTiming,
  type TimingInputs,
  timingLabel,
  timingOf,
} from "./timing.js";

describe("compareDays", () => {
  it("compares dates at their precision", () => {
    expect(compareDays("2025-06", "2025-07-01")).toBe(-1);
    expect(compareDays("2025-06", "2025-06-30")).toBe(0);
    expect(compareDays("2025", "2025-03-04")).toBe(0);
    expect(compareDays("2026-02-29".slice(0, 7), "2026-03-01")).toBe(-1);
    expect(compareDays("2026-03-02", "2026-03-01")).toBe(1);
  });
});

describe("timingLabel", () => {
  const item = "2026-06-20";
  it("labels each case", () => {
    expect(timingLabel(null, { released: "2027-01-01" })).toBe("unpublished");
    expect(timingLabel(undefined, { released: "2020-01-01" })).toBe("unknown");
    expect(timingLabel(item, undefined)).toBe("unknown");
    expect(timingLabel(item, {})).toBe("unknown");
    expect(timingLabel(item, { released: "2026-06-19" })).toBe("predates");
    expect(timingLabel(item, { released: "2026-06-20" })).toBe("unknown");
    expect(timingLabel(item, { released: "2026-06" })).toBe("unknown");
    expect(timingLabel(item, { released: "2026-07-01", cutoff: "2026-05" })).toBe("cutoff-claimed");
    expect(timingLabel(item, { released: "2026-07-01", cutoff: "2026-06" })).toBe("exposable");
    expect(timingLabel(item, { released: "2026-07-01" })).toBe("exposable");
  });
});

describe("timingOf (frozen release)", () => {
  const challenge = (id: string, prompts: string[]) =>
    ({
      id,
      items: prompts.map((p, n) => ({ itemId: `i${n}`, prompt: { promptText: p } })),
    }) as unknown as ResolvedChallenge;
  const row = { rowId: "r", modelKey: "m", cells: { ch: { status: "scored" } } } as unknown as Row;
  const inputs = (published: Record<string, string>): TimingInputs => ({
    items: {
      digest: "d",
      value: {
        asOf: "2027-06-01T00:00:00Z",
        source: "s",
        items: Object.fromEntries(
          Object.entries(published).map(([p, at]) => [
            sha256Hex(p),
            { publishedAt: at, evidence: "e" },
          ]),
        ),
      },
    },
    models: { digest: "d", value: { m: { released: "2027-03-01", releasedSource: "u" } } },
  });
  const releases = [
    { release: "0", items: { "ch/a": { prompt: sha256Hex("early") } } },
    { release: "draft", items: { "ch/a": { prompt: sha256Hex("early") } } },
    {
      release: "2027.1",
      committedAt: "2027-02-01T00:00:00Z",
      items: {
        "ch/i0": { prompt: sha256Hex("early") },
        "ch/i1": { prompt: sha256Hex("late") },
        "ch/i2": { prompt: sha256Hex("secret") },
      },
    },
    {
      release: "2027.2",
      committedAt: "2027-05-01T00:00:00Z",
      items: { "ch/i0": { prompt: sha256Hex("early") } },
    },
  ];

  it("dates an item by the later of its push and its first frozen release", () => {
    const frozen = frozenAt(releases);
    expect(frozen.get(sha256Hex("early"))).toBe("2027-02-01T00:00:00Z");
    const t = timingOf(
      [row],
      [challenge("ch", ["early", "late", "secret"])],
      inputs({ early: "2026-03-24T00:00:00Z", late: "2027-04-01T00:00:00Z" }),
      frozen,
    );
    // Pushed before the cut: dates to committedAt, before the 2027-03-01 weights (exposable).
    expect(t.items["ch/i0"]).toMatchObject({
      publishedAt: "2027-02-01T00:00:00Z",
      pushedAt: "2026-03-24T00:00:00Z",
    });
    // Pushed after the cut: dates to its push, after the weights (predates).
    expect(t.items["ch/i1"]?.publishedAt).toBe("2027-04-01T00:00:00Z");
    expect(t.items["ch/i2"]).toBeNull();
    expect(t.rows).toEqual({
      r: { ch: { unpublished: 1, predates: 1, "cutoff-claimed": 0, exposable: 1, unknown: 0 } },
    });
  });

  it("gives alpha and draft no timing labels", () => {
    expect(hasTiming("0")).toBe(false);
    expect(hasTiming("draft")).toBe(false);
    expect(hasTiming("2027.1")).toBe(true);
  });
});
