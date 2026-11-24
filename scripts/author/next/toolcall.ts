// Tool calling, in prompt mode: each item shows a seeded catalog of tools as
// JSON Schema plus a request, and the answer is a JSON array of calls (or []),
// graded by the tool_calls check. Six behaviours (see
// docs/superpowers/specs/2026-11-19-toolcall-expansion-design.md): single
// call, tool choice at real catalog sizes, parallel calls, parallel calls
// over several tools, abstention, and multi-turn state with gold history.
// The screen keeps every key correct by construction: each call has exactly
// one accepting tool in the catalog, every value is stated in the
// conversation, no optional is set to its default, and no two calls coincide.

import { stableStringify } from "../../../src/config/hashing.js";
import type { ExpectedToolCall } from "../../../src/schema/constraints.js";
import { type AuthoredItem, chainItem } from "../emit.js";
import { type Generated, numbersIn, withMeta } from "./common.js";
import { type Rng, rngFor, variantMeta } from "./data-common.js";
import {
  type Args,
  AIRPORTS,
  CITIES,
  type CatalogTool,
  calCreate,
  calDelete,
  calList,
  compressFiles,
  type Domain,
  deleteFile,
  flightReserve,
  flightSearch,
  flightStatus,
  getCurrentWeather,
  getFileInfo,
  HAND,
  hhmm,
  isoDate,
  list,
  kubeListPods,
  kubeLogs,
  kubeRestart,
  type Lang,
  listFiles,
  OPS,
  type Op,
  type OpId,
  orderId,
  orderStatus,
  type Prop,
  resetPassword,
  searchFiles,
  searchUsers,
  setLights,
  setThermostat,
  type Tool,
  bankBalance,
  bankTransactions,
  bankTransfer,
  cancelOrder,
  trackPackage,
  updateUserRole,
  VENDORED,
} from "./toolcall-catalog.js";

export type { Tool };

const isObj = (v: unknown): v is Args => typeof v === "object" && v !== null && !Array.isArray(v);

/** Does `v` validate against `s`: required keys present, no unknown keys, strict types and enums. */
export const accepts = (s: Prop, v: unknown): boolean => {
  switch (s.type) {
    case "string":
      return typeof v === "string" && (s.enum === undefined || s.enum.includes(v));
    case "integer":
      return Number.isInteger(v);
    case "number":
      return typeof v === "number";
    case "boolean":
      return typeof v === "boolean";
    case "array":
      return Array.isArray(v) && v.every((x) => accepts(s.items, x));
    case "object":
      return (
        isObj(v) &&
        s.required.every((k) => k in v) &&
        Object.entries(v).every(([k, x]) => {
          const p = s.properties[k];
          return p !== undefined && accepts(p, x);
        })
      );
  }
};

/** String and number leaves of an argument value. */
const leaves = (v: unknown): (string | number)[] =>
  typeof v === "string" || typeof v === "number"
    ? [v]
    : Array.isArray(v)
      ? v.flatMap(leaves)
      : isObj(v)
        ? Object.values(v).flatMap(leaves)
        : [];

const norm = (s: string) => s.toLowerCase().replace(/_/g, " ");

export interface Call {
  name: string;
  arguments: Args;
}

export interface Draw {
  /** Every tool shown, at the time of the request. */
  catalog: Tool[];
  /** The gold calls; [] for an abstention. */
  calls: Call[];
  /** Everything the model has been told: earlier turns, tool results, this request. */
  text: string;
}

/** null if every call has exactly one accepting tool and only stated, non-default values; else the reason. */
export const screen = (d: Draw): string | null => {
  const nums = new Set(numbersIn(d.text).map(Number));
  const seen = new Set<string>();
  for (const c of d.calls) {
    const fits = d.catalog.filter((t) => accepts(t.parameters, c.arguments)).map((t) => t.name);
    if (fits.length !== 1 || fits[0] !== c.name)
      return `tools accepting the ${c.name} call: ${fits.join(", ") || "none"}`;
    for (const leaf of leaves(c.arguments)) {
      const stated = typeof leaf === "number" ? nums.has(leaf) : norm(d.text).includes(norm(leaf));
      if (!stated) return `argument value ${leaf} is not stated in the request`;
    }
    const tool = d.catalog.find((t) => t.name === c.name) as Tool;
    for (const [k, v] of Object.entries(c.arguments)) {
      const p = tool.parameters.properties[k];
      if (p !== undefined && "default" in p && p.default === v)
        return `optional ${k} set to its default`;
    }
    const id = stableStringify(c);
    if (seen.has(id)) return `duplicate call ${c.name}`;
    seen.add(id);
  }
  return null;
};

/** The tool_calls key for a gold call: unstated defaults are `optional`, "in any order" arrays `unordered`. */
export const expectedCall = (c: Call, catalog: readonly Tool[]): ExpectedToolCall => {
  const props = (catalog.find((t) => t.name === c.name) as Tool).parameters.properties;
  const optional = Object.fromEntries(
    Object.entries(props).flatMap(([k, p]) =>
      "default" in p && !(k in c.arguments) ? [[k, p.default]] : [],
    ),
  );
  const unordered = Object.keys(c.arguments).filter((k) =>
    props[k]?.description?.includes("in any order"),
  );
  return {
    name: c.name,
    arguments: c.arguments,
    ...(Object.keys(optional).length > 0 ? { optional } : {}),
    ...(unordered.length > 0 ? { unordered } : {}),
  };
};

