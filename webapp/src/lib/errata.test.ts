import { describe, expect, it } from "vitest";
import { errataOnRelease, parseInline, parseMarkdown, releaseName, releaseStatusLabel } from "./errata";
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
    expect(parseInline("**Pre.** see `0.1` and [here](https://x.y/a?b=c).")).toEqual([
      { type: "strong", text: "Pre." },
      { type: "text", text: " see " },
      { type: "code", text: "0.1" },
      { type: "text", text: " and " },
      { type: "link", text: "here", href: "https://x.y/a?b=c" },
      { type: "text", text: "." },
    ]);
  });
});

const e = (kind: Erratum["kind"], releaseStatus: Erratum["releaseStatus"], releasedIn?: string, id = "0.1"): Erratum => ({
  id,
  date: "2026-01-01",
  kind,
  items: [],
  description: "",
  scorerChange: false,
  releaseStatus,
  ...(releasedIn === undefined ? {} : { releasedIn }),
});

describe("releaseStatusLabel", () => {
  it("uses prompt wording only for prompt-ambiguity errata", () => {
    expect(releaseStatusLabel(e("prompt-ambiguity", "next-release"))).toBe("Prompt fix pending next release");
    expect(releaseStatusLabel(e("prompt-ambiguity", "released", "2027.1"))).toBe("Prompt fixed in release 2027.1");
    expect(releaseStatusLabel(e("retired", "next-release"))).toBe("In effect now · joins the baseline at the next release");
    expect(releaseStatusLabel(e("added", "released", "2027.1"))).toBe("In the baseline since release 2027.1");
    expect(releaseStatusLabel(e("scorer", "none"))).toBe("In effect now");
  });
});

describe("releases", () => {
  it("names the pre-release and counts errata on one release", () => {
    expect(releaseName("0")).toBe("pre-release");
    expect(releaseName("2027.1")).toBe("release 2027.1");
    const all = ["0.1", "0.2", "2027.1.1"].map((id) => e("scorer", "none", undefined, id));
    expect(errataOnRelease(all, "0").map((x) => x.id)).toEqual(["0.1", "0.2"]);
    expect(errataOnRelease(all, "2027.1").map((x) => x.id)).toEqual(["2027.1.1"]);
  });
});
