import { describe, expect, it } from "vitest";
import { fitXDomain, fitYDomain, paretoFrontier, placeLabels, pointLabels } from "./scatter-layout";
import { shortModelName } from "./data";
import type { ScatterPoint } from "./pipeline";

const pt = (o: Partial<ScatterPoint>): ScatterPoint => ({
  config_hash: "h", artifact: "org/Model-7B-4bit", family: "Qwen", runtime: "omlx", quant: "4bit",
  temperature: 0, x: 1000, y: 0.5, efficiency: null, sizeB: 7, peak_memory_gb: 4,
  generation_tps: 50, wall_time_sec: 60, ...o,
});

describe("fitYDomain", () => {
  it("snaps a tight high cluster to 5% steps, capped at 100%", () => {
    const d = fitYDomain([0.78, 0.85, 0.99]);
    expect(d.min).toBe(0.75);
    expect(d.max).toBe(1);
    expect(d.ticks).toEqual([0.75, 0.8, 0.85, 0.9, 0.95, 1]);
  });
  it("keeps 20% ticks for a full spread", () => {
    expect(fitYDomain([0, 1])).toEqual({ min: 0, max: 1, ticks: [0, 0.2, 0.4, 0.6, 0.8, 1] });
  });
  it("opens a non-empty domain for one point / all-equal / edges", () => {
    for (const ys of [[0.5], [0.5, 0.5], [1, 1], [0, 0]]) {
      const d = fitYDomain(ys);
      expect(d.max).toBeGreaterThan(d.min);
      expect(d.min).toBeGreaterThanOrEqual(0);
      expect(d.max).toBeLessThanOrEqual(1);
      for (const y of ys) expect(y >= d.min && y <= d.max).toBe(true);
    }
  });
  it("falls back to 0–100% with no points", () => {
    expect(fitYDomain([]).min).toBe(0);
    expect(fitYDomain([]).max).toBe(1);
  });
});

describe("fitXDomain", () => {
  it("snaps to nice log stops around the data", () => {
    const d = fitXDomain([120_000, 300_000, 1_600_000]);
    expect(d.min).toBe(100_000);
    expect(d.max).toBe(2_000_000);
    expect(d.ticks).toEqual([100_000, 200_000, 300_000, 500_000, 1_000_000, 2_000_000]);
  });
  it("pads a value sitting exactly on a stop", () => {
    const d = fitXDomain([100_000]);
    expect(d.min).toBeLessThan(100_000);
    expect(d.max).toBeGreaterThan(100_000);
  });
  it("thins to 1/3 per decade over wide spans", () => {
    expect(fitXDomain([150, 900_000]).ticks).toEqual([100, 300, 1000, 3000, 10_000, 30_000, 100_000, 300_000, 1_000_000]);
  });
  it("ignores non-positive values; falls back when none remain", () => {
    expect(fitXDomain([0, -5, 500_000]).min).toBe(300_000);
    expect(fitXDomain([0]).min).toBe(100);
    expect(fitXDomain([]).max).toBe(100000);
  });
});

describe("paretoFrontier", () => {
  it("keeps points not dominated on (more pass, fewer tokens), sorted by x", () => {
    const a = pt({ config_hash: "a", x: 100, y: 0.5 });
    const b = pt({ config_hash: "b", x: 200, y: 0.8 });
    const c = pt({ config_hash: "c", x: 300, y: 0.7 }); // dominated by b
    const d = pt({ config_hash: "d", x: 400, y: 0.9 });
    const e = pt({ config_hash: "e", x: 200, y: 0.6 }); // dominated by b (equal x)
    expect(paretoFrontier([d, c, b, a, e]).map((p) => p.config_hash)).toEqual(["a", "b", "d"]);
  });
  it("keeps exact duplicates and handles 0/1 points", () => {
    expect(paretoFrontier([])).toEqual([]);
    expect(paretoFrontier([pt({})])).toHaveLength(1);
    expect(paretoFrontier([pt({ config_hash: "a" }), pt({ config_hash: "b" })])).toHaveLength(2);
  });
});