// ── Catalog assembly ────────────────────────────────────────────────────────

/** BFCL live_multiple tools-per-item counts (2–10), the catalog-size distribution. */
const LIVE_SIZES: readonly [number, number][] = [
  [2, 224],
  [3, 302],
  [4, 176],
  [5, 195],
  [6, 78],
  [7, 33],
  [8, 18],
  [9, 11],
  [10, 16],
];
const liveSize = (rng: Rng): number => {
  let x = rng.int(
    1,
    LIVE_SIZES.reduce((s, [, w]) => s + w, 0),
  );
  for (const [n, w] of LIVE_SIZES) {
    x -= w;
    if (x <= 0) return n;
  }
  return 2;
};

const POOL: readonly CatalogTool[] = [...HAND, ...VENDORED];

/** `core` plus fillers from domains outside `exclude`, shuffled, `size` tools in all. */
const catalogOf = (
  rng: Rng,
  core: readonly Tool[],
  size: number,
  exclude: readonly Domain[],
): Tool[] => {
  const names = new Set(core.map((t) => t.name));
  const pool = POOL.filter((c) => !exclude.includes(c.domain) && !names.has(c.tool.name)).map(
    (c) => c.tool,
  );
  return rng.sample([...core, ...rng.sample(pool, Math.max(0, size - core.length))], size);
};

// ── Prompts ─────────────────────────────────────────────────────────────────
const json = (v: unknown) => JSON.stringify(v, null, 2);
const FORMAT =
  'Reply with only a JSON array of the tool calls that fulfil the request, each of the form {"name": "<tool name>", "arguments": {...}}, ' +
  'where "arguments" is a JSON object (not a string). When the request needs several calls, list them all. ' +
  "Reply with [] if no tool fits the request, or if the request does not give a value for a required argument: never guess one. " +
  "Include every required argument. Include an optional argument only if the request asks for a value for it; " +
  "otherwise leave it out and the tool applies its default. Give each value the type its schema declares: " +
  "JSON numbers for integer and number, true or false for boolean, and strings for string, copied exactly as written.";
const FORMAT_AGAIN =
  "Reply as before: only a JSON array of tool calls, or [] if no tool fits or a required value is missing.";

const catalogPrompt = (catalog: readonly Tool[], text: string) =>
  `You can call these tools (parameters are JSON Schema; "required" lists the required arguments, and "default" is the value used when an optional argument is left out):\n\n` +
  `${json(catalog)}\n\nRequest: ${text}\n\n${FORMAT}`;

// ── Answers ─────────────────────────────────────────────────────────────────
const answer = (calls: readonly Call[]) => JSON.stringify(calls);

/** Plausible wrong answers derived from the gold calls (every one scores below 1). */
const mutations = (calls: readonly Call[], catalog: readonly Tool[]): string[] => {
  const [first, ...rest] = calls;
  if (first === undefined) return ["None of these tools can do that."];
  const tool = catalog.find((t) => t.name === first.name) as Tool;
  const out: unknown[] = [
    [],
    [first, first, ...rest],
    [{ ...first, arguments: JSON.stringify(first.arguments) }, ...rest],
  ];
  if (rest.length > 0) out.push([first]);
  const req = tool.parameters.required[0];
  if (req !== undefined) {
    const { [req]: _drop, ...args } = first.arguments;
    out.push([{ ...first, arguments: args }, ...rest]);
  }
  const retyped = Object.entries(first.arguments).find(
    ([, v]) =>
      typeof v === "number" || typeof v === "boolean" || (typeof v === "string" && /^\d+$/.test(v)),
  );
  if (retyped !== undefined) {
    const [k, v] = retyped;
    out.push([
      {
        ...first,
        arguments: { ...first.arguments, [k]: typeof v === "string" ? Number(v) : String(v) },
      },
      ...rest,
    ]);
  }
  return out.map((o) => JSON.stringify(o));
};

/** The gold with one unstated optional passed at its default: earns the explicit-default credit. */
const explicitDefault = (
  calls: readonly Call[],
  catalog: readonly Tool[],
): { answer: string; credit: number }[] => {
  for (const [i, c] of calls.entries()) {
    const opt = expectedCall(c, catalog).optional;
    const [k, v] = Object.entries(opt ?? {})[0] ?? [];
    if (k !== undefined)
      return [
        {
          answer: answer(
            calls.map((x, j) => (j === i ? { ...x, arguments: { ...x.arguments, [k]: v } } : x)),
          ),
          credit: 0.75,
        },
      ];
  }
  return [];
};

interface ItemSpec {
  family: string;
  seed: number;
  tier: number;
  behaviour: string;
  /** Request language, tagged when not English. */
  lang?: Lang;
  draw: Draw;
  prompt: string;
  wrong?: unknown[];
}

const constraintOf = (d: Draw) => ({
  name: "calls",
  check: "tool_calls",
  value: d.calls.map((c) => expectedCall(c, d.catalog)),
});

const callsItem = (s: ItemSpec): Generated => ({
  authored: {
    why: `key: ${answer(s.draw.calls)}`,
    item: {
      ...variantMeta(s.family, s.seed),
      category: "toolcall",
      tier: s.tier,
      tags: [s.behaviour, ...(s.lang === undefined || s.lang === "en" ? [] : [`lang:${s.lang}`])],
      prompt: s.prompt,
      scorer: "constraint",
      constraints: [constraintOf(s.draw)],
    },
  },
  units: [
    {
      gold: answer(s.draw.calls),
      wrong: [
        ...(s.wrong ?? []).map((w) => JSON.stringify(w)),
        ...mutations(s.draw.calls, s.draw.catalog),
      ],
      nearMiss: explicitDefault(s.draw.calls, s.draw.catalog),
    },
  ],
});

