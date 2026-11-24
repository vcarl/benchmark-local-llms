import { describe, expect, it } from "vitest";
import {
  changedCells,
  changedCellTitle,
  errataOnRelease,
  parseInline,
  parseMarkdown,
  releaseName,
  releaseStatusLabel,
  scoresChangedLabel,
} from "./errata";
import type { Cell, Erratum, Row, RowsDataset } from "./rows";

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
  scoresChanged: { lines: 0, configs: 0 },
  releaseStatus,
  ...(releasedIn === undefined ? {} : { releasedIn }),
});

describe("releaseStatusLabel", () => {
  it("uses prompt wording only for prompt-ambiguity errata", () => {
    expect(releaseStatusLabel(e("prompt-ambiguity", "next-release"))).toBe("Prompt fix pending next release");
    expect(releaseStatusLabel(e("prompt-ambiguity", "released", "2027.1"))).toBe("Prompt fixed in release 2027.1");
    expect(releaseStatusLabel(e("retired", "next-release"))).toBe("In effect now · ships in the next release");
    expect(releaseStatusLabel(e("added", "released", "2027.1"))).toBe("Shipped in release 2027.1");
    expect(releaseStatusLabel(e("scorer", "none"))).toBe("In effect now");
  });
});

describe("releases", () => {
  it("names the alpha set and counts errata on one release", () => {
    expect(releaseName("0")).toBe("alpha challenge set");
    expect(releaseName("2027.1")).toBe("release 2027.1");
    expect(releaseName("draft")).toBe("pre-release");
    const all = ["0.1", "0.2", "2027.1.1"].map((id) => e("scorer", "none", undefined, id));
    expect(errataOnRelease(all, "0").map((x) => x.id)).toEqual(["0.1", "0.2"]);
    expect(errataOnRelease(all, "2027.1").map((x) => x.id)).toEqual(["2027.1.1"]);
  });
});

describe("scoresChangedLabel", () => {
  it("counts changed scores, or the results a retirement dropped", () => {
    const with_ = (kind: Erratum["kind"], lines: number, configs: number): Erratum => ({
      ...e(kind, "none"),
      scoresChanged: { lines, configs },
    });
    expect(scoresChangedLabel(with_("scorer", 121, 13))).toBe("Changed 121 scores across 13 configs");
    expect(scoresChangedLabel(with_("answer-key", 1, 1))).toBe("Changed 1 score across 1 config");
    expect(scoresChangedLabel(with_("scorer", 0, 0))).toBe("Changed no recorded scores");
    expect(scoresChangedLabel(with_("retired", 214, 107))).toBe("Dropped 214 recorded results across 107 configs");
    expect(scoresChangedLabel(with_("retired", 0, 0))).toBe("Dropped no recorded results");
  });
});

describe("changedCells", () => {
  const c = (passed: number) => ({ items: 10, passed, nearMissCredit: 0 }) as Cell;
  const row = (cells: Record<string, Cell>) => ({ rowId: "r", cells }) as unknown as Row;
  const er = (id: string, items: string[], lines: number, scorerChange = true): Erratum => ({
    ...e("scorer", "none", undefined, id),
    items,
    scorerChange,
    scoresChanged: { lines, configs: 1 },
  });
  const ds = (rows: Row[], errata: Erratum[]) => ({ dataset: { release: "0", errata }, rows }) as unknown as RowsDataset;
  const errata = [er("0.1", ["math/a"], 3), er("0.2", ["logic/b"], 0), er("0.3", ["math/c"], 1), er("0.4", ["code/x"], 5, false)];
  const r = row({ math: c(5), logic: c(5), code: c(5) });

  it("marks challenges a scoring erratum changed recorded scores of", () => {
    expect(changedCells(r, ds([r], errata))).toEqual(new Map([["math", ["0.1", "0.3"]]]));
    expect(changedCellTitle(["0.1", "0.3"], "0")).toBe("Erratum 0.1, 0.3 changed scoring of this challenge's items since 0.0");
  });
});
