// Pointer, wheel and key input → plot actions, as a pure reducer. The scatter
// feeds it events (pixel positions, ms timestamps) and a `timeout` at
// `state.deadline`; it returns pan / zoom / tap / box actions and `end` when a
// pointer gesture that moved the view finishes (time to write the URL).
//
// Mouse: click on a point = tap at once; click on the background = tap after
// the double-click window (so a zooming double-click keeps the selection);
// double-click = zoom in at the pointer; drag = pan; shift-drag = box zoom.
// Wheel: with ctrl/meta (a trackpad pinch arrives this way) zoom about the
// pointer, otherwise pan. Keys: + / = in, - out (about the given center),
// 0 reset, arrows pan. Touch: tap at once; one finger pans; two pinch (zoom
// about their midpoint, panning with it).

export type GestureEvent =
  | {
      type: "down" | "move" | "up" | "cancel";
      id: number;
      x: number;
      y: number;
      t: number;
      touch: boolean;
      target?: string;
      shift?: boolean;
    }
  /** `mode` is WheelEvent.deltaMode: 0 pixels, 1 lines, 2 pages. `zoom` = ctrl or meta held. */
  | { type: "wheel"; x: number; y: number; dx: number; dy: number; mode: number; zoom: boolean; t: number }
  /** (x, y) is the plot's center, where keyboard zoom anchors. */
  | { type: "key"; key: string; x: number; y: number; t: number }
  | { type: "timeout"; t: number };

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type Action =
  | { kind: "pan"; dx: number; dy: number }
  /** factor > 1 zooms in, about pixel (x, y). */
  | { kind: "zoom"; factor: number; x: number; y: number }
  /** The rubber band to draw while shift-dragging; null clears it. */
  | { kind: "box"; rect: Rect | null }
  /** Zoom so the pixel rect fills the plot. */
  | { kind: "zoomto"; rect: Rect }
  | { kind: "reset" }
  | { kind: "tap"; x: number; y: number; target?: string }
  | { kind: "end" };

type Pt = { x: number; y: number };
type Mode =
  | { k: "idle" }
  | { k: "press"; clicks: number; at: Pt; target?: string; shift: boolean }
  /** After one click: a second press within the window is a double-click; otherwise `pending` taps. */
  | { k: "wait"; at: Pt; target?: string; pending: boolean }
  | { k: "pan"; last: Pt }
  | { k: "box"; at: Pt; to: Pt }
  | { k: "touch"; pts: Record<number, Pt>; start: Pt; target?: string; moved: boolean; max: number };

export interface GestureState {
  mode: Mode;
  /** When set, the caller sends `{ type: "timeout" }` at this time. */
  deadline: number | null;
}

export const IDLE: GestureState = { mode: { k: "idle" }, deadline: null };
/** Max gap between a release and the next press of a double-click. */
export const MULTI_MS = 250;
const MULTI_PX = 12;
const SLOP_PX = 4;
/** A box narrower or shorter than this is a slip, not a zoom. */
export const MIN_BOX_PX = 8;
/** Wheel zoom per pixel of deltaY; a single event is capped so a mouse notch stays one gentle step. */
const WHEEL_ZOOM = 0.01;
const WHEEL_MAX_PX = 50;
const LINE_PX = 16;
const PAGE_PX = 400;
/** Arrow-key pan, in pixels. */
const KEY_PAN_PX = 40;
const KEY_ZOOM = 2;

const far = (a: Pt, b: Pt, d: number) => Math.hypot(a.x - b.x, a.y - b.y) > d;
const zoom = (factor: number, at: Pt): Action => ({ kind: "zoom", factor, x: at.x, y: at.y });
const tap = (at: Pt, target?: string): Action => ({ kind: "tap", x: at.x, y: at.y, ...(target === undefined ? {} : { target }) });
const rect = (a: Pt, b: Pt): Rect => ({ x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) });
const idle = (actions: Action[]): [GestureState, Action[]] => [IDLE, actions];
const to = (mode: Mode, actions: Action[] = [], deadline: number | null = null): [GestureState, Action[]] => [
  { mode, deadline },
  actions,
];

const mean = (ps: Pt[]): Pt => ({
  x: ps.reduce((s, p) => s + p.x, 0) / ps.length,
  y: ps.reduce((s, p) => s + p.y, 0) / ps.length,
});

const resolveWait = (m: Extract<Mode, { k: "wait" }>): Action[] => (m.pending ? [tap(m.at, m.target)] : []);