/** Redraw until the screen accepts; a seed always yields the same item. */
const screened = <T extends { draw: Draw }>(family: string, make: () => T): T => {
  let why = "";
  for (let i = 0; i < 1000; i++) {
    const v = make();
    const r = screen(v.draw);
    if (r === null) return v;
    why = r;
  }
  throw new Error(`${family}: screen rejected 1000 draws (last: ${why})`);
};

const op = (id: OpId): Op => OPS[id];
const callOf = (o: Op, a: Args): Call => ({ name: o.tool.name, arguments: a });
/** The request language: seed 3 of a family whose op has a translation uses it. */
const langOf = (o: Op, seed: number): Lang =>
  seed === 3 ? ((Object.keys(o.say).find((l) => l !== "en") as Lang | undefined) ?? "en") : "en";
const sayIn = (o: Op, lang: Lang, a: Args) => (o.say[lang] ?? o.say.en)(a);

type Family = { id: string; build: (seed: number) => Generated };

// ── single: one call, types, optionals and defaults ─────────────────────────
const single = (id: OpId): Family => {
  const family = `toolcall_single_${id}`;
  return {
    id: family,
    build: (seed) => {
      const rng = rngFor(family, seed);
      const o = op(id);
      const { draw } = screened(family, () => {
        const a = o.draw(rng);
        const text = sayIn(o, langOf(o, seed), a);
        return {
          draw: {
            catalog: catalogOf(rng, [o.tool], liveSize(rng) - 1 || 1, [o.domain]),
            calls: [callOf(o, a)],
            text,
          },
        };
      });
      return callsItem({
        family,
        seed,
        tier: 2,
        behaviour: "single",
        lang: langOf(o, seed),
        draw,
        prompt: catalogPrompt(draw.catalog, draw.text),
      });
    },
  };
};

// ── choice: pick the right tool among its near duplicates at live catalog sizes ─
const choice = (id: OpId): Family => {
  const family = `toolcall_choice_${id}`;
  return {
    id: family,
    build: (seed) => {
      const rng = rngFor(family, seed);
      const o = op(id);
      const core = [o.tool, ...o.siblings];
      const { draw } = screened(family, () => {
        const a = o.draw(rng);
        const size = seed === 3 ? rng.int(12, 20) : Math.max(liveSize(rng), core.length);
        return {
          draw: {
            catalog: catalogOf(rng, core, size, [o.domain]),
            calls: [callOf(o, a)],
            text: sayIn(o, langOf(o, seed), a),
          },
        };
      });
      return callsItem({
        family,
        seed,
        tier: 2,
        behaviour: "choice",
        lang: langOf(o, seed),
        draw,
        prompt: catalogPrompt(draw.catalog, draw.text),
        wrong: o.siblings.map((t) => [{ name: t.name, arguments: draw.calls[0]?.arguments }]),
      });
    },
  };
};

// ── parallel: one tool, 2–4 calls ───────────────────────────────────────────
/** Calls per seed: BFCL parallel is 2: 55%, 3: 26%, 4: 18%. */
const PARALLEL_N = [2, 3, 2, 4];

const parallel = (id: OpId, vary: string | null, say: (as: Args[]) => string): Family => {
  const family = `toolcall_parallel_${id}`;
  return {
    id: family,
    build: (seed) => {
      const rng = rngFor(family, seed);
      const o = op(id);
      const { draw } = screened(family, () => {
        const base = o.draw(rng);
        const as = Array.from({ length: PARALLEL_N[seed] ?? 2 }, (_, i) =>
          i === 0 ? base : vary === null ? o.draw(rng) : { ...base, [vary]: o.draw(rng)[vary] },
        );
        const core = [o.tool, ...o.siblings];
        return {
          draw: {
            catalog: catalogOf(rng, core, Math.max(liveSize(rng), core.length), [o.domain]),
            calls: as.map((a) => callOf(o, a)),
            text: say(as),
          },
        };
      });
      return callsItem({
        family,
        seed,
        tier: 2,
        behaviour: "parallel",
        draw,
        prompt: catalogPrompt(draw.catalog, draw.text),
      });
    },
  };
};

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const CONNECT = ["", "Also, ", "And ", "Finally, "];

// ── parallel + multiple: 2–4 calls over 2–3 tools ───────────────────────────
const parallelMultiple = (name: string, ids: OpId[]): Family => {
  const family = `toolcall_multi_${name}`;
  return {
    id: family,
    build: (seed) => {
      const rng = rngFor(family, seed);
      const ops = ids.map(op);
      // Seeds 2 and 3 repeat the first tool (and seed 3 the second) with fresh values.
      const plan = [
        ...ops,
        ...(seed >= 2 ? [ops[0] as Op] : []),
        ...(seed === 3 && ops.length === 2 ? [ops[1] as Op] : []),
      ];
      const { draw } = screened(family, () => {
        const calls = plan.map((o) => callOf(o, o.draw(rng)));
        const text = plan
          .map((o, i) => {
            const s = o.say.en(calls[i]?.arguments as Args);
            return i === 0 ? s : `${CONNECT[i]}${lower(s)}`;
          })
          .join(" ");
        const core = [...new Set(ops.flatMap((o) => [o.tool, ...o.siblings]))];
        return {
          draw: {
            catalog: catalogOf(
              rng,
              core,
              Math.max(liveSize(rng), core.length),
              ops.map((o) => o.domain),
            ),
            calls,
            text,
          },
        };
      });
      return callsItem({
        family,
        seed,
        tier: 3,
        behaviour: "parallel_multiple",
        draw,
        prompt: catalogPrompt(draw.catalog, draw.text),
      });
    },
  };
};

