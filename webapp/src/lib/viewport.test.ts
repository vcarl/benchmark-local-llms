import { describe, expect, it } from "vitest";
import { clampViewport, formatViewport, linTicks, logTicks, panViewport, parseViewport, zoomViewport, type Viewport } from "./viewport";

const FULL: Viewport = { x0: 1000, x1: 1_000_000, y0: 0, y1: 1 };

describe("viewport URL form", () => {
  it("round-trips at URL precision", () => {
    const v: Viewport = { x0: 12345.678, x1: 456789, y0: 0.55, y1: 0.9512 };
    const back = parseViewport(formatViewport(v));
    expect(back).toEqual({ x0: 12350, x1: 456800, y0: 0.55, y1: 0.9512 });
    expect(parseViewport(formatViewport(back!))).toEqual(back);
  });

  it("rejects malformed or inverted values", () => {
    for (const s of [undefined, "", "1,2,3", "a,b,c,d", "0,10,0,1", "10,5,0,1", "10,100,0.5,0.5"]) expect(parseViewport(s)).toBeUndefined();
  });
});

describe("zoom and pan", () => {
  it("zooms about a point: x in log space, y linear; the point stays put", () => {
    const v = zoomViewport(FULL, 2, 0.5, 0.5);
    expect(v.x0).toBeCloseTo(10 ** 3.75);
    expect(v.x1).toBeCloseTo(10 ** 5.25);
    expect([v.y0, v.y1]).toEqual([0.25, 0.75]);
    const corner = zoomViewport(FULL, 2, 0, 0);
    expect([corner.x0, corner.y0]).toEqual([1000, 0]);
  });

  it("pans by a fraction of the view", () => {
    const v = panViewport({ x0: 1000, x1: 10000, y0: 0.2, y1: 0.4 }, 1, 0.5);
    expect(v.x0).toBeCloseTo(10000);
    expect(v.y0).toBeCloseTo(0.3);
  });

  it("clamps into the full extent; a view as large as it is no viewport", () => {
    expect(clampViewport(zoomViewport(FULL, 0.5, 0.5, 0.5), FULL)).toBeUndefined();
    const v = clampViewport(panViewport(zoomViewport(FULL, 4, 0.5, 0.5), -10, 10), FULL)!;
    expect(v.x0).toBeCloseTo(1000);
    expect(v.y1).toBeCloseTo(1);
    expect(v.y1 - v.y0).toBeCloseTo(0.25);
    // Minimum span: 1 percentage point, a 2% ratio on x.
    const deep = clampViewport(zoomViewport(FULL, 1e6, 0.5, 0.5), FULL)!;
    expect(deep.y1 - deep.y0).toBeCloseTo(0.01);
    expect(Math.log10(deep.x1 / deep.x0)).toBeCloseTo(Math.log10(1.02));
  });
});

describe("ticks", () => {
  it("linear ticks use a 1/2/5 step inside the range", () => {
    expect(linTicks(0.55, 0.95)).toEqual([0.6, 0.7, 0.8, 0.9]);
    expect(linTicks(0.801, 0.83)).toEqual([0.81, 0.82, 0.83]);
  });

  it("log ticks thin across decades and refine inside one", () => {
    expect(logTicks(1000, 1_000_000)).toEqual([1000, 3000, 10000, 30000, 100000, 300000, 1000000]);
    expect(logTicks(20000, 90000)).toEqual([20000, 30000, 40000, 50000, 60000, 70000, 80000, 90000]);
    expect(logTicks(41000, 47000)).toEqual([42000, 44000, 46000]);
  });
});
