// P2 — IFEval-style composer. Each item stacks 2–4 compatible, verifiable
// format rules on a neutral writing task. Screens:
//   1. pairwise compatibility (COMPAT below) rules out contradictory stacks;
//   2. a gold output is CONSTRUCTED from a topic's sentence pool and must score
//      1 under the real constraint scorer, else the draw is rejected;
//   3. a plausible naive answer (chatty preamble + unconstrained paragraph)
//      must score below 1, so the item tests something.

import type { ConstraintDef } from "../../../src/schema/constraints.js";
import { type AuthoredItem, wholeWordPattern } from "../emit.js";
import {
  constraintScore,
  type Generated,
  int,
  pick,
  type Rng,
  redraw,
  rngFor,
  seedName,
  shuffle,
} from "./common.js";

interface Topic {
  title: string;
  about: string;
  sentences: string[];
}

// Comma-free, single-clause sentences ending in "." — every rule below can be met
// by choosing and arranging them.
const TOPICS: Topic[] = [
  {
    title: "A Morning Walk",
    about: "a morning walk along a river",
    sentences: [
      "The river was calm and grey in the early light.",
      "A heron stood still near the far bank.",
      "The path was damp from the rain of the night before.",
      "Two joggers passed by with a friendly nod.",
      "Small birds sang from the reeds beside the water.",
      "The air smelled of wet grass and cold stone.",
      "A wooden bridge crossed the river near the old mill.",
      "The sun rose slowly over the low hills.",
      "By the end of the walk the mist had lifted from the river.",
    ],
  },
  {
    title: "The Town Library",
    about: "a small town library",
    sentences: [
      "The library sits on a quiet corner of the main square.",
      "Tall shelves hold books on every subject.",
      "A reading room at the back faces a small garden.",
      "The librarian knows most regular visitors by name.",
      "Children gather on the rug for stories each week.",
      "Old maps of the town hang near the front desk.",
      "The building was once a grain store.",
      "Quiet study tables line the long windows.",
      "On rainy days the library is full of readers.",
    ],
  },
  {
    title: "Baking Bread",
    about: "baking a loaf of bread at home",
    sentences: [
      "Good bread needs only flour and water and salt and yeast.",
      "The dough should rest until it doubles in size.",
      "Kneading builds the structure that holds the loaf together.",
      "A hot oven gives the crust its deep brown colour.",
      "The kitchen fills with a warm and welcome smell.",
      "Patience matters more than any special tool.",
      "A sharp cut on top lets the loaf expand.",
      "The bread should cool before it is sliced.",
      "Fresh bread tastes best on the day it is baked.",
    ],
  },
  {
    title: "A Garden in Spring",
    about: "a vegetable garden in spring",
    sentences: [
      "The soil warms slowly as the days grow longer.",
      "Seeds go into the ground in neat straight rows.",
      "Peas climb the wire fence along the north side.",
      "Weeds appear almost as fast as the seedlings.",
      "A rain barrel collects water from the shed roof.",
      "The first lettuce is ready within a few weeks.",
      "Bees visit the flowers at the edge of the garden.",
      "Each evening the beds need a gentle watering.",
      "By late spring the garden is green and full.",
    ],
  },
  {
    title: "The Night Train",
    about: "a journey on an overnight train",
    sentences: [
      "The train left the station just after dark.",
      "Each cabin had two narrow beds and a small window.",
      "Lights from distant villages slid past the glass.",
      "The steady sound of the wheels made sleep easy.",
      "A cart came by with tea and simple snacks.",
      "Most passengers read or talked in low voices.",
      "Near dawn the train crossed a wide valley.",
      "The conductor walked the corridor to wake each cabin.",
      "The train reached the coast in the pale morning.",
    ],
  },
  {
    title: "The Harbour Market",
    about: "a weekend market by a harbour",
    sentences: [
      "The market opens early on Saturday by the harbour.",
      "Fishing boats unload their catch at the stone pier.",
      "Stalls sell fruit and cheese and fresh flowers.",
      "Gulls circle above the crowd looking for scraps.",
      "A band plays near the fountain at noon.",
      "Traders call out their prices in loud voices.",
      "The smell of salt and smoke drifts over the stalls.",
      "Families walk along the harbour wall after shopping.",
      "By late afternoon the market packs up for the week.",
    ],
  },
  {
    title: "Learning to Swim",
    about: "learning to swim as an adult",
    sentences: [
      "The first lesson took place in the shallow end.",
      "Floating on the water felt strange at first.",
      "The instructor showed how to breathe out slowly.",
      "Kicking from the hips made the legs work better.",
      "Each week the swim felt a little longer.",
      "Goggles made it easier to keep calm underwater.",
      "Fear of deep water faded with practice.",
      "The pool was quiet in the early evening.",
      "After two months a full length felt easy.",
    ],
  },
  {
    title: "A Winter Cabin",
    about: "a weekend in a winter cabin",
    sentences: [
      "The cabin stood at the end of a snowy track.",
      "A wood stove kept the main room warm.",
      "Snow fell softly through most of the first night.",
      "Thick blankets lay folded on every chair.",
      "The pantry held soup and bread and tea.",
      "Tracks of a fox crossed the yard in the morning.",
      "The lake below the cabin was frozen solid.",
      "Evenings passed with cards by the stove.",
      "The drive home was slow on the icy road.",
    ],
  },
];

