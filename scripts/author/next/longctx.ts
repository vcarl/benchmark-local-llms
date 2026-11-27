// P7 — long-context retrieval over a procedurally generated shipping ledger.
// Size is estimated as characters / 4 (no tokenizer dependency); real BPE
// counts for this number-heavy text run somewhat higher.
//   literal     — a planted vault code, with same-shaped distractor codes for other depots
//   nonlexical  — NoLiMa-style: the needle names a landmark, the question names its city
//                 (no shared keywords); look-alike remarks about mundane views are distractors
//   count       — how many shipments of a cargo that only the planted entries carry
// Screens: the answer string occurs exactly once in the haystack (count: the cargo
// word occurs exactly k times), and filler never mentions the needle's key terms.

import { exactItem } from "../emit.js";
import {
  type Generated,
  int,
  pick,
  type Rng,
  redraw,
  rngFor,
  seedName,
  withMeta,
  shuffle,
} from "./common.js";

const NAMES = [
  "Ada",
  "Bram",
  "Cleo",
  "Dario",
  "Edda",
  "Fenn",
  "Greta",
  "Hugo",
  "Ines",
  "Joss",
  "Kira",
  "Lars",
  "Mila",
  "Nico",
  "Orla",
  "Pavel",
  "Quin",
  "Rosa",
  "Sven",
  "Tilda",
  "Ugo",
  "Vera",
  "Wim",
  "Xenia",
  "Yara",
  "Zeno",
  "Alma",
  "Boris",
  "Carys",
  "Dov",
];
const GOODS = [
  "copper fittings",
  "rope",
  "lamp oil",
  "wool bales",
  "salt fish",
  "nails",
  "barley",
  "glass jars",
  "tin plates",
  "linen",
  "candles",
  "timber",
  "cider",
  "flour",
  "tar",
  "leather",
  "chalk",
  "dried peas",
  "soap",
  "wire",
];
const TOWNS = [
  "Harlow Ford",
  "Brindlemoor",
  "Caskwell",
  "Dunmere",
  "Eastwick Vale",
  "Fallowby",
  "Grimsholt",
  "Hollin Cross",
  "Ivybridge End",
  "Kettlemouth",
  "Larkspur Hill",
  "Millbeck",
];
const DIRS = ["north", "south", "east", "west"];
const VIEWS = [
  "a car park",
  "a laundry yard",
  "a brick wall",
  "a bus stop",
  "a row of bins",
  "a garage roof",
];
const LANDMARKS: { landmark: string; city: string }[] = [
  { landmark: "Semperoper", city: "Dresden" },
  { landmark: "Atomium", city: "Brussels" },
  { landmark: "Kiyomizu-dera temple", city: "Kyoto" },
  { landmark: "Sagrada Familia", city: "Barcelona" },
  { landmark: "Hagia Sophia", city: "Istanbul" },
  { landmark: "Christ the Redeemer statue", city: "Rio de Janeiro" },
];

const TEMPLATES: ((r: Rng, name: string, goods: string) => string)[] = [
  (r, n, g) =>
    `On day ${int(r, 1, 360)}, courier ${n} carried ${int(r, 2, 90)} crates of ${g} from ${pick(r, TOWNS)} to the ${pick(r, DIRS)} depot.`,
  (r, n, g) =>
    `${n} signed for ${int(r, 2, 90)} sacks of ${g} at the ${pick(r, DIRS)} depot after a ${int(r, 2, 14)}-hour run from ${pick(r, TOWNS)}.`,
  (r, n, g) =>
    `A wagon driven by ${n} brought ${int(r, 2, 90)} barrels of ${g} into the ${pick(r, DIRS)} depot on day ${int(r, 1, 360)}.`,
  (r, n, g) =>
    `Shipment of ${g} (${int(r, 2, 90)} units) left ${pick(r, TOWNS)} with ${n}; the ${pick(r, DIRS)} depot logged it on day ${int(r, 1, 360)}.`,
];

const CODE = (r: Rng) =>
  `${String.fromCharCode(65 + int(r, 0, 25))}${String.fromCharCode(65 + int(r, 0, 25))}-${int(r, 1000, 9999)}`;

const count = (hay: string, s: string) => hay.split(s).length - 1;

interface Spec {
  family: string;
  kind: "literal" | "nonlexical" | "count";
  /** Target size in estimated tokens (chars / 4). */
  tokens: number;
  seed: number;
}

/** Build a ledger of ~`tokens`·4 chars with `needles` spliced in at sampled depths. */
function ledger(
  rng: Rng,
  tokens: number,
  needles: string[],
  names: string[],
  goods: string[],
): string {
  const lines: string[] = [];
  let chars = 0;
  while (chars < tokens * 4) {
    const line = pick(rng, TEMPLATES)(rng, pick(rng, names), pick(rng, goods));
    lines.push(line);
    chars += line.length + 12;
  }
  for (const n of needles)
    lines.splice(int(rng, Math.floor(lines.length * 0.1), Math.floor(lines.length * 0.9)), 0, n);
  return lines.map((l, i) => `Entry ${String(i + 1).padStart(4, "0")}: ${l}`).join("\n");
}