// ── abstention: no tool fits, a required value is missing, wrong operation ──
const abstain = (
  kind: "nofit" | "missing" | "wrongop",
  name: string,
  make: (rng: Rng) => { core: Tool[]; exclude: Domain[]; text: string; wrong: Call[] },
): Family => {
  const family = `toolcall_abstain_${kind}_${name}`;
  return {
    id: family,
    build: (seed) => {
      const rng = rngFor(family, seed);
      const m = make(rng);
      const catalog = catalogOf(rng, m.core, Math.max(liveSize(rng), m.core.length + 1), m.exclude);
      const draw: Draw = { catalog, calls: [], text: m.text };
      return callsItem({
        family,
        seed,
        tier: 3,
        behaviour: `abstain_${kind}`,
        draw,
        prompt: catalogPrompt(catalog, m.text),
        wrong: m.wrong.map((c) => [c]),
      });
    },
  };
};

/** No tool fits: the request is for `id`, the catalog holds none of `exclude`'s tools. */
const noFit = (id: OpId, exclude: Domain[]) =>
  abstain("nofit", id, (rng) => {
    const o = op(id);
    const a = o.draw(rng);
    return { core: [], exclude, text: o.say.en(a), wrong: [callOf(o, a)] };
  });

/** A required value is missing: `say` renders the request without `drop`. */
const missing = (id: OpId, drop: string, say: (a: Args) => string, guess: (rng: Rng) => unknown) =>
  abstain("missing", id, (rng) => {
    const o = op(id);
    const a = o.draw(rng);
    const { [drop]: _gone, ...rest } = a;
    return {
      core: [o.tool, ...o.siblings],
      exclude: [o.domain],
      text: say(rest),
      wrong: [callOf(o, rest), callOf(o, { ...rest, [drop]: guess(rng) })],
    };
  });

// ── multi-turn: state carried across turns, gold history ───────────────────
interface Step {
  text: string;
  calls: Call[];
  /** One result per gold call, shown at the start of the next turn. */
  results?: unknown[];
  /** A tool that becomes available at the start of this turn. */
  addTool?: Tool;
}
interface Scenario {
  core: Tool[];
  exclude: Domain[];
  steps: Step[];
}

const turnPrompt = (prev: Step | undefined, s: Step, catalog: readonly Tool[]): string => {
  if (prev === undefined) return catalogPrompt(catalog, s.text);
  const parts: string[] = [];
  if (prev.results !== undefined)
    parts.push(
      `Tool results:\n${json(prev.calls.map((c, i) => ({ name: c.name, result: prev.results?.[i] })))}`,
    );
  if (s.addTool !== undefined) parts.push(`A new tool is now available:\n${json(s.addTool)}`);
  parts.push(`Request: ${s.text}`, FORMAT_AGAIN);
  return parts.join("\n\n");
};

const multiTurn = (name: string, make: (rng: Rng) => Scenario): Family => {
  const family = `toolcall_turns_${name}`;
  return {
    id: family,
    build: (seed) => {
      const rng = rngFor(family, seed);
      const { sc, catalog } = (() => {
        for (let i = 0; i < 1000; i++) {
          const sc = make(rng);
          const catalog = catalogOf(rng, sc.core, sc.core.length + rng.int(1, 4), sc.exclude);
          if (turnsOf(sc, catalog).every((t) => screen(t.draw) === null)) return { sc, catalog };
        }
        throw new Error(`${family}: screen rejected 1000 draws`);
      })();
      const turns = turnsOf(sc, catalog);
      const authored = chainItem({
        name: variantMeta(family, seed).name,
        category: "toolcall",
        tier: 3,
        tags: ["multi_turn"],
        why: `${turns.length} turns, gold history`,
        turns: turns.map((t) => ({
          turn: {
            why: `key: ${answer(t.draw.calls)}`,
            item: {
              name: "t",
              category: "toolcall",
              tier: 3,
              prompt: t.prompt,
              scorer: "constraint",
              constraints: [constraintOf(t.draw)],
            },
          } satisfies AuthoredItem,
          answer: answer(t.draw.calls),
        })),
      });
      return {
        authored: withMeta({ ...authored, item: { ...authored.item, family } }, seed, "core"),
        units: turns.map((t, i) => ({
          gold: answer(t.draw.calls),
          wrong: [
            ...mutations(t.draw.calls, t.draw.catalog),
            ...(t.draw.calls.length === 0 ? [answer(sc.steps[i + 1]?.calls ?? [])] : []),
          ],
          nearMiss: explicitDefault(t.draw.calls, t.draw.catalog),
        })),
      };
    },
  };
};

