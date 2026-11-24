// P5 — Regex authoring. A spec plus labeled examples in the prompt; the test
// code runs the model's pattern with re.fullmatch over the shown cases and
// held-out cases that live only in the test file. Each seed draws a spec
// variant (year range, ID shape, CIDR suffix) and its own cases.

import {
  type DataItem,
  type Family,
  pad,
  type Rng,
  rngFor,
  submissionItem,
} from "./data-common.js";

const testCode = (positive: readonly string[], negative: readonly string[]): string =>
  [
    "import re",
    "",
    `POSITIVE = ${JSON.stringify(positive)}`,
    `NEGATIVE = ${JSON.stringify(negative)}`,
    "_p = re.compile(SUBMISSION)",
    "_bad = [s for s in POSITIVE if not _p.fullmatch(s)] + [s for s in NEGATIVE if _p.fullmatch(s)]",
    'assert not _bad, "misclassified %d of %d: %r" % (len(_bad), len(POSITIVE) + len(NEGATIVE), _bad[:5])',
    "",
  ].join("\n");

const uniq = (xs: readonly string[]) => [...new Set(xs)];

interface Spec {
  family: string;
  seed: number;
  rng: Rng;
  spec: string;
  gold: string;
  wrong: string[];
  positive: string[];
  negative: string[];
}

/** Show 4 positives and 4 negatives; every case (shown and held out) is tested. */
const regexItem = (s: Spec): DataItem => {
  const positive = uniq(s.positive);
  const negative = uniq(s.negative).filter((n) => !positive.includes(n));
  const shownPos = s.rng.sample(positive, 4);
  const shownNeg = s.rng.sample(negative, 4);
  const show = (xs: string[]) => xs.map((x) => `  ${JSON.stringify(x)}`).join("\n");
  const prompt =
    `Write a Python regular expression that matches ${s.spec}\n\n` +
    `It will be tested with re.fullmatch (so anchors are optional) against held-out strings: it must match every ` +
    `valid string and reject every invalid one. Examples (shown as JSON strings):\n\n` +
    `Must match:\n${show(shownPos)}\n\nMust not match:\n${show(shownNeg)}\n\n` +
    "Reply with only the pattern in a ```regex fenced block.";
  return submissionItem({
    family: s.family,
    seed: s.seed,
    category: "regex",
    tier: 2,
    lang: "regex",
    prompt,
    why: `reference: ${s.gold} (${positive.length} positive, ${negative.length} negative cases)`,
    testCode: testCode(positive, negative),
    gold: s.gold,
    wrong: s.wrong,
  });
};

// ── ISO dates ───────────────────────────────────────────────────────────────
const YEAR_RULES = [
  { text: "any four-digit year", pat: "\\d{4}", lo: 0, hi: 9999 },
  { text: "a year from 1900 to 2099", pat: "(?:19|20)\\d{2}", lo: 1900, hi: 2099 },
  { text: "a year from 2000 to 2099", pat: "20\\d{2}", lo: 2000, hi: 2099 },
] as const;
const MONTH = "(?:0[1-9]|1[0-2])";
const DAY = "(?:0[1-9]|[12]\\d|3[01])";

const isoDate = (seed: number): DataItem => {
  const family = "regex_iso_date";
  const rng = rngFor(family, seed);
  const rule = YEAR_RULES[seed % YEAR_RULES.length] as (typeof YEAR_RULES)[number];
  const y = () => pad(rng.int(Math.max(rule.lo, 1000), rule.hi), 4);
  const date = (yy: string, m: number, d: number) => `${yy}-${pad(m)}-${pad(d)}`;
  const positive = [
    ...Array.from({ length: 10 }, () => date(y(), rng.int(1, 12), rng.int(1, 31))),
    date(y(), 1, 1),
    date(y(), 12, 31),
    date(y(), 2, 31), // per the spec, days are not checked per month
    date(y(), 10, 30),
  ];
  if (rule.lo === 0) positive.push(date("0000", 6, 15));
  const yy = y();
  const negative = [
    date(yy, 0, 10),
    date(yy, 13, 10),
    date(yy, 7, 0),
    date(yy, 7, 32),
    `${yy}-${rng.int(1, 9)}-15`,
    `${yy}-11-${rng.int(1, 9)}`,
    `${yy}/03/15`,
    `${yy}03-15`,
    ` ${date(yy, 3, 15)}`,
    `${date(yy, 3, 15)}T10:00`,
    `${yy}0-03-15`,
    `${yy.slice(1)}-03-15`,
    `${yy}-3x-15`,
    date(yy, 20, 5),
    date(yy, 4, 40),
  ];
  if (rule.lo === 1900) negative.push(date("1899", 5, 5), date("2100", 5, 5), date("1850", 1, 1));
  if (rule.lo === 2000) negative.push(date("1999", 12, 31), date("2100", 1, 1), date("1987", 6, 6));
  return regexItem({
    family,
    seed,
    rng,
    spec:
      `an ISO calendar date YYYY-MM-DD: ${rule.text}, a month from 01 to 12 and a day from 01 to 31, separated by ` +
      `hyphens, with nothing before or after. Do not check days per month (2023-02-31 counts as valid).`,
    gold: `${rule.pat}-${MONTH}-${DAY}`,
    wrong: ["\\d{4}-\\d{2}-\\d{2}", `${rule.pat}-${MONTH}-\\d{2}`],
    positive,
    negative,
  });
};