const frame = (hay: string, question: string) =>
  `Below is a depot shipping ledger. Read it and answer the question that follows it.\n\n<ledger>\n${hay}\n</ledger>\n\nQuestion: ${question}`;

function generate(s: Spec): Generated {
  const rng = rngFor(`${s.family}_${s.tokens}`, s.seed);
  return redraw(s.family, () => {
    let prompt: string;
    let key: string;
    let extract: string;
    let wrong: string[];
    let why: string;
    if (s.kind === "literal") {
      const [target, ...others] = shuffle(rng, DIRS);
      key = CODE(rng);
      const distractors = (others as string[]).map((d) => ({ d, code: CODE(rng) }));
      const needles = [
        `Note: the vault code for the ${target} depot is ${key}.`,
        ...distractors.map(({ d, code }) => `Note: the vault code for the ${d} depot is ${code}.`),
      ];
      const hay = ledger(rng, s.tokens, needles, NAMES, GOODS);
      const codes = hay.match(/\b[A-Z]{2}-\d{4}\b/g) ?? [];
      if (count(hay, key) !== 1 || new Set(codes).size !== codes.length) return null;
      prompt = frame(
        hay,
        `What is the vault code for the ${target} depot? Reply with only the code.`,
      );
      extract = "\\b([A-Z]{2}-\\d{4})\\b";
      wrong = distractors.map((x) => x.code);
      why = `Planted note for the ${target} depot; ${distractors.length} distractor codes for other depots.`;
    } else if (s.kind === "nonlexical") {
      const { landmark, city } = pick(rng, LANDMARKS);
      const [answer, ...lookalikes] = shuffle(rng, NAMES).slice(0, 5) as [string, ...string[]];
      key = answer;
      const needles = [
        `Out of the blue, ${answer} remarked that their balcony looks straight out at the ${landmark}.`,
        ...lookalikes.map(
          (n) =>
            `Out of the blue, ${n} remarked that their balcony looks straight out at ${pick(rng, VIEWS)}.`,
        ),
      ];
      const hay = ledger(
        rng,
        s.tokens,
        needles,
        NAMES.filter((n) => n !== answer),
        GOODS,
      );
      if (count(hay, answer) !== 1 || hay.includes(city) || count(hay, landmark) !== 1) return null;
      prompt = frame(
        hay,
        `Which person mentioned in the ledger lives in ${city}? Reply with only their name.`,
      );
      extract = `\\b(${NAMES.join("|")})\\b`;
      wrong = lookalikes.slice(0, 2);
      why = `NoLiMa-style: needle names the ${landmark}; the question asks for ${city}, sharing no keyword with it. ${lookalikes.length} look-alike balcony remarks.`;
    } else {
      const cargo = "saffron";
      const k = int(rng, 5, 9);
      const needles = Array.from({ length: k }, () =>
        pick(rng, TEMPLATES)(rng, pick(rng, NAMES), cargo),
      );
      const hay = ledger(rng, s.tokens, needles, NAMES, GOODS);
      if (count(hay, cargo) !== k) return null;
      key = String(k);
      prompt = frame(
        hay,
        `How many ledger entries record a shipment of ${cargo}? Reply with only the number.`,
      );
      extract = "(\\d+)";
      wrong = [String(k - 1), String(k + 1)];
      why = `${k} planted ${cargo} entries; filler cargo never includes ${cargo}.`;
    }
    const core = s.tokens <= 8000;
    const name = seedName(`${s.family}_${core ? "8k" : "32k"}`, s.seed);
    const est = Math.round(prompt.length / 4);
    return {
      authored: withMeta(exactItem({
        name,
        category: "long-context",
        tier: core ? 3 : 4,
        prompt,
        expected: key,
        extract,
        tags: ["long-context"],
        why: `${why} Prompt ${prompt.length} chars ≈ ${est} tokens (chars/4). gold: ${key}`,
      }), s.seed, core ? "core" : "stretch"),
      units: [{ gold: key, wrong }],
    };
  });
}

// 8K core, 32K stretch. Targets are chars/4 estimates sized so the REAL prompt
// stays under ~7.5K / ~30K tokens on the most expansive tokenizer measured
// (qwen3.8/cyber-tiel run ~1.32x chars/4), leaving 32K of output budget in a
// 64K window.
const SPECS: Spec[] = [
  { family: "longctx_literal", kind: "literal", tokens: 5600, seed: 0 },
  { family: "longctx_literal", kind: "literal", tokens: 5600, seed: 1 },
  { family: "longctx_literal", kind: "literal", tokens: 22500, seed: 0 },
  { family: "longctx_literal", kind: "literal", tokens: 22500, seed: 1 },
  { family: "longctx_nonlexical", kind: "nonlexical", tokens: 5600, seed: 0 },
  { family: "longctx_nonlexical", kind: "nonlexical", tokens: 22500, seed: 0 },
  { family: "longctx_count", kind: "count", tokens: 5600, seed: 0 },
  { family: "longctx_count", kind: "count", tokens: 22500, seed: 0 },
];

export function longctxItems(): Generated[] {
  return SPECS.map((s) => {
    const g = generate(s);
    return { ...g, authored: { ...g.authored, item: { ...g.authored.item, family: s.family } } };
  });
}