/** Each turn's prompt and screen input: the catalog so far and the whole conversation as context. */
const turnsOf = (sc: Scenario, base: readonly Tool[]): { prompt: string; draw: Draw }[] => {
  let catalog = [...base];
  let context = "";
  return sc.steps.map((s, i) => {
    if (s.addTool !== undefined) catalog = [...catalog, s.addTool];
    const prompt = turnPrompt(sc.steps[i - 1], s, catalog);
    // What the conversation states: earlier requests, tool results, this request (not the schemas).
    context += `\n${JSON.stringify(sc.steps[i - 1]?.results ?? [])}\n${s.text}`;
    return { prompt, draw: { catalog: [...catalog], calls: s.calls, text: context } };
  });
};

const call = (t: Tool, a: Args): Call => ({ name: t.name, arguments: a });
const fileName = (rng: Rng) =>
  `${rng.pick(["report", "export", "invoice", "backup"])}-${isoDate(rng).replaceAll("-", "")}.${rng.pick(["csv", "pdf"])}`;

const SCENARIOS: readonly [string, (rng: Rng) => Scenario][] = [
  [
    "files_cleanup",
    (rng) => {
      const dir = rng.pick(["/srv/reports", "/home/dev/exports", "/mnt/shared/finance"]);
      const pattern = rng.pick(["*.csv", "*.pdf", "report-*"]);
      const files = rng.sample([0, 1, 2, 3, 4, 5], 3).map((d, i) => ({
        path: `${dir}/${fileName(rng)}`,
        sizeBytes: rng.int(2000, 900000),
        modified: `2025-0${i + 1}-1${d}T09:00`,
      }));
      const [oldest, ...others] = files;
      const archive = `/srv/archive/${rng.pick(["q1", "old-reports", "cleanup"])}.zip`;
      return {
        core: [searchFiles, deleteFile, getFileInfo],
        exclude: ["files"],
        steps: [
          {
            text: `Find the files matching ${pattern} under ${dir}.`,
            calls: [call(searchFiles, { directory: dir, pattern })],
            results: [files],
          },
          {
            text: "Delete the oldest of those for good, don't just move it to the trash.",
            calls: [call(deleteFile, { path: oldest?.path, permanent: true })],
            results: [{ deleted: oldest?.path }],
          },
          { text: `Zip the remaining two into ${archive}.`, calls: [] },
          {
            text: "Go ahead and zip them now.",
            addTool: compressFiles,
            calls: [
              call(compressFiles, { paths: others.map((f) => f.path), archivePath: archive }),
            ],
          },
        ],
      };
    },
  ],
  [
    "calendar_swap",
    (rng) => {
      const date = isoDate(rng);
      const titles = rng.sample(["Design review", "Vendor call", "Budget sync", "Team lunch"], 3);
      const events = titles.map((title, i) => ({
        event_id: `evt_${rng.int(1000, 9999)}${"abc"[i]}`,
        title,
        start: `${date}T${["09:30", "13:00", "15:30"][i]}`,
      }));
      const target = rng.pick(events);
      const replacement = rng.pick(["Hiring debrief", "Roadmap check-in", "Customer demo"]);
      return {
        core: [calList, calDelete, calCreate],
        exclude: ["calendar"],
        steps: [
          {
            text: `What's on my calendar on ${date}?`,
            calls: [call(calList, { date })],
            results: [events],
          },
          {
            text: `Cancel the ${target.title} without notifying anyone.`,
            calls: [call(calDelete, { event_id: target.event_id, notify_attendees: false })],
            results: [{ deleted: target.event_id }],
          },
          {
            text: `Put "${replacement}" in that same slot instead, for 45 minutes.`,
            calls: [
              call(calCreate, { title: replacement, start: target.start, duration_minutes: 45 }),
            ],
          },
        ],
      };
    },
  ],
  [
    "order_delay",
    (rng) => {
      const id = orderId(rng);
      const carrier = rng.pick(["ups", "fedex", "dhl", "usps"]);
      const tn = `${rng.int(1, 9)}${rng.int(1000000000, 9999999999)}`;
      return {
        core: [orderStatus, trackPackage, cancelOrder],
        exclude: ["commerce"],
        steps: [
          {
            text: `What's happening with my order ${id}?`,
            calls: [call(orderStatus, { order_id: id })],
            results: [{ order_id: id, status: "shipped", carrier, tracking_number: tn }],
          },
          {
            text: "Where is that parcel right now?",
            calls: [call(trackPackage, { carrier, tracking_number: tn })],
            results: [{ status: "delayed", estimated_delivery: isoDate(rng) }],
          },
          {
            text: "That arrives too late for me. Cancel the order and give me store credit instead.",
            calls: [
              call(cancelOrder, {
                order_id: id,
                reason: "arrives_too_late",
                refund_method: "store_credit",
              }),
            ],
          },
        ],
      };
    },
  ],
  [
    "user_admin",
    (rng) => {
      const last = rng.pick(["Okafor", "Lindqvist", "Tanaka", "Moreau"]);
      const users = rng.sample(["Ada", "Ben", "Chloe", "Dev"], 2).map((first) => ({
        userId: rng.int(10000, 99999),
        name: `${first} ${last}`,
        email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
        role: "viewer",
      }));
      const who = rng.pick(users);
      return {
        core: [searchUsers, updateUserRole],
        exclude: ["accounts"],
        steps: [
          {
            text: `Find the users named ${last}.`,
            calls: [call(searchUsers, { query: last })],
            results: [users],
          },
          {
            text: `Make ${who.name} an editor.`,
            calls: [call(updateUserRole, { userId: who.userId, role: "editor" })],
            results: [{ userId: who.userId, role: "editor" }],
          },
          { text: `Also send ${who.name} a password reset.`, calls: [] },
          {
            text: "You can do that now.",
            addTool: resetPassword,
            calls: [call(resetPassword, { userId: who.userId })],
          },
        ],
      };
    },
  ],
  [
    "kube_crashloop",
    (rng) => {
      const ns = rng.pick(["prod", "staging", "payments"]);
      const deps = rng.sample(["checkout-api", "billing-worker", "search-indexer"], 2);
      const pods = deps.map((d, i) => ({
        pod: `${d}-${rng.int(1000, 9999)}-x${rng.int(10, 99)}q`,
        deployment: d,
        status: "Failed",
        restarts: i === 0 ? rng.int(12, 40) : rng.int(1, 9),
      }));
      const worst = pods[0] as (typeof pods)[number];
      return {
        core: [kubeListPods, kubeLogs, kubeRestart],
        exclude: ["devops"],
        steps: [
          {
            text: `List the pods in the ${ns} namespace whose status is Failed.`,
            calls: [call(kubeListPods, { namespace: ns, status: "Failed" })],
            results: [rng.sample(pods, 2)],
          },
          {
            text: "Show me the last 50 log lines of the one with the most restarts, from its previous run.",
            calls: [
              call(kubeLogs, { pod: worst.pod, namespace: ns, tail_lines: 50, previous: true }),
            ],
            results: [{ lines: ["panic: connection refused (db:5432)"] }],
          },
          {
            text: "Restart its deployment.",
            calls: [call(kubeRestart, { deployment: worst.deployment, namespace: ns })],
          },
        ],
      };
    },
  ],
  [
    "savings_transfer",
    (rng) => {
      const balance = rng.int(200000, 900000) / 100;
      const amount = rng.int(100, 1500);
      const iban = `NL${rng.int(10, 99)}BANK0${rng.int(100000000, 999999999)}`;
      const memo = rng.pick(["Rent March", "Tuition", "Car repair"]);
      const y = rng.int(2025, 2026);
      const m = rng.int(1, 11);
      const start = `${y}-${String(m).padStart(2, "0")}-01`;
      const end = `${y}-${String(m + 1).padStart(2, "0")}-01`;
      return {
        core: [bankBalance, bankTransfer, bankTransactions],
        exclude: ["finance"],
        steps: [
          {
            text: "How much is in my savings account?",
            calls: [call(bankBalance, { account_type: "savings" })],
            results: [{ account_type: "savings", balance, currency: "EUR" }],
          },
          {
            text: `Move ${amount} of it to ${iban}, reference "${memo}".`,
            calls: [
              call(bankTransfer, {
                amount,
                recipient_account: iban,
                account_type: "savings",
                memo,
              }),
            ],
            results: [
              { status: "executed", new_balance: Math.round((balance - amount) * 100) / 100 },
            ],
          },
          {
            text: `Now list the savings transactions from ${start} to ${end}.`,
            calls: [
              call(bankTransactions, { start_date: start, end_date: end, account_type: "savings" }),
            ],
          },
        ],
      };
    },
  ],
  [
    "flight_booking",
    (rng) => {
      const [o, d] = rng.sample(AIRPORTS, 2);
      const date = isoDate(rng);
      const flights = rng.sample(["BA", "LH", "AF", "KL"], 3).map((al) => ({
        flight_number: `${al}${rng.int(100, 999)}`,
        departs: `${date}T${hhmm(rng)}`,
        price_usd: rng.int(180, 900),
      }));
      const cheapest = [...flights].sort(
        (x, y) => x.price_usd - y.price_usd,
      )[0] as (typeof flights)[number];
      const n = rng.int(2, 4);
      return {
        core: [flightSearch, flightStatus],
        exclude: ["travel", "events"],
        steps: [
          {
            text: `Find flights from ${o} to ${d} on ${date}.`,
            calls: [
              call(flightSearch, {
                origin_airport: o,
                destination_airport: d,
                departure_date: date,
              }),
            ],
            results: [flights],
          },
          {
            text: "What's the status of the cheapest one?",
            calls: [call(flightStatus, { flight_number: cheapest.flight_number, date })],
            results: [{ status: "scheduled", gate: `B${rng.int(1, 40)}` }],
          },
          { text: `Book it for ${n} people.`, calls: [] },
          {
            text: "Booking works now, please go ahead.",
            addTool: flightReserve,
            calls: [
              call(flightReserve, {
                flight_number: cheapest.flight_number,
                date,
                number_of_tickets: n,
              }),
            ],
          },
        ],
      };
    },
  ],
  [
    "hot_day",
    (rng) => {
      const city = rng.pick(CITIES);
      const temp = rng.int(21, 24);
      return {
        core: [getCurrentWeather, setThermostat, setLights],
        exclude: ["weather", "home"],
        steps: [
          {
            text: `How hot is it in ${city} right now?`,
            calls: [call(getCurrentWeather, { location: city })],
            results: [
              { temperature: rng.int(310, 380) / 10, units: "celsius", conditions: "sunny" },
            ],
          },
          {
            text: `Too hot. Cool the living_room zone down to ${temp} degrees.`,
            calls: [
              call(setThermostat, { zone: "living_room", target_temp_c: temp, mode: "cool" }),
            ],
            results: [{ zone: "living_room", target_temp_c: temp, mode: "cool" }],
          },
          {
            text: "And switch off the lights in the bedroom.",
            calls: [call(setLights, { room: "bedroom", on: false })],
          },
        ],
      };
    },
  ],
];

