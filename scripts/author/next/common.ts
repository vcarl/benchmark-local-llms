// Shared plumbing for the pilot-batch generators: seeded RNG, the generated-item
// shape the validation test consumes, and the answer screens from the
// dataset-expansion spec (§ Seeded variants).

import { Effect } from "effect";
import type { ConstraintDef } from "../../../src/schema/constraints.js";
import { scoreConstraints } from "../../../src/scoring/constraint.js";
import type { AuthoredItem } from "../emit.js";

export type Rng = () => number;

/** mulberry32: tiny, deterministic, good enough for sampling item params. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over `family:seed`. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** `mulberry32(hash(family, seed))` — a rejected draw redraws from the same stream. */
export const rngFor = (family: string, seed: number): Rng => mulberry32(hash(`${family}:${seed}`));

export const int = (rng: Rng, lo: number, hi: number): number =>
  lo + Math.floor(rng() * (hi - lo + 1));
export const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)] as T;
export function shuffle<T>(rng: Rng, xs: readonly T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** Redraw until `draw` returns non-null. Throws if a family cannot be satisfied (authoring bug). */
export function redraw<T>(family: string, draw: () => T | null, tries = 500): T {
  for (let i = 0; i < tries; i++) {
    const v = draw();
    if (v !== null) return v;
  }
  throw new Error(`${family}: no acceptable draw in ${tries} tries`);
}

/** Item name per spec: seed 0 keeps the bare name, others get `_s<seed>`. */
export const seedName = (base: string, seed: number): string =>
  seed === 0 ? base : `${base}_s${seed}`;

/**
 * An authored item plus the answers its validation test feeds the real scorer,
 * one entry per scored unit (a chain has one per turn): `gold` must score 1,
 * every `wrong` must score below 1, and every near miss must score its credit.
 */
export interface Generated {
  authored: AuthoredItem;
  units: { gold: string; wrong: string[]; nearMiss?: { answer: string; credit: number }[] }[];
}

/** Every standalone number in `text` (commas stripped). */
export const numbersIn = (text: string): string[] =>
  Array.from(text.matchAll(/-?\d[\d,]*(?:\.\d+)?/g), (m) => m[0].replace(/,/g, ""));

/**
 * Spec answer screen: the key differs from every number in the prompt, and each
 * near miss differs from the key, the other near misses, and the prompt numbers.
 */
export function answerScreenOk(prompt: string, key: string, nearMisses: string[] = []): boolean {
  const nums = new Set(numbersIn(prompt).map(Number));
  const all = [key, ...nearMisses].map(Number);
  return all.every((v) => !nums.has(v)) && new Set(all).size === all.length;
}

/** Score `output` against constraint checks with the real scorer (sync). */
export const constraintScore = (output: string, constraints: readonly ConstraintDef[]): number =>
  Effect.runSync(scoreConstraints(output, { type: "constraint", constraints })).score;

/** Stamp the coverage `seed` and `scope` onto an item, right after its name. */
export const withMeta = (
  a: AuthoredItem,
  seed: number,
  scope: "core" | "stretch",
): AuthoredItem => ({ ...a, item: { name: a.item["name"], seed, scope, ...a.item } });
