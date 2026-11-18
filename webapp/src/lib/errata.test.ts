import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown, promptFixLabel } from "./errata";
import type { Erratum } from "./rows";

describe("parseMarkdown", () => {
  it("splits headings, paragraphs and lists on blank lines", () => {
    const md = "# Title\n\nFirst line\nsecond line.\n\n## Sub\n\n- one\n- two\n";
    expect(parseMarkdown(md)).toEqual([
      { type: "h", level: 1, text: "Title" },
      { type: "p", text: "First line second line." },
      { type: "h", level: 2, text: "Sub" },
      { type: "ul", items: ["one", "two"] },
    ]);
  });
});

describe("parseInline", () => {
  it("reads bold, code and links between text", () => {
    expect(parseInline("**Pre.** see `E-0001` and [here](https://x.y/a?b=c).")).toEqual([
      { type: "strong", text: "Pre." },
      { type: "text", text: " see " },
      { type: "code", text: "E-0001" },
      { type: "text", text: " and " },
      { type: "link", text: "here", href: "https://x.y/a?b=c" },
      { type: "text", text: "." },
    ]);
  });
});

describe("promptFixLabel", () => {
  const e = (promptFix: Erratum["promptFix"], release?: string): Erratum => ({
    id: "E-1",
    date: "2026-01-01",
    kind: "retired",
    items: [],
    description: "",
    scorerChange: false,
    promptFix,
    ...(release === undefined ? {} : { release }),
  });
  it("names the pending and shipped states", () => {
    expect(promptFixLabel(e("none"))).toBe("No prompt fix");
    expect(promptFixLabel(e("pending-next-release"))).toBe("Prompt fix pending next release");
    expect(promptFixLabel(e("fixed-in-release", "2027.1"))).toBe("Prompt fix shipped in 2027.1");
  });
});