// ── The suite ───────────────────────────────────────────────────────────────
const wrongOp = (
  name: string,
  make: (rng: Rng) => { core: Tool[]; exclude: Domain[]; text: string; wrong: Call[] },
) => abstain("wrongop", name, make);

export const toolcallFamilies: Family[] = [
  ...(
    [
      "forecast",
      "flightSearch",
      "createEvent",
      "sendEmail",
      "listFiles",
      "shipment",
      "inventory",
      "transfer",
      "thermostat",
      "scale",
      "role",
      "workout",
    ] as const
  ).map(single),
  ...(
    [
      "current",
      "flightStatus",
      "listEvents",
      "scheduleEmail",
      "moveFile",
      "trackPackage",
      "cancelOrder",
      "transactions",
      "convert",
      "lights",
      "podLogs",
      "searchUsers",
    ] as const
  ).map(choice),
  parallel("forecast", "location", (as) => {
    const a = as[0] as Args;
    return `What will the weather be like over the next ${a["days"]} days in ${list(as.map((x) => x["location"]))}? One forecast per city.${"hourly" in a ? " Hour by hour." : ""}${"units" in a ? " In fahrenheit." : ""}`;
  }),
  parallel("convert", "to_currency", (as) => {
    const a = as[0] as Args;
    return `How much is ${a["amount"]} ${a["from_currency"]} in ${list(
      as.map((x) => x["to_currency"]),
      "and in",
    )}?`;
  }),
  parallel("lights", "room", (as) => {
    const a = as[0] as Args;
    const rooms = as.map((x) => x["room"]).join(", ");
    return a["on"]
      ? `Turn on the lights in these rooms: ${rooms}${"brightness_pct" in a ? `, all at ${a["brightness_pct"]} percent` : ""}.`
      : `Switch off the lights in these rooms: ${rooms}.`;
  }),
  parallel("scale", "deployment", (as) => {
    const a = as[0] as Args;
    return `Scale each of these deployments to ${a["replicas"]} replicas${"namespace" in a ? ` in the ${a["namespace"]} namespace` : ""}: ${as.map((x) => x["deployment"]).join(", ")}.`;
  }),
  parallel("podLogs", "pod", (as) => {
    const a = as[0] as Args;
    return `Pull ${"tail_lines" in a ? `the last ${a["tail_lines"]} ` : ""}log lines of each of these pods${"namespace" in a ? ` in namespace ${a["namespace"]}` : ""}${"previous" in a ? ", from the run before each crashed" : ""}: ${as.map((x) => x["pod"]).join(", ")}.`;
  }),
  parallel(
    "trackPackage",
    null,
    (as) =>
      `Where are my parcels? ${as.map((x) => `${String(x["carrier"]).toUpperCase()} tracking number ${x["tracking_number"]}`).join("; ")}.`,
  ),
  parallel(
    "flightStatus",
    null,
    (as) =>
      `Are these flights on time? ${as.map((x) => `${x["flight_number"]} on ${x["date"]}`).join(", ")}.`,
  ),
  parallel(
    "role",
    null,
    (as) =>
      `Update these roles: ${as.map((x) => `user ${x["userId"]} becomes ${x["role"]}${x["notifyUser"] === false ? " (no email)" : ""}`).join("; ")}.`,
  ),
  parallelMultiple("trip", ["forecast", "flightSearch"]),
  parallelMultiple("meeting", ["createEvent", "sendEmail"]),
  parallelMultiple("files", ["listFiles", "moveFile"]),
  parallelMultiple("orders", ["cancelOrder", "trackPackage", "shipment"]),
  parallelMultiple("money", ["transfer", "transactions", "convert"]),
  parallelMultiple("home", ["thermostat", "lights"]),
  parallelMultiple("ops", ["scale", "podLogs"]),
  parallelMultiple("admin", ["role", "searchUsers"]),
  noFit("forecast", ["weather"]),
  noFit("flightSearch", ["travel", "events"]),
  noFit("convert", ["finance", "commerce"]),
  noFit("thermostat", ["home"]),
  missing(
    "forecast",
    "location",
    (a) => `What will the weather be like over the next ${a["days"]} days?`,
    (rng) => rng.pick(CITIES),
  ),
  missing(
    "transfer",
    "recipient_account",
    (a) => `Send ${a["amount"]} to my landlord${"account_type" in a ? " from my savings" : ""}.`,
    () => "landlord",
  ),
  missing(
    "scale",
    "replicas",
    (a) =>
      `Scale up ${a["deployment"]}${"namespace" in a ? ` in the ${a["namespace"]} namespace` : ""}, it can't keep up.`,
    (rng) => rng.int(2, 10),
  ),
  missing(
    "createEvent",
    "start",
    (a) => `Put "${a["title"]}" on my calendar sometime next week.`,
    () => "2026-01-05T09:00",
  ),
  wrongOp("cancel_order", (rng) => {
    const id = orderId(rng);
    return {
      core: [orderStatus, trackPackage],
      exclude: ["commerce"],
      text: `Cancel order ${id}, I ordered it by mistake.`,
      wrong: [
        call(orderStatus, { order_id: id }),
        call(cancelOrder, { order_id: id, reason: "ordered_by_mistake" }),
      ],
    };
  }),
  wrongOp("delete_event", (rng) => {
    const id = `evt_${rng.int(1000, 9999)}`;
    return {
      core: [calList, calCreate],
      exclude: ["calendar"],
      text: `Delete the event ${id} from my calendar and let the attendees know.`,
      wrong: [call(calDelete, { event_id: id })],
    };
  }),
  wrongOp("transfer", (rng) => {
    const amount = rng.int(50, 900);
    const iban = `DE${rng.int(10, 99)}${rng.int(100000000, 999999999)}`;
    return {
      core: [bankBalance, bankTransactions],
      exclude: ["finance"],
      text: `Transfer ${amount} to ${iban}.`,
      wrong: [call(bankBalance, {}), call(bankTransfer, { amount, recipient_account: iban })],
    };
  }),
  wrongOp("delete_file", (rng) => {
    const path = `/var/log/app/${fileName(rng)}`;
    return {
      core: [listFiles, getFileInfo, searchFiles],
      exclude: ["files"],
      text: `Permanently delete ${path}.`,
      wrong: [call(getFileInfo, { path }), call(deleteFile, { path, permanent: true })],
    };
  }),
  ...SCENARIOS.map(([name, make]) => multiTurn(name, make)),
];