const ENDINGS = ["That is all for now.", "Thank you for reading.", "End of note.", "More soon."];
const JSON_KEYS = ["title", "summary", "details", "mood"];

type Format =
  | { kind: "paragraph" }
  | { kind: "bullets"; n: number }
  | { kind: "numbered"; n: number }
  | { kind: "json"; keys: string[] };

type Rule =
  | { kind: "format"; format: Format }
  | { kind: "words"; lo: number; hi: number }
  | { kind: "sentences"; n: number }
  | { kind: "case"; upper: boolean }
  | { kind: "include"; word: string }
  | { kind: "forbid"; word: string }
  | { kind: "exactly"; word: string; count: number }
  | { kind: "ends"; phrase: string }
  | { kind: "commas" }
  | { kind: "heading" };

type Kind = Rule["kind"];
const KINDS: Kind[] = [
  "format",
  "words",
  "sentences",
  "case",
  "include",
  "forbid",
  "exactly",
  "ends",
  "commas",
  "heading",
];

const isLength = (k: Kind) => k === "words" || k === "sentences";

/** Pairs that contradict or make a rule ambiguous (e.g. do bullet markers count as words?). */
function compatible(a: Rule, b: Rule): boolean {
  const fmt = a.kind === "format" ? a.format : b.kind === "format" ? b.format : null;
  const other = a.kind === "format" ? b : a;
  if (fmt !== null && fmt.kind !== "paragraph") {
    if (isLength(other.kind) || other.kind === "heading") return false;
    if (fmt.kind === "json" && ["ends", "commas"].includes(other.kind)) return false;
    if (fmt.kind === "json" && other.kind === "case" && other.upper) return false; // keys are lowercase
  }
  const kinds = new Set([a.kind, b.kind]);
  if (kinds.has("heading") && (kinds.has("words") || kinds.has("sentences"))) return false;
  if (kinds.has("ends") && kinds.has("sentences")) return false;
  return true;
}

const words = (s: string): string[] => s.toLowerCase().match(/[a-z]+/g) ?? [];

/** Words present in at least `min` sentences of the pool (and absent from at least 3). */
function vocab(t: Topic, min: number, maxShare = t.sentences.length - 3): string[] {
  const counts = new Map<string, number>();
  for (const s of t.sentences)
    for (const w of new Set(words(s))) counts.set(w, (counts.get(w) ?? 0) + 1);
  return [...counts]
    .filter(([w, n]) => w.length >= 4 && n >= min && n <= maxShare)
    .map(([w]) => w)
    .sort();
}

