import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import * as YAML from "yaml";
import type { ExactMatchConfig } from "../schema/scorer.js";
import { scoreExactMatch } from "./exact-match.js";
import { FORMAT_FLAW, FORMAT_FLAW_CREDIT } from "./score-result.js";

const run = <A>(effect: Effect.Effect<A>) => Effect.runSync(effect);

const cfg = (expected: string, extract: string): ExactMatchConfig => ({
  type: "exact_match",
  expected,
  extract,
});

describe("scoreExactMatch", () => {
  it("returns 1 for an exact match on a single capture", () => {
    const c = cfg("42", String.raw`answer:\s*(\d+)`);
    expect(run(scoreExactMatch("answer: 42", c))).toEqual({
      kind: "prompt",
      score: 1,
      details: "correct: 42",
    });
  });

  it("returns 0 and a `no match` message when regex does not match", () => {
    const c = cfg("42", String.raw`answer:\s*(\d+)`);
    const r = run(scoreExactMatch("I have no idea.", c));
    expect(r.score).toBe(0);
    expect(r.details).toContain("no match");
  });

  it("uses the LAST match when multiple captures exist (show-your-work)", () => {
    // Prototype behavior: models show scratch work then the final answer.
    const c = cfg("7", String.raw`answer:\s*(\d+)`);
    const out = "scratch: answer: 3\nrethink: answer: 5\nfinal: answer: 7";
    expect(run(scoreExactMatch(out, c))).toEqual({
      kind: "prompt",
      score: 1,
      details: "correct: 7",
    });
  });

  it("strips commas from numeric answers before comparing", () => {
    const c = cfg("2395912", String.raw`=\s*([\d,]+)`);
    expect(run(scoreExactMatch("result = 2,395,912", c))).toEqual({
      kind: "prompt",
      score: 1,
      details: "correct: 2395912",
    });
  });

  it("reports `got` value on mismatch", () => {
    const c = cfg("42", String.raw`answer:\s*(\d+)`);
    const r = run(scoreExactMatch("answer: 41", c));
    expect(r).toEqual({ kind: "prompt", score: 0, details: "expected 42, got 41" });
  });

  it("falls back to whole match when pattern has no capture group", () => {
    // Python: re.findall with no capture returns the whole match.
    const c = cfg("42", String.raw`\d+`);
    expect(run(scoreExactMatch("sum = 10 + 32 = 42", c))).toEqual({
      kind: "prompt",
      score: 1,
      details: "correct: 42",
    });
  });

  it("is case-sensitive on the expected comparison", () => {
    const c = cfg("YES", "([A-Za-z]+)");
    const r = run(scoreExactMatch("answer: yes", c));
    expect(r.score).toBe(0);
  });
});

describe("scoreExactMatch — answer marker", () => {
  const c: ExactMatchConfig = {
    ...cfg("300", String.raw`(?i)ANSWER:\s*(\d+)`),
    fallbackExtract: String.raw`(\d+)`,
  };
  const score = (out: string) => run(scoreExactMatch(out, c));

  it("reads the marker in any case at full credit", () => {
    for (const o of ["ANSWER: 300", "Answer: 300", "answer:300"]) expect(score(o).score, o).toBe(1);
  });

  it("reads a correct marker-less answer as a format flaw", () => {
    expect(score("10 plus 290 is 300.")).toEqual({
      kind: "prompt",
      score: FORMAT_FLAW_CREDIT,
      details: "format flaw (no answer marker): correct: 300",
      nearMiss: FORMAT_FLAW,
    });
  });

  it("keeps a wrong marker-less answer at 0 (no_answer)", () => {
    expect(score("I get 301.")).toMatchObject({ score: 0, failure: "no_answer" });
  });

  it("never consults the fallback when the marker is present", () => {
    expect(score("300 at first, but ANSWER: 301").score).toBe(0);
  });
});

// Erratum 0.7: every integer-answer item in the release reads the integer
// whatever its formatting (thousands separators, a zero-cents tail, a
// currency sign or unit) and still fails a wrong value.
describe("release integer extracts", () => {
  const challengesDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../releases/0/challenges",
  );
  const items = readdirSync(challengesDir)
    .filter((f) => f.endsWith(".yaml"))
    .flatMap((f) => {
      type Item = { id: string; name: string; scorer: string; expected?: string; extract?: string };
      const suite = YAML.parse(readFileSync(path.join(challengesDir, f), "utf8"));
      return (suite.items as Item[]).map((i) => ({ ...i, id: suite.id as string }));
    })
    // Year answers (`\d{4}`) are never written with separators or decimals.
    .filter(
      (i) =>
        i.scorer === "exact_match" &&
        /^\d+$/.test(i.expected ?? "") &&
        !(i.extract ?? "").includes("\\d{4}"),
    );
  const fmt = (n: number) => n.toLocaleString("en-US");
  const prefixes = ["", "ANSWER: ", '{"result": ', '{"answer": '];

  it("finds the integer items", () => expect(items.length).toBeGreaterThan(50));

  it.each(items.map((i) => [`${i.id}/${i.name}`, i] as const))("%s", (_, i) => {
    const c = cfg(i.expected ?? "", i.extract ?? "");
    const score = (out: string) => run(scoreExactMatch(out, c)).score;
    const prefix = prefixes.find((p) => score(`${p}${i.expected}`) === 1);
    expect(prefix).toBeDefined();
    const n = Number(i.expected);
    // An anchored extract (`ANSWER:`, JSON) reads the number right after the anchor.
    const cur = prefix === "" ? "$" : "";
    for (const ok of [fmt(n), `${cur}${fmt(n)}.00`, `${n}.0`, `${fmt(n)} units`]) {
      expect(score(`work: 12, 3.5\n${prefix}${ok}`), ok).toBe(1);
    }
    const fraction = prefix === "" ? [`${n}.01`] : [];
    for (const bad of [fmt(n + 1), `${cur}${fmt(n + 1)}.00`, ...fraction]) {
      expect(score(`${prefix}${bad}`), bad).toBe(0);
    }
  });

  it("the extracts they replace misread a formatted 1331", () => {
    const score = (out: string, extract: string) =>
      run(scoreExactMatch(out, cfg("1331", extract))).score;
    expect(score("$1,331.00", String.raw`(\d[\d,]*)`)).toBe(0);
    expect(score("1,331", String.raw`(\d+)`)).toBe(0);
  });
});