export const SEEDS = [0, 1, 2, 3];

export const toolcallItems = (): Generated[] =>
  toolcallFamilies.flatMap((f) => SEEDS.map((s) => f.build(s)));

// ── Calibration profile ─────────────────────────────────────────────────────

/**
 * Target bands for the generated catalogs, from BFCL live statistics (see the
 * design note). Shares are of all parameters shown, counted per catalog
 * occurrence; description lengths are medians in characters.
 */
export const PROFILE = {
  toolsMedian: [3, 4],
  toolsP90Min: 6,
  itemsWith12PlusToolsMin: 4,
  paramsPerFn: [3.3, 4.2],
  paramsMaxMin: 7,
  requiredShare: [0.5, 0.65],
  defaultShare: [0.35, 0.5],
  enumShare: [0.15, 0.2],
  booleanShare: [0.08, 0.12],
  arrayShare: [0.05, 0.08],
  objectShare: [0.02, 0.04],
  maxDepth: 2,
  fnDescMedian: [80, 130],
  paramDescMedian: [50, 90],
  nonEnglishShare: [0.05, 0.1],
  /** Minimum share of function occurrences per naming style. */
  styleMin: 0.05,
} as const;

export type Style = "sgd" | "dotted" | "camel" | "snake";
export const styleOf = (name: string): Style =>
  /^[A-Z][A-Za-z]*_\d+_[A-Z]/.test(name)
    ? "sgd"
    : name.includes(".")
      ? "dotted"
      : /^[a-z]+[A-Z]/.test(name)
        ? "camel"
        : "snake";