// ── Order IDs ───────────────────────────────────────────────────────────────
const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const orderId = (seed: number): DataItem => {
  const family = "regex_order_id";
  const rng = rngFor(family, seed);
  const prefix = rng.pick(["ORD", "PO", "SO", "INV"]);
  const letters = rng.int(2, 3);
  const digits = rng.int(5, 7);
  const revision = seed % 2 === 0;
  const word = (n: number) => Array.from({ length: n }, () => rng.pick([...ALPHA])).join("");
  const num = (n: number) => Array.from({ length: n }, () => String(rng.int(0, 9))).join("");
  const id = (l = word(letters), d = num(digits)) => `${prefix}-${l}-${d}`;
  const positive = Array.from({ length: 10 }, () => id());
  positive.push(id(word(letters), "0".repeat(digits)));
  if (revision) positive.push(...Array.from({ length: 4 }, () => `${id()}-R${rng.int(1, 9)}`));
  const negative = [
    id(word(letters).toLowerCase()),
    id(word(letters - 1)),
    id(word(letters + 1)),
    id(undefined, num(digits - 1)),
    id(undefined, num(digits + 1)),
    `${prefix.toLowerCase()}-${word(letters)}-${num(digits)}`,
    `${prefix}${word(letters)}-${num(digits)}`,
    `${prefix}-${word(letters)}${num(digits)}`,
    `X${id()}`,
    `${id()} `,
    `${prefix}-${word(letters - 1)}1-${num(digits)}`,
    `${id()}-R0`,
    `${id()}-R12`,
    `${id()}-r3`,
  ];
  if (!revision) negative.push(`${id()}-R4`, `${id()}-R7`);
  const core = `${prefix}-[A-Z]{${letters}}-\\d{${digits}}`;
  return regexItem({
    family,
    seed,
    rng,
    spec:
      `an order ID: the prefix "${prefix}-", then exactly ${letters} uppercase ASCII letters, a hyphen, and exactly ${digits} digits` +
      (revision
        ? `, optionally followed by a revision suffix "-R" and one digit from 1 to 9.`
        : `. Nothing may come before or after.`),
    gold: revision ? `${core}(?:-R[1-9])?` : core,
    wrong: [`${prefix}-[A-Za-z]+-\\d+(?:-R\\d)?`, revision ? core : `${core}(?:-R[1-9])?`],
    positive,
    negative,
  });
};

// ── IPv4 ────────────────────────────────────────────────────────────────────
const OCTET = "(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const LOOSE_OCTET = "\\d{1,3}";
const CIDR = "/(?:3[0-2]|[12]?\\d)";
const CIDR_MODES = ["none", "optional", "required"] as const;

const ipv4 = (seed: number): DataItem => {
  const family = "regex_ipv4";
  const rng = rngFor(family, seed);
  const mode = CIDR_MODES[seed % CIDR_MODES.length] as (typeof CIDR_MODES)[number];
  const oct = () => String(rng.pick([rng.int(0, 9), rng.int(10, 99), rng.int(100, 255), 255, 0]));
  const addr = () => [oct(), oct(), oct(), oct()].join(".");
  const prefix = () => `/${rng.int(0, 32)}`;
  const plain = [...Array.from({ length: 10 }, addr), "0.0.0.0", "255.255.255.255", "10.0.0.1"];
  const withCidr = [...plain.slice(0, 6).map((a) => a + prefix()), `${addr()}/0`, `${addr()}/32`];
  const positive =
    mode === "none" ? plain : mode === "optional" ? [...plain, ...withCidr] : withCidr;
  const bad = [
    "256.1.1.1",
    `${oct()}.${oct()}.300.${oct()}`,
    `${oct()}.${oct()}.${oct()}`,
    `${addr()}.${oct()}`,
    `01.${oct()}.${oct()}.${oct()}`,
    `${oct()}.${oct()}.${oct()}.007`,
    `${oct()}..${oct()}.${oct()}`,
    ` ${addr()}`,
    `${addr()}.`,
    `${oct()}.${oct()}.${oct()}.1000`,
    `${oct()}.${oct()}.-1.${oct()}`,
  ];
  const negative =
    mode === "none"
      ? [...bad, `${addr()}/24`]
      : [
          ...(mode === "required" ? [...bad.map((b) => `${b}/24`), addr(), addr()] : bad),
          `${addr()}/33`,
          `${addr()}/024`,
          `${addr()}/`,
          `${addr()}/8/8`,
        ];
  const quad = (o: string) => `${o}(?:\\.${o}){3}`;
  const suffix = mode === "none" ? "" : mode === "optional" ? `(?:${CIDR})?` : CIDR;
  const spec =
    `an IPv4 address: four decimal octets from 0 to 255 separated by dots, with no leading zeros (0 is fine, 01 is not)` +
    (mode === "none"
      ? ", and nothing before or after."
      : mode === "optional"
        ? `, optionally followed by a CIDR prefix length: "/" and a number from 0 to 32 with no leading zeros.`
        : `, followed by a required CIDR prefix length: "/" and a number from 0 to 32 with no leading zeros.`);
  return regexItem({
    family,
    seed,
    rng,
    spec,
    gold: quad(OCTET) + suffix,
    wrong: [
      quad(LOOSE_OCTET) + suffix.replace(CIDR, "/\\d{1,2}"),
      quad("(?:25[0-5]|2[0-4]\\d|[01]?\\d?\\d)") + suffix,
    ],
    positive,
    negative,
  });
};

export const regexFamilies: readonly Family[] = [
  { id: "regex_iso_date", build: isoDate },
  { id: "regex_order_id", build: orderId },
  { id: "regex_ipv4", build: ipv4 },
];
