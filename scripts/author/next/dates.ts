// P6 — date and unit arithmetic. Keys come from UTC `Date` math and from exact
// conversion factors; exact_match. Unit conversions carry rounding-slip near
// misses (truncation, rounding an intermediate) at 0.5; date answers have none
// (an off-by-one is conceptual and earns 0).

import { FORMAT_FLAW_CREDIT } from "../../../src/scoring/score-result.js";
import { exactItem } from "../emit.js";
import {
  answerScreenOk,
  type Generated,
  int,
  pick,
  type Rng,
  redraw,
  rngFor,
  seedName,
  withMeta,
} from "./common.js";

const DAY = 86_400_000;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const long = (t: number) => {
  const d = new Date(t);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
};
const weekday = (t: number) => WEEKDAYS[new Date(t).getUTCDay()] ?? "";
const isWeekend = (t: number) => [0, 6].includes(new Date(t).getUTCDay());
const randomDay = (rng: Rng) => Date.UTC(int(rng, 2023, 2027), int(rng, 0, 11), int(rng, 1, 28));

// Anchored to the ANSWER: marker, any case (the prompts ask for working first, so
// the last bare number is often not the answer); tolerates **bold** on the marker
// or value. Without a marker, the last bare value is read as a format flaw.
const ANSWER = "(?i)ANSWER:\\*{0,2}\\s*\\*{0,2}";
const INT = "(-?\\d[\\d,]*)";
const DATE = "(\\d{4}-\\d{2}-\\d{2})";
const DEC = "(-?\\d[\\d,]*(?:\\.\\d+)?)";
const INT_EXTRACT = { extract: `${ANSWER}${INT}`, fallbackExtract: INT };
const DATE_EXTRACT = { extract: `${ANSWER}${DATE}`, fallbackExtract: DATE };
const DEC_EXTRACT = { extract: `${ANSWER}${DEC}`, fallbackExtract: DEC };

/** Validation outputs: gold is worked, bolded, and trails a bare number that is not the
 *  key; a marker-less statement of the key is a format flaw. */
const answered = (v: string) => `ANSWER: ${v}`;
const goldOutput = (key: string) =>
  `Working it out step by step.\nANSWER: **${key}** (checked 2 ways)`;
const formatFlaw = (key: string) => ({
  answer: `Working it out, I get ${key}.`,
  credit: FORMAT_FLAW_CREDIT,
});

/** Days from start to end (end − start). */
export const daysBetween = (start: number, end: number): number => Math.round((end - start) / DAY);

/** The date `n` business days after `start` (start not counted), skipping weekends and holidays. */
export function addBusinessDays(start: number, n: number, holidays: number[]): number {
  let t = start;
  let left = n;
  while (left > 0) {
    t += DAY;
    if (!isWeekend(t) && !holidays.includes(t)) left--;
  }
  return t;
}

function daysBetweenItem(seed: number): Generated {
  const family = "dates_days_between";
  const rng = rngFor(family, seed);
  return redraw(family, () => {
    const a = randomDay(rng);
    const b = a + int(rng, 40, 900) * DAY;
    const key = String(daysBetween(a, b));
    const prompt = `How many days are there from ${long(a)} to ${long(b)}? Count the difference between the two dates: the start date is day 0, so from January 1 to January 2 is 1 day. Work it out step by step, then write ANSWER: followed by only the number of days.`;
    if (!answerScreenOk(prompt, key)) return null;
    const name = seedName(family, seed);
    return {
      authored: withMeta(
        exactItem({
          name,
          category: "dates",
          tier: 2,
          prompt,
          expected: key,
          ...INT_EXTRACT,
          tags: ["dates"],
          why: `UTC day difference ${iso(a)} → ${iso(b)} = ${key}. gold: ${key}`,
        }),
        seed,
        "core",
      ),
      units: [
        {
          gold: goldOutput(key),
          wrong: [answered(String(Number(key) + 1))],
          nearMiss: [formatFlaw(key)],
        },
      ],
    };
  });
}