function sampleRule(rng: Rng, kind: Kind, t: Topic, used: Set<string>): Rule | null {
  const fresh = (ws: string[]) => {
    const pool = ws.filter((w) => !used.has(w));
    if (pool.length === 0) return null;
    const w = pick(rng, pool);
    used.add(w);
    return w;
  };
  switch (kind) {
    case "format": {
      const f = pick(rng, ["bullets", "numbered", "json"] as const);
      if (f === "json")
        return {
          kind,
          format: { kind: f, keys: shuffle(rng, JSON_KEYS).slice(0, int(rng, 2, 3)) },
        };
      return { kind, format: { kind: f, n: int(rng, 3, 6) } };
    }
    case "words": {
      const lo = 5 * int(rng, 6, 12);
      return { kind, lo, hi: lo + 5 * int(rng, 2, 5) };
    }
    case "sentences":
      return { kind, n: int(rng, 3, 6) };
    case "case":
      return { kind, upper: rng() < 0.4 };
    case "include": {
      const w = fresh(vocab(t, 1));
      return w === null ? null : { kind, word: w };
    }
    case "forbid": {
      const w = fresh(vocab(t, 2));
      return w === null ? null : { kind, word: w };
    }
    case "exactly": {
      const w = fresh(vocab(t, 2, t.sentences.length));
      return w === null ? null : { kind, word: w, count: 2 };
    }
    case "ends":
      return { kind, phrase: pick(rng, ENDINGS) };
    case "commas":
      return { kind };
    case "heading":
      return { kind };
  }
}

const esc = (s: string) => s.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");

/** Exactly n lines starting with "- " or "* " (lookaheads anchored at string start). */
const bulletCount = (n: number): ConstraintDef => ({
  name: `exactly ${n} bullet points`,
  check: "regex",
  pattern: `(?m)(?<![\\s\\S])(?=(?:[\\s\\S]*?^[-*] ){${n}})(?!(?:[\\s\\S]*?^[-*] ){${n + 1}})`,
});

/** Prompt line + checks for a rule. `upper` renders an ending phrase in the stack's case. */
function render(r: Rule, caseOf: (s: string) => string): { line: string; checks: ConstraintDef[] } {
  switch (r.kind) {
    case "format": {
      const f = r.format;
      if (f.kind === "bullets")
        return {
          line: `Format the response as exactly ${f.n} bullet points, each line starting with "- ".`,
          checks: [bulletCount(f.n)],
        };
      if (f.kind === "numbered")
        return {
          line: `Format the response as a numbered list of exactly ${f.n} items (1. 2. 3. …).`,
          checks: [
            { name: `numbered 1..${f.n}`, check: "numbered_lines", from: 1, to: f.n },
            { name: `no item ${f.n + 1}`, check: "no_numbered_line", line: f.n + 1 },
          ],
        };
      if (f.kind === "json")
        return {
          line: `Respond with only a JSON object with exactly these keys: ${f.keys.map((k) => `"${k}"`).join(", ")}. Every value must be a string.`,
          checks: [
            { name: "json has keys", check: "json_has_keys", keys: f.keys },
            { name: "json values are strings", check: "json_all_string_values" },
          ],
        };
      return { line: "", checks: [] };
    }
    case "words":
      return {
        line: `Use between ${r.lo} and ${r.hi} words in total.`,
        checks: [
          {
            name: `${r.lo}-${r.hi} words`,
            check: "regex",
            pattern: `^\\s*(?:\\S+\\s+){${r.lo - 1},${r.hi - 1}}\\S+\\s*$`,
          },
        ],
      };
    case "sentences":
      return {
        line: `Write exactly ${r.n} sentences as a single paragraph.`,
        checks: [
          {
            name: `exactly ${r.n} sentences`,
            check: "regex",
            pattern: `^\\s*(?:[^.!?\\s][^.!?]*[.!?]+\\s*){${r.n}}$`,
          },
        ],
      };
    case "case":
      return r.upper
        ? {
            line: "Write the entire response in capital letters; no lowercase letters at all.",
            checks: [{ name: "no lowercase letters", check: "regex", pattern: "^[^a-z]*$" }],
          }
        : {
            line: "Write the entire response in lowercase letters; no capital letters at all.",
            checks: [{ name: "no uppercase letters", check: "regex", pattern: "^[^A-Z]*$" }],
          };
    case "include":
      return {
        line: `Include the word "${r.word}" at least once.`,
        checks: [{ name: `includes ${r.word}`, check: "regex", pattern: wholeWordPattern(r.word) }],
      };
    case "forbid":
      return {
        line: `Do not use the word "${r.word}" anywhere.`,
        checks: [
          {
            name: `avoids ${r.word}`,
            check: "regex",
            pattern: `(?i)^(?![\\s\\S]*\\b${esc(r.word)}\\b)`,
          },
        ],
      };
    case "exactly":
      return {
        line: `Use the word "${r.word}" exactly ${r.count === 2 ? "twice" : `${r.count} times`}.`,
        checks: [
          {
            name: `${r.word} x${r.count}`,
            check: "word_count_exact",
            word: r.word,
            count: r.count,
          },
        ],
      };
    case "ends": {
      const p = caseOf(r.phrase);
      return {
        line: `End the response with the exact phrase "${p}" and nothing after it.`,
        checks: [{ name: "ends with phrase", check: "regex", pattern: `${esc(p)}\\s*$` }],
      };
    }
    case "commas":
      return {
        line: "Do not use any commas.",
        checks: [{ name: "no commas", check: "not_contains_char", char: "," }],
      };
    case "heading":
      return {
        line: 'Begin with a markdown heading line of the form "# Title".',
        checks: [{ name: "starts with heading", check: "regex", pattern: "^\\s*# \\S" }],
      };
  }
}