const KEYS: Record<string, (c: Pt) => Action> = {
  "+": (c) => zoom(KEY_ZOOM, c),
  "=": (c) => zoom(KEY_ZOOM, c),
  "-": (c) => zoom(1 / KEY_ZOOM, c),
  "0": () => ({ kind: "reset" }),
  ArrowLeft: () => ({ kind: "pan", dx: KEY_PAN_PX, dy: 0 }),
  ArrowRight: () => ({ kind: "pan", dx: -KEY_PAN_PX, dy: 0 }),
  ArrowUp: () => ({ kind: "pan", dx: 0, dy: KEY_PAN_PX }),
  ArrowDown: () => ({ kind: "pan", dx: 0, dy: -KEY_PAN_PX }),
};

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
  if (ids.length === 2) {
    const [m0, m1] = [mean(before), mean(after)];
    const [a0, b0, a1, b1] = [before[0], before[1], after[0], after[1]] as Pt[];
    const ratio = Math.hypot(a1!.x - b1!.x, a1!.y - b1!.y) / Math.max(1, Math.hypot(a0!.x - b0!.x, a0!.y - b0!.y));
    return to({ ...m, pts, moved: true }, [{ kind: "pan", dx: m1.x - m0.x, dy: m1.y - m0.y }, zoom(ratio, m1)]);
  }
  return to({ ...m, pts });
};

export const step = (s: GestureState, e: GestureEvent): [GestureState, Action[]] => {
  const m = s.mode;
  if (e.type === "timeout") return m.k === "wait" && s.deadline !== null && e.t >= s.deadline ? idle(resolveWait(m)) : [s, []];

  // Wheel and keys act at once and leave any pointer gesture as it was.
  if (e.type === "wheel") {
    const unit = e.mode === 1 ? LINE_PX : e.mode === 2 ? PAGE_PX : 1;
    if (e.zoom) {
      const dy = Math.max(-WHEEL_MAX_PX, Math.min(WHEEL_MAX_PX, e.dy * unit));
      return [s, dy === 0 ? [] : [zoom(Math.exp(-dy * WHEEL_ZOOM), e)]];
    }
    // Scrolling down / right shows what is below / right: the content moves the other way.
    return [s, e.dx === 0 && e.dy === 0 ? [] : [{ kind: "pan", dx: 0 - e.dx * unit, dy: 0 - e.dy * unit }]];
  }
  if (e.type === "key") {
    const act = KEYS[e.key];
    return [s, act === undefined ? [] : [act(e)]];
  }

  const p = { x: e.x, y: e.y };

  if (e.type === "cancel") {
    if (m.k === "box") return idle([{ kind: "box", rect: null }]);
    return idle(m.k === "pan" || (m.k === "touch" && m.moved) ? [{ kind: "end" }] : []);
  }

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

  const shift = e.shift === true;
  switch (e.type) {
    case "down": {
      if (m.k === "wait") {
        if (s.deadline !== null && e.t <= s.deadline && !far(p, m.at, MULTI_PX))
          return to({ k: "press", clicks: 2, at: m.at, target: m.target, shift });
        const [, pending] = idle(resolveWait(m));
        const [next, acts] = step(IDLE, e);
        return [next, [...pending, ...acts]];
      }
      return to({ k: "press", clicks: 1, at: p, target: e.target, shift });
    }
    case "move":
      switch (m.k) {
        case "press":
          if (!far(p, m.at, SLOP_PX)) return [s, []];
          if (m.shift) return to({ k: "box", at: m.at, to: p }, [{ kind: "box", rect: rect(m.at, p) }]);
          return to({ k: "pan", last: p }, [{ kind: "pan", dx: p.x - m.at.x, dy: p.y - m.at.y }]);
        case "pan":
          return to({ k: "pan", last: p }, [{ kind: "pan", dx: p.x - m.last.x, dy: p.y - m.last.y }]);
        case "box":
          return to({ ...m, to: p }, [{ kind: "box", rect: rect(m.at, p) }]);
        default:
          return [s, []];
      }
    case "up":
      switch (m.k) {
        case "press":
          if (m.clicks >= 2) return idle([zoom(2, m.at), { kind: "end" }]);
          // A point selects at once; the background waits out the double-click window.
          if (m.target !== undefined) return to({ k: "wait", at: m.at, target: m.target, pending: false }, [tap(m.at, m.target)], e.t + MULTI_MS);
          return to({ k: "wait", at: m.at, pending: true }, [], e.t + MULTI_MS);
        case "pan":
          return idle([{ kind: "end" }]);
        case "box": {
          const r = rect(m.at, p);
          const clear: Action = { kind: "box", rect: null };
          if (r.x1 - r.x0 < MIN_BOX_PX || r.y1 - r.y0 < MIN_BOX_PX) return idle([clear]);
          return idle([clear, { kind: "zoomto", rect: r }, { kind: "end" }]);
        }
        default:
          return idle([]);
      }
  }
};