function businessDaysItem(seed: number): Generated {
  const family = "dates_business_days";
  const rng = rngFor(family, seed);
  return redraw(family, () => {
    const start = randomDay(rng);
    if (isWeekend(start)) return null;
    const n = int(rng, 8, 25);
    const naive = addBusinessDays(start, n, []);
    // Two holidays on distinct weekdays strictly inside the naive window, so both bite.
    const span = daysBetween(start, naive);
    const hs = [int(rng, 1, span), int(rng, 1, span)].map((d) => start + d * DAY);
    const holidays = [...new Set(hs)].sort((x, y) => x - y);
    if (holidays.length < 2 || holidays.some(isWeekend)) return null;
    const key = iso(addBusinessDays(start, n, holidays));
    const countingStart = iso(addBusinessDays(start - DAY, n, holidays));
    const prompt = [
      `A task starts on ${weekday(start)}, ${iso(start)}. What is the date ${n} business days later?`,
      `Business days are Monday through Friday, excluding these holidays: ${holidays.map((h) => `${weekday(h)} ${iso(h)}`).join(" and ")}.`,
      "The start date itself is not counted: one business day after a Friday is the following Monday.",
      "Work it out step by step, then write ANSWER: followed by only the date in YYYY-MM-DD format.",
    ].join(" ");
    if (prompt.includes(key) || key === iso(naive) || key === countingStart) return null;
    const name = seedName(family, seed);
    return {
      authored: withMeta(
        exactItem({
          name,
          category: "dates",
          tier: 2,
          prompt,
          expected: key,
          ...DATE_EXTRACT,
          tags: ["dates"],
          why: `${n} business days after ${iso(start)} skipping weekends and ${holidays.map(iso).join(", ")} = ${key} (ignoring holidays: ${iso(naive)}). gold: ${key}`,
        }),
        seed,
        "core",
      ),
      units: [
        {
          gold: goldOutput(key),
          wrong: [answered(iso(naive)), answered(countingStart)],
          nearMiss: [formatFlaw(key)],
        },
      ],
    };
  });
}

// Exact definitions (NIST): 1 mi = 1.609344 km, 1 US gal = 3.785411784 L,
// 1 ft = 0.3048 m, 1 lb = 0.45359237 kg = 16 oz.
const MI = 1.609344;
const GAL = 3.785411784;
const FT = 0.3048;
const LB = 0.45359237;

const roundTo = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
const truncTo = (x: number, d: number) => Math.trunc(x * 10 ** d) / 10 ** d;

interface Conversion {
  question: string;
  /** Exact value; `perStep` is the value when an intermediate is rounded to `d` places first. */
  value: number;
  perStep?: number;
  /** Plausible conceptual miss: an approximate factor. */
  approx: number;
  why: string;
}

const CONVERSIONS: ((rng: Rng) => Conversion)[] = [
  (rng) => {
    const mpg = int(rng, 180, 520) / 10;
    const kmPerL = (mpg * MI) / GAL;
    return {
      question: `A car is rated at ${mpg} miles per US gallon. What is its fuel consumption in litres per 100 km? Use 1 mile = 1.609344 km and 1 US gallon = 3.785411784 litres exactly.`,
      value: 100 / kmPerL,
      perStep: 100 / roundTo(kmPerL, 2),
      approx: 100 / ((mpg * 1.6) / 3.785),
      why: `100 / (${mpg}·1.609344/3.785411784)`,
    };
  },
  (rng) => {
    const l = int(rng, 90, 260) / 10;
    const w = int(rng, 70, 200) / 10;
    return {
      question: `A room measures ${l} ft by ${w} ft. What is its floor area in square metres? Use 1 ft = 0.3048 m exactly.`,
      value: l * FT * (w * FT),
      perStep: roundTo(l * FT, 2) * roundTo(w * FT, 2),
      approx: l * 0.3 * (w * 0.3),
      why: `${l}·0.3048 × ${w}·0.3048`,
    };
  },
  (rng) => {
    const lb = int(rng, 3, 40);
    const oz = int(rng, 1, 15);
    return {
      question: `A parcel weighs ${lb} lb ${oz} oz. What is its mass in kilograms? Use 1 lb = 16 oz and 1 lb = 0.45359237 kg exactly.`,
      value: (lb + oz / 16) * LB,
      perStep: roundTo(lb + oz / 16, 2) * LB,
      approx: (lb + oz / 10) * LB,
      why: `(${lb} + ${oz}/16)·0.45359237`,
    };
  },
  (rng) => {
    const mph = int(rng, 25, 85);
    return {
      question: `A train travels at ${mph} miles per hour. What is its speed in metres per second? Use 1 mile = 1609.344 m exactly.`,
      value: (mph * 1609.344) / 3600,
      approx: (mph * 1600) / 3600,
      why: `${mph}·1609.344/3600`,
    };
  },
];

