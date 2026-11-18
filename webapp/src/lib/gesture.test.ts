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

type P = { target?: string; shift?: boolean };
const m = (type: "down" | "move" | "up", t: number, x: number, y: number, o: P = {}): GestureEvent =>
  ({ type, t, x, y, id: 1, touch: false, ...o }) as GestureEvent;
const touch = (type: "down" | "move" | "up", t: number, id: number, x: number, y: number): GestureEvent =>
  ({ type, t, x, y, id, touch: true }) as GestureEvent;
const click = (t: number, x = 100, y = 100, o: P = {}) => [m("down", t, x, y, o), m("up", t + 60, x, y, o)];
const kinds = (a: Action[]) => a.map((x) => x.kind);

describe("mouse", () => {
  it("a click on a point taps at once; on the background, after the double-click window", () => {
    const s0 = step(IDLE, m("down", 0, 100, 100, { target: "row-1" }))[0];
    expect(step(s0, m("up", 60, 100, 100, { target: "row-1" }))[1]).toEqual([{ kind: "tap", x: 100, y: 100, target: "row-1" }]);
    const b0 = step(IDLE, m("down", 0, 100, 100))[0];
    const [b1, now] = step(b0, m("up", 60, 100, 100));
    expect(now).toEqual([]);
    expect(b1.deadline).toBe(60 + MULTI_MS);
    expect(run(click(0))).toEqual([{ kind: "tap", x: 100, y: 100 }]);
  });

  it("double-click zooms in at the pointer at once, and a background double-click never taps", () => {
    expect(run([...click(0), ...click(200)])).toEqual([{ kind: "zoom", factor: 2, x: 100, y: 100 }, { kind: "end" }]);
    const s = [...click(0), ...click(200)].reduce((st, e) => step(st, e)[0], IDLE);
    expect(s.deadline).toBeNull();
  });

  it("a third click is a fresh click, not a zoom out", () => {
    expect(run([...click(0), ...click(200), ...click(400)])).toEqual([
      { kind: "zoom", factor: 2, x: 100, y: 100 },
      { kind: "end" },
      { kind: "tap", x: 100, y: 100 },
    ]);
  });

  it("double-click on a point taps once, then zooms", () => {
    expect(kinds(run([...click(0, 100, 100, { target: "r" }), ...click(200, 100, 100, { target: "r" })]))).toEqual(["tap", "zoom", "end"]);
  });

  it("clicks too far apart in time or space stay single", () => {
    expect(kinds(run([...click(0), ...click(60 + MULTI_MS + 1)]))).toEqual(["tap", "tap"]);
    expect(kinds(run([...click(0, 100, 100), ...click(200, 160, 100)]))).toEqual(["tap", "tap"]);
  });

  it("click-drag pans by the pointer delta and never taps", () => {
    const a = run([m("down", 0, 100, 100), m("move", 20, 110, 95), m("move", 40, 130, 90), m("up", 60, 130, 90)]);
    expect(a).toEqual([{ kind: "pan", dx: 10, dy: -5 }, { kind: "pan", dx: 20, dy: -5 }, { kind: "end" }]);
  });

  it("press-drag on a second click pans too", () => {
    expect(kinds(run([...click(0), m("down", 200, 100, 100), m("move", 220, 100, 140), m("up", 240, 100, 140)]))).toEqual(["pan", "end"]);
  });

  it("shift-drag draws a box and zooms to it on release", () => {
    const sh = { shift: true };
    const a = run([m("down", 0, 100, 100, sh), m("move", 20, 150, 80, sh), m("move", 40, 200, 160, sh), m("up", 60, 200, 160, sh)]);
    expect(a).toEqual([
      { kind: "box", rect: { x0: 100, y0: 80, x1: 150, y1: 100 } },
      { kind: "box", rect: { x0: 100, y0: 100, x1: 200, y1: 160 } },
      { kind: "box", rect: null },
      { kind: "zoomto", rect: { x0: 100, y0: 100, x1: 200, y1: 160 } },
      { kind: "end" },
    ]);
  });

  it("a tiny shift-drag box is dropped; a shift-click is a click", () => {
    const sh = { shift: true };
    expect(run([m("down", 0, 100, 100, sh), m("move", 20, 106, 140, sh), m("up", 40, 106, 140, sh)]).at(-1)).toEqual({ kind: "box", rect: null });
    expect(kinds(run(click(0, 100, 100, sh)))).toEqual(["tap"]);
  });

  it("jitter under the slop stays a click", () => {
    expect(kinds(run([m("down", 0, 100, 100), m("move", 10, 102, 101), m("up", 20, 102, 101)]))).toEqual(["tap"]);
  });
});

