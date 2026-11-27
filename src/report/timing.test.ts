import { describe, expect, it } from "vitest";
import { compareDays, timingLabel } from "./timing.js";

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