function conversionItem(seed: number): Generated {
  const family = "units_conversion";
  const rng = rngFor(family, seed);
  return redraw(family, () => {
    const c = (CONVERSIONS[seed % CONVERSIONS.length] ?? pick(rng, CONVERSIONS))(rng);
    const d = 2;
    const frac = c.value * 10 ** d - Math.floor(c.value * 10 ** d);
    // no rounding ties, and no exact 2-dp values (float truncation would misfire)
    if (Math.abs(frac - 0.5) < 1e-6 || frac < 1e-6 || frac > 1 - 1e-6) return null;
    const key = roundTo(c.value, d).toFixed(d);
    if (key.endsWith("0")) return null; // "12.30" vs "12.3" would be a formatting miss
    const slips: { slip: string; v: string }[] = [
      { slip: "truncated", v: truncTo(c.value, d).toFixed(d) },
    ];
    if (c.perStep !== undefined)
      slips.push({ slip: "round-intermediate", v: roundTo(c.perStep, d).toFixed(d) });
    const nearMisses = slips
      .filter((s, i) => s.v !== key && slips.findIndex((o) => o.v === s.v) === i)
      .map((s) => ({ slip: s.slip, credit: 0.5, expected: s.v }));
    if (nearMisses.length === 0) return null; // every conversion item exercises the rounding slip
    const approx = roundTo(c.approx, d).toFixed(d);
    const prompt = `${c.question} Round only the final answer to ${d} decimal places. Work it out step by step, then write ANSWER: followed by only the number.`;
    if (
      !answerScreenOk(
        prompt,
        key,
        nearMisses.map((n) => n.expected),
      )
    )
      return null;
    if (approx === key || nearMisses.some((n) => n.expected === approx)) return null;
    const name = seedName(family, seed);
    const base = exactItem({
      name,
      category: "units",
      tier: 2,
      prompt,
      expected: key,
      ...DEC_EXTRACT,
      tags: ["units"],
      why: `${c.why} = ${c.value} → ${key}; slips ${nearMisses.map((n) => `${n.slip} ${n.expected}`).join(", ")}. gold: ${key}`,
    });
    return {
      authored: withMeta({ ...base, item: { ...base.item, nearMisses } }, seed, "core"),
      units: [
        {
          gold: goldOutput(key),
          wrong: [answered(approx)],
          nearMiss: [
            ...nearMisses.map((n) => ({ answer: answered(n.expected), credit: n.credit })),
            formatFlaw(key),
          ],
        },
      ],
    };
  });
}

export const SEEDS = [0, 1, 2, 3];

export function dateItems(): Generated[] {
  return [daysBetweenItem, businessDaysItem, conversionItem].flatMap((gen) =>
    SEEDS.map((s) => {
      const g = gen(s);
      // family = scenario; set after construction so it sits beside the other metadata
      const family = String(g.authored.item["name"]).replace(/_s\d+$/, "");
      return { ...g, authored: { ...g.authored, item: { ...g.authored.item, family } } };
    }),
  );
}
