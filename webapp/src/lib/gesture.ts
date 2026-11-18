// Pointer sequence → plot actions, as a pure reducer. The scatter feeds it
// pointer events (pixel positions, ms timestamps) and a `timeout` at
// `state.deadline`; it returns pan / zoom / tap actions and `end` when a
// gesture that moved the view finishes (time to write the URL).
//
// Mouse: click = tap (after the multi-click window, so a double-click never
// selects); double-click = zoom in at the pointer; triple-click = zoom out;
// drag = pan; press-and-drag on the second click = continuous zoom (up in,
// down out). Touch: tap at once; one finger pans; two pinch (zoom about their
// midpoint, panning with it); three swiping vertically zoom (up in, down out).

export type GestureEvent =
  | { type: "down" | "move" | "up" | "cancel"; id: number; x: number; y: number; t: number; touch: boolean; target?: string }
  | { type: "timeout"; t: number };

export type Action =
  | { kind: "pan"; dx: number; dy: number }
  /** factor > 1 zooms in, about pixel (x, y). */
  | { kind: "zoom"; factor: number; x: number; y: number }
  | { kind: "tap"; x: number; y: number; target?: string }
  | { kind: "end" };

type Pt = { x: number; y: number };
type Mode =
  | { k: "idle" }
  | { k: "press"; clicks: number; at: Pt; target?: string }
  | { k: "wait"; clicks: number; at: Pt; target?: string }
  | { k: "pan"; last: Pt }
  | { k: "dragzoom"; at: Pt; lastY: number }
  | { k: "spent" }
  | { k: "touch"; pts: Record<number, Pt>; start: Pt; target?: string; moved: boolean; max: number };

export interface GestureState {
  mode: Mode;
  /** When set, the caller sends `{ type: "timeout" }` at this time. */
  deadline: number | null;
}

export const IDLE: GestureState = { mode: { k: "idle" }, deadline: null };
/** Max gap between a release and the next press of a multi-click. */
export const MULTI_MS = 300;
const MULTI_PX = 12;
const SLOP_PX = 4;
/** Continuous zoom per pixel of vertical drag. */
const DRAG_ZOOM = 0.01;

const far = (a: Pt, b: Pt, d: number) => Math.hypot(a.x - b.x, a.y - b.y) > d;
const zoom = (factor: number, at: Pt): Action => ({ kind: "zoom", factor, x: at.x, y: at.y });
const tap = (at: Pt, target?: string): Action => ({ kind: "tap", x: at.x, y: at.y, ...(target === undefined ? {} : { target }) });
const idle = (actions: Action[]): [GestureState, Action[]] => [IDLE, actions];
const to = (mode: Mode, actions: Action[] = [], deadline: number | null = null): [GestureState, Action[]] => [
  { mode, deadline },
  actions,
];

const mean = (ps: Pt[]): Pt => ({
  x: ps.reduce((s, p) => s + p.x, 0) / ps.length,
  y: ps.reduce((s, p) => s + p.y, 0) / ps.length,
});

// What a pending multi-click resolves to when no further press comes.
const resolveWait = (m: Extract<Mode, { k: "wait" }>): Action[] =>
  m.clicks === 1 ? [tap(m.at, m.target)] : [zoom(2, m.at), { kind: "end" }];