/** Assemble an output from chosen sentences under the stack's format/case/ending/heading. */
function compose(
  t: Topic,
  chosen: string[],
  rules: Rule[],
  caseOf: (s: string) => string,
  extraBullets?: number,
): string {
  const fmt = rules.find((r) => r.kind === "format")?.format ?? { kind: "paragraph" as const };
  const ends = rules.find((r) => r.kind === "ends");
  const heading = rules.some((r) => r.kind === "heading");
  let body: string;
  if (fmt.kind === "json") {
    const obj: Record<string, string> = {};
    fmt.keys.forEach((k, i) => {
      obj[k] = k === "title" ? t.title : (chosen[i] ?? chosen[0] ?? "");
    });
    body = JSON.stringify(obj, null, 2);
    if (extraBullets !== undefined) {
      body += `\n\n${chosen
        .slice(fmt.keys.length, fmt.keys.length + extraBullets)
        .map((s) => `- ${s}`)
        .join("\n")}`;
    }
  } else if (fmt.kind === "bullets") body = chosen.map((s) => `- ${s}`).join("\n");
  else if (fmt.kind === "numbered") body = chosen.map((s, i) => `${i + 1}. ${s}`).join("\n");
  else body = chosen.join(" ");
  if (heading) body = `# ${t.title}\n\n${body}`;
  if (ends)
    body += fmt.kind === "paragraph" ? ` ${caseOf(ends.phrase)}` : `\n\n${caseOf(ends.phrase)}`;
  return caseOf(body);
}

/** Search sentence subsets for an output the real scorer gives 1. */
function buildGold(
  rng: Rng,
  t: Topic,
  rules: Rule[],
  checks: ConstraintDef[],
  caseOf: (s: string) => string,
  extraBullets?: number,
): string | null {
  const fmt = rules.find((r) => r.kind === "format")?.format;
  const fixedN = fmt?.kind === "bullets" || fmt?.kind === "numbered" ? fmt.n : undefined;
  const sentencesRule = rules.find((r) => r.kind === "sentences");
  for (let i = 0; i < 400; i++) {
    const k =
      fixedN ??
      (sentencesRule?.kind === "sentences"
        ? sentencesRule.n
        : fmt?.kind === "json"
          ? fmt.keys.length + (extraBullets ?? 0)
          : int(rng, 2, 8));
    const out = compose(t, shuffle(rng, t.sentences).slice(0, k), rules, caseOf, extraBullets);
    if (constraintScore(out, checks) === 1) return out;
  }
  return null;
}

