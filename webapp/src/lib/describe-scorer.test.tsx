import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { describeScorer } from "./describe-scorer";

const text = (scorer: unknown): string => {
  const html = renderToStaticMarkup(describeScorer(scorer) as React.ReactElement);
  // Strip tags so assertions read against the visible prose, not markup.
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
};

// Raw markup (tags intact) so breakdown-mark assertions can see ✓/✗ glyphs and
// their aria-labels/titles.
const raw = (scorer: unknown, breakdown?: unknown): string =>
  renderToStaticMarkup(describeScorer(scorer, breakdown) as React.ReactElement);

describe("describeScorer", () => {
  it("describes exact_match with an extract pattern", () => {
    const out = text({ type: "exact_match", expected: "51", extract: "(\\d+)" });
    expect(out).toContain("Exact match");
    expect(out).toContain("(\\d+)");
    expect(out).toContain("51");
  });

  it("describes exact_match without an extract pattern", () => {
    const out = text({ type: "exact_match", expected: "yes" });
    expect(out).toContain("Compare the output to");
    expect(out).toContain("yes");
  });

  it("lists constraint checks by name and type", () => {
    const out = text({
      type: "constraint",
      constraints: [
        { check: "regex", name: "matches Confess", pattern: "x" },
        { check: "min_length", name: "long", length: 50 },
      ],
    });
    expect(out).toContain("2 checks");
    expect(out).toContain("matches Confess");
    expect(out).toContain("(regex)");
    expect(out).toContain("long");
    expect(out).toContain("(min_length)");
  });

  it("singularizes a single constraint check", () => {
    const out = text({ type: "constraint", constraints: [{ check: "regex", name: "a" }] });
    expect(out).toContain("1 check;");
  });

  it("describes set_match with vocabulary size and case sensitivity", () => {
    const out = text({
      type: "set_match",
      vocabulary: ["Alice", "Bob", "Carol", "Dave"],
      expected: ["Alice", "Bob"],
      caseSensitive: false,
    });
    expect(out).toContain("Set match");
    expect(out).toContain("Alice, Bob");
    expect(out).toContain("vocabulary of 4");
    expect(out).toContain("Case-insensitive");
  });

  it("describes ordered_match as a sequence with LCS credit", () => {
    const out = text({
      type: "ordered_match",
      vocabulary: ["A", "B", "C"],
      expected: ["A", "B"],
      caseSensitive: true,
    });
    expect(out).toContain("Ordered match");
    expect(out).toContain("sequence");
    expect(out).toContain("longest-common-subsequence");
    expect(out).toContain("Case-sensitive");
  });

  it("describes code_exec, game, and custom", () => {
    expect(text({ type: "code_exec", testCode: "assert x" })).toContain("Code execution");
    expect(text({ type: "game", gameScorer: "bootstrap_grind" })).toContain("bootstrap_grind");
    expect(text({ type: "custom", script: "scorers/x.py" })).toContain("scorers/x.py");
  });

  it("marks passed constraints ✓ and failed/errored constraints ✗ when a breakdown is given", () => {
    const scorer = {
      type: "constraint",
      constraints: [
        { check: "regex", name: "alpha", pattern: "x" },
        { check: "contains", name: "beta", value: "y" },
        { check: "regex", name: "gamma", pattern: "[" },
      ],
    };
    const html = raw(scorer, { passed: ["alpha"], failed: ["beta"], errored: ["gamma"] });
    expect(html).toContain("✓");
    expect(html).toContain("✗");
    expect(html).toContain('aria-label="passed"');
    expect(html).toContain('aria-label="failed"');
    // Errored carries its own title but still renders as the ✗ failure mark.
    expect(html).toContain('title="errored"');
    // Two ✗ marks: one failed + one errored.
    expect(html.match(/✗/g)?.length).toBe(2);
    expect(html.match(/✓/g)?.length).toBe(1);
  });

  it("renders no marks for a constraint scorer with no breakdown (unchanged look)", () => {
    const scorer = { type: "constraint", constraints: [{ check: "regex", name: "alpha" }] };
    const html = raw(scorer);
    expect(html).not.toContain("✓");
    expect(html).not.toContain("✗");
    // Prose is still rendered as before.
    expect(text(scorer)).toContain("alpha");
  });

  it("does not throw and renders no marks for malformed breakdowns", () => {
    const scorer = { type: "constraint", constraints: [{ check: "regex", name: "alpha" }] };
    for (const bad of [{}, "nope", 42, [], null, { passed: "alpha" }]) {
      const html = raw(scorer, bad);
      expect(html).not.toContain("✓");
      expect(html).not.toContain("✗");
    }
  });

  it("falls back to JSON for null and unknown shapes", () => {
    expect(text(null)).toContain("No scorer");
    const out = text({ type: "mystery", foo: 1 });
    expect(out).toContain("mystery");
    expect(out).toContain("foo");
  });
});
