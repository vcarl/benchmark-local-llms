// Shared plumbing for the seeded data-work generators (extraction, transform,
// SQL, regex): the seeded RNG and the item shape each family returns.

import type { AuthoredItem } from "../emit.js";
import { rngFor as streamFor } from "./common.js";

export interface Rng {
  /** Integer in [lo, hi], inclusive. */
  int(lo: number, hi: number): number;
  pick<T>(xs: readonly T[]): T;
  /** `n` distinct elements in random order. */
  sample<T>(xs: readonly T[], n: number): T[];
  chance(p: number): boolean;
}

/** `mulberry32(hash(family, seed))` — the same (family, seed) always yields the same stream. */
export const rngFor = (family: string, seed: number): Rng => {
  const next = streamFor(family, seed);
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1));
  return {
    int,
    pick: (xs) => xs[int(0, xs.length - 1)] as (typeof xs)[number],
    sample: (xs, n) => {
      const pool = [...xs];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = int(0, i);
        [pool[i], pool[j]] = [pool[j] as (typeof pool)[number], pool[i] as (typeof pool)[number]];
      }
      return pool.slice(0, n);
    },
    chance: (p) => next() < p,
  };
};

/**
 * Draw until `screen` accepts (returns null). A rejected draw redraws from the
 * same stream, so a seed always yields the same item.
 */
export const screened = <T>(
  rng: Rng,
  draw: (rng: Rng) => T,
  screen: (p: T) => string | null,
): T => {
  for (let i = 0; i < 1000; i++) {
    const p = draw(rng);
    if (screen(p) === null) return p;
  }
  throw new Error("screen rejected 1000 draws");
};

/** One generated item plus what the validation test needs. */
export interface DataItem {
  readonly authored: AuthoredItem;
  /** An answer that must score 1 under the item's own grader. */
  readonly gold: string;
  /** Plausible wrong answers that must score below 1. */
  readonly wrong: readonly string[];
  /** Companion test file for code_exec items: written next to the YAML. */
  readonly testFile?: { readonly name: string; readonly content: string };
}

export interface Family {
  /** Scenario id: the item's `family`, and the name stem of every variant. */
  readonly id: string;
  readonly build: (seed: number) => DataItem;
}

export interface DataSet {
  /** Challenge id and YAML file stem under releases/draft/challenges/. */
  readonly id: string;
  readonly families: readonly Family[];
  readonly seeds: readonly number[];
}

/** Item metadata shared by every variant: family, seed, core scope, name `<family>_s<seed>`. */
export const variantMeta = (family: string, seed: number) => ({
  name: `${family}_s${seed}`,
  family,
  seed,
  scope: "core" as const,
});

interface ItemFields {
  family: string;
  seed: number;
  category: string;
  tier: number;
  prompt: string;
  why: string;
}

/** A constraint item graded by `json_matches` against `value`; the gold answer is `value` itself. */
export const jsonItem = (
  f: ItemFields & { value: unknown; wrong: readonly unknown[] },
): DataItem => ({
  authored: {
    why: f.why,
    item: {
      ...variantMeta(f.family, f.seed),
      category: f.category,
      tier: f.tier,
      prompt: f.prompt,
      scorer: "constraint",
      constraints: [{ name: "matches key", check: "json_matches", value: f.value }],
    },
  },
  gold: `\`\`\`json\n${JSON.stringify(f.value, null, 2)}\n\`\`\``,
  wrong: f.wrong.map((w) => JSON.stringify(w)),
});

/** A code_exec item in submission mode; `testCode` lives in `<name>.test.py` beside the YAML. */
export const submissionItem = (
  f: ItemFields & { lang: string; testCode: string; gold: string; wrong: readonly string[] },
): DataItem => {
  const meta = variantMeta(f.family, f.seed);
  const testFile = `${meta.name}.test.py`;
  return {
    authored: {
      why: f.why,
      item: {
        ...meta,
        category: f.category,
        tier: f.tier,
        prompt: f.prompt,
        scorer: "code_exec",
        submission: f.lang,
        testFile,
      },
    },
    gold: `\`\`\`${f.lang}\n${f.gold}\n\`\`\``,
    wrong: f.wrong.map((w) => `\`\`\`${f.lang}\n${w}\n\`\`\``),
    testFile: { name: testFile, content: f.testCode },
  };
};

/** Integer cents → a JSON number of dollars (exact to the cent). */
export const dollars = (cents: number): number => Number((cents / 100).toFixed(2));

/** `1234.5` → `"1,234.50"`. */
export const money = (cents: number): string =>
  (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const MONTHS = [
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
] as const;

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** A date in a given year as ISO and as prose ("March 4, 2024"). Days 1–28 so every month is valid. */
export const drawDate = (rng: Rng, year: number) => {
  const m = rng.int(1, 12);
  const d = rng.int(1, 28);
  return {
    iso: `${year}-${pad(m)}-${pad(d)}`,
    prose: `${MONTHS[m - 1]} ${d}, ${year}`,
    m,
    d,
  };
};

export { pad };