const touchMove = (m: Extract<Mode, { k: "touch" }>, id: number, p: Pt): [GestureState, Action[]] => {
  const prev = m.pts;
  if (prev[id] === undefined) return to(m);
  const pts = { ...prev, [id]: p };
  const ids = Object.keys(pts).map(Number);
  const before = ids.map((i) => prev[i] as Pt);
  const after = ids.map((i) => pts[i] as Pt);
  if (ids.length === 1) {
    if (!m.moved && !far(p, m.start, SLOP_PX)) return to({ ...m, pts });
    const b = before[0] as Pt;
    return to({ ...m, pts, moved: true }, [{ kind: "pan", dx: p.x - b.x, dy: p.y - b.y }]);
  }
  const [m0, m1] = [mean(before), mean(after)];
  if (ids.length === 2) {
    const [a0, b0, a1, b1] = [before[0], before[1], after[0], after[1]] as Pt[];
    const ratio = Math.hypot(a1!.x - b1!.x, a1!.y - b1!.y) / Math.max(1, Math.hypot(a0!.x - b0!.x, a0!.y - b0!.y));
    return to({ ...m, pts, moved: true }, [{ kind: "pan", dx: m1.x - m0.x, dy: m1.y - m0.y }, zoom(ratio, m1)]);
  }
  if (ids.length === 3) return to({ ...m, pts, moved: true }, [zoom(Math.exp(-(m1.y - m0.y) * DRAG_ZOOM), m1)]);
  return to({ ...m, pts });
};

export const step = (s: GestureState, e: GestureEvent): [GestureState, Action[]] => {
  const m = s.mode;
  if (e.type === "timeout") return m.k === "wait" && s.deadline !== null && e.t >= s.deadline ? idle(resolveWait(m)) : [s, []];
  const p = { x: e.x, y: e.y };

  if (e.type === "cancel") return idle(m.k === "pan" || m.k === "dragzoom" || (m.k === "touch" && m.moved) ? [{ kind: "end" }] : []);

  if (e.touch) {
    if (e.type === "down") {
      if (m.k !== "touch") return to({ k: "touch", pts: { [e.id]: p }, start: p, target: e.target, moved: false, max: 1 });
      const pts = { ...m.pts, [e.id]: p };
      return to({ ...m, pts, max: Math.max(m.max, Object.keys(pts).length) });
    }
    if (m.k !== "touch") return [s, []];
    if (e.type === "move") return touchMove(m, e.id, p);
    const { [e.id]: _gone, ...pts } = m.pts;
    if (Object.keys(pts).length > 0) return to({ ...m, pts });
    return idle(m.moved ? [{ kind: "end" }] : m.max === 1 ? [tap(m.start, m.target)] : []);
  }

  switch (e.type) {
    case "down": {
      if (m.k === "wait") {
        if (s.deadline !== null && e.t <= s.deadline && !far(p, m.at, MULTI_PX))
          return to({ k: "press", clicks: m.clicks + 1, at: m.at, target: m.target });
        const [, pending] = idle(resolveWait(m));
        const [next, acts] = step(IDLE, e);
        return [next, [...pending, ...acts]];
      }
      return to({ k: "press", clicks: 1, at: p, target: e.target });
    }
    case "move":
      switch (m.k) {
        case "press":
          if (!far(p, m.at, SLOP_PX)) return [s, []];
          if (m.clicks === 1) return to({ k: "pan", last: p }, [{ kind: "pan", dx: p.x - m.at.x, dy: p.y - m.at.y }]);
          if (m.clicks === 2) return to({ k: "dragzoom", at: m.at, lastY: p.y }, [zoom(Math.exp(-(p.y - m.at.y) * DRAG_ZOOM), m.at)]);
          return to({ k: "spent" });
        case "pan":
          return to({ k: "pan", last: p }, [{ kind: "pan", dx: p.x - m.last.x, dy: p.y - m.last.y }]);
        case "dragzoom":
          return to({ ...m, lastY: p.y }, [zoom(Math.exp(-(p.y - m.lastY) * DRAG_ZOOM), m.at)]);
        default:
          return [s, []];
      }
    case "up":
      switch (m.k) {
        case "press":
          if (m.clicks >= 3) return idle([zoom(0.5, m.at), { kind: "end" }]);
          return to({ k: "wait", clicks: m.clicks, at: m.at, target: m.target }, [], e.t + MULTI_MS);
        case "pan":
        case "dragzoom":
          return idle([{ kind: "end" }]);
        default:
          return idle([]);
      }
  }
};