const wheel = (dx: number, dy: number, zoom: boolean, mode = 0): GestureEvent => ({ type: "wheel", t: 0, x: 120, y: 80, dx, dy, mode, zoom });

describe("wheel", () => {
  it("plain wheel pans the other way from the scroll", () => {
    expect(step(IDLE, wheel(10, -20, false))[1]).toEqual([{ kind: "pan", dx: -10, dy: 20 }]);
    expect(step(IDLE, wheel(0, 3, false, 1))[1]).toEqual([{ kind: "pan", dx: 0, dy: -48 }]);
  });

  it("ctrl/meta wheel (and trackpad pinch) zooms about the pointer: up in, down out", () => {
    const [, [inn]] = step(IDLE, wheel(0, -5, true));
    expect(inn).toMatchObject({ kind: "zoom", x: 120, y: 80 });
    expect((inn as { factor: number }).factor).toBeCloseTo(Math.exp(0.05));
    const [, [out]] = step(IDLE, wheel(0, 5, true));
    expect((out as { factor: number }).factor).toBeLessThan(1);
  });

  it("one wheel event zooms by a bounded step, in lines or pixels", () => {
    const f = (dy: number, mode: number) => (step(IDLE, wheel(0, dy, true, mode))[1][0] as { factor: number }).factor;
    expect(f(-1000, 0)).toBeCloseTo(Math.exp(0.5));
    expect(f(-1, 1)).toBeCloseTo(Math.exp(0.16));
  });

  it("does not disturb a gesture in progress", () => {
    const s = step(IDLE, m("down", 0, 100, 100))[0];
    expect(step(s, wheel(0, 5, false))[0]).toBe(s);
  });
});

describe("keys", () => {
  const key = (k: string): Action[] => step(IDLE, { type: "key", key: k, x: 300, y: 200, t: 0 })[1];
  it("+ / = zoom in and - zooms out about the given center; 0 resets", () => {
    expect(key("+")).toEqual([{ kind: "zoom", factor: 2, x: 300, y: 200 }]);
    expect(key("=")).toEqual(key("+"));
    expect(key("-")).toEqual([{ kind: "zoom", factor: 0.5, x: 300, y: 200 }]);
    expect(key("0")).toEqual([{ kind: "reset" }]);
  });

  it("arrows pan toward the arrow; other keys do nothing", () => {
    expect(key("ArrowRight")).toEqual([{ kind: "pan", dx: -40, dy: 0 }]);
    expect(key("ArrowUp")).toEqual([{ kind: "pan", dx: 0, dy: 40 }]);
    expect(key("a")).toEqual([]);
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

  it("three fingers do nothing", () => {
    const a = run([
      touch("down", 0, 1, 100, 200),
      touch("down", 2, 2, 150, 200),
      touch("down", 4, 3, 200, 200),
      touch("move", 20, 1, 100, 140),
      touch("move", 21, 2, 150, 140),
      touch("move", 22, 3, 200, 140),
      touch("up", 40, 1, 100, 140),
      touch("up", 41, 2, 150, 140),
      touch("up", 42, 3, 200, 140),
    ]);
    expect(a).toEqual([]);
  });
});