describe("shortModelName / pointLabels", () => {
  it("strips org, path, and quant/packaging noise", () => {
    expect(shortModelName("mlx-community/Qwen3-Coder-30B-A3B-Instruct-4bit")).toBe("Qwen3-Coder-30B-A3B");
    expect(shortModelName("bartowski/nvidia_Llama-3.1-Nemotron-Nano-8B-v1-GGUF")).toBe("Llama-3.1-Nemotron-Nano-8B-v1");
    expect(shortModelName("mlx-community/gpt-oss-20b-MXFP4-Q4")).toBe("gpt-oss-20b");
    expect(shortModelName("~/.omlx/models/Qwen3.8-27B-4bit-MTP")).toBe("Qwen3.8-27B-MTP");
    expect(shortModelName("unsloth/gemma-4-31B-it-GGUF")).toBe("gemma-4-31B");
    expect(shortModelName("qwen")).toBe("qwen");
  });
  it("disambiguates shared short names with quant, then runtime, then temperature", () => {
    const labels = pointLabels([
      pt({ config_hash: "a", artifact: "x/Q-27B-4bit", quant: "4bit", runtime: "mlx", temperature: 0.7 }),
      pt({ config_hash: "b", artifact: "x/Q-27B-4bit", quant: "4bit", runtime: "omlx", temperature: 0.7 }),
      pt({ config_hash: "c", artifact: "x/Q-27B-4bit", quant: "4bit", runtime: "omlx", temperature: 1 }),
      pt({ config_hash: "d", artifact: "y/Q-27B-MLX-6bit", quant: "6bit" }),
    ]);
    expect([...labels.values()]).toEqual(["Q-27B 4bit mlx", "Q-27B 4bit omlx t0.7", "Q-27B 4bit omlx t1", "Q-27B 6bit"]);
  });
  it("adds only the quant when that suffices", () => {
    const labels = pointLabels([
      pt({ config_hash: "a", artifact: "x/Q-27B-4bit", quant: "4bit" }),
      pt({ config_hash: "b", artifact: "y/Q-27B-MLX-6bit", quant: "6bit" }),
      pt({ config_hash: "c", artifact: "x/Other-4bit" }),
    ]);
    expect([...labels.values()]).toEqual(["Q-27B 4bit", "Q-27B 6bit", "Other"]);
  });
});

describe("placeLabels", () => {
  const bounds = { x0: 0, y0: 0, x1: 500, y1: 500 };
  const cand = (key: string, cx: number, cy: number, required = false) =>
    ({ key, text: "label", cx, cy, r: 5, required });

  it("places right of the marker when clear", () => {
    expect(placeLabels([cand("a", 100, 100)], bounds)).toEqual([
      { key: "a", text: "label", x: 108, y: 100, anchor: "start" },
    ]);
  });
  it("nudges a line up/down before giving up", () => {
    // req/req2 take the right and left slots at marker height; opt must move.
    const placed = placeLabels([cand("req", 100, 100, true), cand("req2", 100, 101, true), cand("opt", 100, 102)], bounds);
    expect(placed.map((p) => p.key)).toContain("opt");
    expect(Math.abs(placed.find((p) => p.key === "opt")!.y - 102)).toBe(12);
  });
  it("flips left at the right edge", () => {
    expect(placeLabels([cand("a", 495, 100)], bounds)[0]!.anchor).toBe("end");
  });
  it("skips an optional label that would collide, but always draws required ones", () => {
    const placed = placeLabels(
      [cand("opt", 100, 100), cand("req", 100, 102, true), cand("req2", 101, 101, true)],
      { ...bounds, y0: 94, y1: 108 }, // too short for the up/down nudges
    );
    expect(placed.map((p) => p.key).sort()).toEqual(["req", "req2"]);
  });
});
