import { describe, expect, it } from "vitest";
import type { ScatterPoint } from "./encoding";
import { easeOutCubic, identityKeys, lerpFrame, type Frame } from "./tween";

const pt = (o: Partial<ScatterPoint>): ScatterPoint => ({
  id: "h", model: "m", artifact: "org/Model-7B-4bit", family: "Qwen", runtime: "omlx", quant: "4bit",
  temperature: 0, x: 1000, y: 0.5, yCI: null, peak_memory_gb: 4,
  generation_tps: 50, wall_time_sec: 60, ...o,
});

const frame = (points: ScatterPoint[], x = { min: 100, max: 10000 }, y = { min: 0, max: 1 }): Frame => ({
  points: points.map((p) => ({ ...p, alpha: 1 })),
  x,
  y,
});

describe("identityKeys", () => {
  it("keys by model|runtime|quant, numbering duplicates in id order", () => {
    const keys = identityKeys([
      pt({ id: "b", model: "m", quant: null }),
      pt({ id: "c", model: "m", runtime: "llama" }),
      pt({ id: "a", model: "m", quant: null }),
    ]);
    expect(keys.get("a")).toBe("m|omlx||0");
    expect(keys.get("b")).toBe("m|omlx||1");
    expect(keys.get("c")).toBe("m|llama|4bit|0");
  });
});

describe("easeOutCubic", () => {
  it("runs 0→1, fast first", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBe(0.875);
  });
});

describe("lerpFrame", () => {
  const from = frame([pt({ id: "old", x: 100, y: 0.2, peak_memory_gb: 4 })], { min: 10, max: 1000 }, { min: 0, max: 0.5 });
  const to = frame([pt({ id: "new", x: 10000, y: 0.6, peak_memory_gb: 8, wall_time_sec: 9000 }), pt({ id: "in", model: "z" })],
    { min: 1000, max: 100000 }, { min: 0.5, max: 1 });

  it("moves a matched point: x in log space, y and memory linearly, rest from the target", () => {
    const [p] = lerpFrame(from, to, 0.5).points;
    expect(p!.id).toBe("new");
    expect(p!.x).toBeCloseTo(1000);
    expect(p!.y).toBeCloseTo(0.4);
    expect(p!.peak_memory_gb).toBeCloseTo(6);
    expect(p!.wall_time_sec).toBe(9000);
    expect(p!.alpha).toBe(1);
  });

  it("fades an entering point in at its final position", () => {
    const p = lerpFrame(from, to, 0.25).points[1]!;
    expect(p.x).toBe(1000);
    expect(p.alpha).toBe(0.25);
  });

  it("carries a half-faded point's alpha on toward 1", () => {
    const mid = lerpFrame(from, to, 0.5);
    expect(lerpFrame(mid, to, 0.5).points[1]!.alpha).toBe(0.75);
  });

  it("lerps the x domain in log space and y linearly", () => {
    const f = lerpFrame(from, to, 0.5);
    expect(f.x.min).toBeCloseTo(100);
    expect(f.x.max).toBeCloseTo(10000);
    expect(f.y).toEqual({ min: 0.25, max: 0.75 });
  });

  it("lands exactly on the target at t=1", () => {
    expect(lerpFrame(from, to, 1)).toEqual(to);
  });
});
