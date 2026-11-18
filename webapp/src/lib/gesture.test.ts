import { describe, expect, it } from "vitest";
import { type Action, type GestureEvent, IDLE, MULTI_MS, step } from "./gesture";

// Feed a sequence, firing the recognizer's own deadline whenever the next event comes after it.
const run = (events: GestureEvent[]): Action[] => {
  let s = IDLE;
  const out: Action[] = [];
  const feed = (e: GestureEvent) => {
    const [n, a] = step(s, e);
    s = n;
    out.push(...a);
  };
  for (const e of events) {
    if (s.deadline !== null && e.t >= s.deadline) feed({ type: "timeout", t: s.deadline });
    feed(e);
  }
  if (s.deadline !== null) feed({ type: "timeout", t: s.deadline });
  return out;
};

type P = { target?: string };
const m = (type: "down" | "move" | "up", t: number, x: number, y: number, o: P = {}): GestureEvent =>
  ({ type, t, x, y, id: 1, touch: false, ...o }) as GestureEvent;
const touch = (type: "down" | "move" | "up", t: number, id: number, x: number, y: number): GestureEvent =>
  ({ type, t, x, y, id, touch: true }) as GestureEvent;
const click = (t: number, x = 100, y = 100, o: P = {}) => [m("down", t, x, y, o), m("up", t + 60, x, y, o)];
const kinds = (a: Action[]) => a.map((x) => x.kind);

describe("mouse", () => {
  it("a single click taps its target after the multi-click window", () => {
    expect(run(click(0, 100, 100, { target: "row-1" }))).toEqual([{ kind: "tap", x: 100, y: 100, target: "row-1" }]);
  });

  it("double-click zooms in at the pointer; triple-click zooms out", () => {
    expect(run([...click(0), ...click(200)])).toEqual([{ kind: "zoom", factor: 2, x: 100, y: 100 }, { kind: "end" }]);
    expect(run([...click(0), ...click(200), ...click(400)])).toEqual([{ kind: "zoom", factor: 0.5, x: 100, y: 100 }, { kind: "end" }]);
  });

  it("clicks too far apart in time or space stay single", () => {
    expect(kinds(run([...click(0), ...click(60 + MULTI_MS + 1)]))).toEqual(["tap", "tap"]);
    expect(kinds(run([...click(0, 100, 100), ...click(200, 160, 100)]))).toEqual(["tap", "tap"]);
  });

  it("click-drag pans by the pointer delta and never taps", () => {
    const a = run([m("down", 0, 100, 100), m("move", 20, 110, 95), m("move", 40, 130, 90), m("up", 60, 130, 90)]);
    expect(a).toEqual([{ kind: "pan", dx: 10, dy: -5 }, { kind: "pan", dx: 20, dy: -5 }, { kind: "end" }]);
  });

  it("double-click-then-drag zooms continuously about the press: up zooms in, down zooms out", () => {
    const up = run([...click(0), m("down", 200, 100, 100), m("move", 220, 100, 80), m("move", 240, 100, 60), m("up", 260, 100, 60)]);
    expect(kinds(up)).toEqual(["zoom", "zoom", "end"]);
    for (const z of up.slice(0, 2)) expect(z).toMatchObject({ x: 100, y: 100 });
    expect((up[0] as { factor: number }).factor).toBeGreaterThan(1);
    const down = run([...click(0), m("down", 200, 100, 100), m("move", 220, 100, 140), m("up", 240, 100, 140)]);
    expect((down[0] as { factor: number }).factor).toBeLessThan(1);
  });

  it("jitter under the slop stays a click", () => {
    expect(kinds(run([m("down", 0, 100, 100), m("move", 10, 102, 101), m("up", 20, 102, 101)]))).toEqual(["tap"]);
  });
});

describe("touch", () => {
  it("one finger: a tap taps at once, a drag pans", () => {
    expect(run([touch("down", 0, 1, 50, 50), touch("up", 50, 1, 50, 50)])).toEqual([{ kind: "tap", x: 50, y: 50 }]);
    expect(kinds(run([touch("down", 0, 1, 50, 50), touch("move", 20, 1, 70, 50), touch("up", 40, 1, 70, 50)]))).toEqual(["pan", "end"]);
  });

  it("pinch zooms by the finger distance ratio about their midpoint", () => {
    const a = run([
      touch("down", 0, 1, 100, 100),
      touch("down", 5, 2, 200, 100),
      touch("move", 20, 2, 300, 100),
      touch("up", 40, 2, 300, 100),
      touch("up", 45, 1, 100, 100),
    ]);
    const z = a.find((x) => x.kind === "zoom");
    expect(z).toMatchObject({ kind: "zoom", x: 200, y: 100 });
    expect((z as { factor: number }).factor).toBeCloseTo(2);
    expect(a.at(-1)).toEqual({ kind: "end" });
    expect(kinds(a)).not.toContain("tap");
  });

  it("three-finger vertical swipe: up zooms in, down zooms out", () => {
    const three = (dy: number) =>
      run([
        touch("down", 0, 1, 100, 200),
        touch("down", 2, 2, 150, 200),
        touch("down", 4, 3, 200, 200),
        touch("move", 20, 1, 100, 200 + dy),
        touch("move", 21, 2, 150, 200 + dy),
        touch("move", 22, 3, 200, 200 + dy),
        touch("up", 40, 1, 100, 200 + dy),
        touch("up", 41, 2, 150, 200 + dy),
        touch("up", 42, 3, 200, 200 + dy),
      ]).filter((x) => x.kind === "zoom") as { factor: number }[];
    const product = (zs: { factor: number }[]) => zs.reduce((p, z) => p * z.factor, 1);
    expect(product(three(-60))).toBeGreaterThan(1.5);
    expect(product(three(60))).toBeLessThan(1 / 1.5);
  });
});