const naive = (t: Topic): string =>
  `Sure, here is a short piece about ${t.about}:\n\n${t.sentences.slice(0, 5).join(" ")}`;

interface Family {
  family: string;
  size: number;
  /** Format-switch: JSON object followed by a bullet list. */
  formatSwitch?: boolean;
}

const FAMILIES: Family[] = [
  { family: "ifeval_stack2", size: 2 },
  { family: "ifeval_stack3", size: 3 },
  { family: "ifeval_stack4", size: 4 },
  { family: "ifeval_format_switch", size: 1, formatSwitch: true },
];

function generate(f: Family, seed: number): Generated {
  const rng = rngFor(f.family, seed);
  return redraw(f.family, () => {
    const t = pick(rng, TOPICS);
    const used = new Set<string>();
    const rules: Rule[] = [];
    let switchSpec: { keys: string[]; n: number } | undefined;
    if (f.formatSwitch) {
      switchSpec = {
        keys: ["title", ...shuffle(rng, JSON_KEYS.slice(1)).slice(0, 1)],
        n: int(rng, 2, 4),
      };
      rules.push({ kind: "format", format: { kind: "json", keys: switchSpec.keys } });
    }
    const pool = f.formatSwitch ? (["include", "forbid", "case"] as Kind[]) : KINDS;
    for (const kind of shuffle(rng, pool)) {
      if (rules.length >= f.size + (f.formatSwitch ? 1 : 0)) break;
      const r = sampleRule(rng, kind, t, used);
      if (r === null || !rules.every((x) => compatible(x, r))) continue;
      if (f.formatSwitch && r.kind === "case" && r.upper) continue;
      rules.push(r);
    }
    if (rules.length < f.size + (f.formatSwitch ? 1 : 0)) return null;
    const caseRule = rules.find((r) => r.kind === "case");
    const caseOf = (s: string) =>
      caseRule?.kind === "case" ? (caseRule.upper ? s.toUpperCase() : s.toLowerCase()) : s;

    let lines: string[];
    let checks: ConstraintDef[];
    if (switchSpec) {
      const rest = rules.slice(1).map((r) => render(r, caseOf));
      lines = [
        `First, a JSON object with exactly these keys: ${switchSpec.keys.map((k) => `"${k}"`).join(", ")}. Every value must be a string.`,
        `Then, after a blank line, exactly ${switchSpec.n} bullet points, each line starting with "- ".`,
        ...rest.map((x) => x.line),
      ];
      checks = [
        { name: "json has keys", check: "json_has_keys", keys: switchSpec.keys },
        { name: "json values are strings", check: "json_all_string_values" },
        bulletCount(switchSpec.n),
        ...rest.flatMap((x) => x.checks),
      ];
    } else {
      const rendered = rules.map((r) => render(r, caseOf));
      lines = rendered.map((x) => x.line);
      checks = rendered.flatMap((x) => x.checks);
    }
    const gold = buildGold(rng, t, rules, checks, caseOf, switchSpec?.n);
    if (gold === null) return null;
    const wrong = naive(t);
    if (constraintScore(wrong, checks) === 1) return null;

    const prompt = [
      `Write a short piece about ${t.about}. Follow every rule below.`,
      "",
      ...lines.map((l, i) => `${i + 1}. ${l}`),
      "",
      "Output only the piece itself.",
    ].join("\n");
    const name = seedName(f.family, seed);
    const authored: AuthoredItem = {
      why: `Seeded IFEval stack (${f.family}); rules: ${rules.map((r) => r.kind).join(", ")}.\ngold:\n${gold}`,
      item: {
        name,
        category: "instruction-following",
        tier: f.size + 1,
        prompt,
        scorer: "constraint",
        constraints: checks,
        tags: ["instruction-following"],
        family: f.family,
        seed,
        scope: "core",
      },
    };
    return { authored, units: [{ gold, wrong: [wrong] }] };
  });
}

export const SEEDS = [0, 1, 2];

export function ifevalItems(): Generated[] {
  return FAMILIES.flatMap((f) => SEEDS.map((s) => generate(f, s)));
}