const depthOf = (p: Prop): number =>
  p.type === "object"
    ? 1 + Math.max(0, ...Object.values(p.properties).map(depthOf))
    : p.type === "array"
      ? 1 + depthOf(p.items)
      : 0;

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

/** The calibration statistics of generated items, read back from each item's first prompt. */
export const profileOf = (items: readonly Generated[]) => {
  const tools: number[] = [];
  const fnParams: number[] = [];
  const fnDesc: number[] = [];
  const paramDesc: number[] = [];
  const styles: Record<Style, number> = { sgd: 0, dotted: 0, camel: 0, snake: 0 };
  const types: Record<string, number> = {};
  let params = 0;
  let required = 0;
  let defaults = 0;
  let depth = 0;
  let nonEnglish = 0;
  for (const g of items) {
    const it = g.authored.item as {
      prompt?: string;
      turns?: { prompt: string }[];
      tags?: string[];
    };
    const prompt = it.prompt ?? it.turns?.[0]?.prompt ?? "";
    const catalog = JSON.parse(
      prompt.slice(prompt.indexOf("\n\n") + 2, prompt.indexOf("\n\nRequest: ")),
    ) as Tool[];
    tools.push(catalog.length);
    if (it.tags?.some((t) => t.startsWith("lang:"))) nonEnglish++;
    for (const t of catalog) {
      styles[styleOf(t.name)]++;
      fnDesc.push(t.description.length);
      const props = Object.entries(t.parameters.properties);
      fnParams.push(props.length);
      for (const [k, p] of props) {
        params++;
        if (t.parameters.required.includes(k)) required++;
        if ("default" in p) defaults++;
        const ty = p.type === "string" && p.enum !== undefined ? "enum" : p.type;
        types[ty] = (types[ty] ?? 0) + 1;
        depth = Math.max(depth, depthOf(p));
        paramDesc.push((p.description ?? "").length);
      }
    }
  }
  const fns = fnParams.length;
  const share = (n: number) => n / params;
  return {
    items: items.length,
    toolsMedian: median(tools),
    toolsP90: [...tools].sort((a, b) => a - b)[Math.floor(tools.length * 0.9)] ?? 0,
    itemsWith12PlusTools: tools.filter((n) => n >= 12).length,
    paramsPerFn: params / fns,
    paramsMax: Math.max(...fnParams),
    requiredShare: share(required),
    defaultShare: share(defaults),
    enumShare: share(types["enum"] ?? 0),
    booleanShare: share(types["boolean"] ?? 0),
    arrayShare: share(types["array"] ?? 0),
    objectShare: share(types["object"] ?? 0),
    maxDepth: depth,
    fnDescMedian: median(fnDesc),
    paramDescMedian: median(paramDesc),
    nonEnglishShare: nonEnglish / items.length,
    styleShares: Object.fromEntries(Object.entries(styles).map(([k, n]) => [k, n / fns])) as Record<
      Style,
      number
    >,
  };
};
