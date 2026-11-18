// The /errata page: a markdown subset for docs/ERRATA-PROCESS.md (headings,
// paragraphs, `- ` lists; **bold**, `code`, [links](url) inline) and the
// labels for the errata.yaml entries the report emits.
import type { Erratum } from "./rows";

export type Block =
  | { type: "h"; level: number; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] };

export type Inline =
  | { type: "text"; text: string }
  | { type: "strong"; text: string }
  | { type: "code"; text: string }
  | { type: "link"; text: string; href: string };

/** Blocks separated by blank lines; a block of `- ` lines is a list, lines of a paragraph join with a space. */
export const parseMarkdown = (src: string): Block[] =>
  src
    .trim()
    .split(/\n\s*\n/)
    .map((chunk): Block => {
      const lines = chunk.split("\n").map((l) => l.trim());
      const h = /^(#{1,6})\s+(.*)$/.exec(lines[0] ?? "");
      if (h !== null && lines.length === 1) return { type: "h", level: h[1]?.length ?? 1, text: h[2] ?? "" };
      if (lines.every((l) => l.startsWith("- "))) return { type: "ul", items: lines.map((l) => l.slice(2)) };
      return { type: "p", text: lines.join(" ") };
    });

export const parseInline = (text: string): Inline[] =>
  text
    .split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/)
    .filter((s) => s !== "")
    .map((s): Inline => {
      if (s.startsWith("**") && s.endsWith("**") && s.length > 4) return { type: "strong", text: s.slice(2, -2) };
      if (s.startsWith("`") && s.endsWith("`") && s.length > 2) return { type: "code", text: s.slice(1, -1) };
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(s);
      if (link !== null) return { type: "link", text: link[1] ?? "", href: link[2] ?? "" };
      return { type: "text", text: s };
    });

export const KIND_LABEL: Record<Erratum["kind"], string> = {
  "answer-key": "Answer key",
  scorer: "Scorer",
  "prompt-ambiguity": "Prompt ambiguity",
  retired: "Retired",
  added: "Added",
};

/** Errata numbered on `release` (`<release>.<n>`): the n in eval version `<release>.<n>`. */
export const errataOnRelease = (errata: Erratum[], release: string): Erratum[] =>
  errata.filter((e) => e.id.startsWith(`${release}.`));

/** How a release reads in prose: `0` is the pre-release baseline. */
export const releaseName = (release: string): string => (release === "0" ? "pre-release" : `release ${release}`);

/** Whether the change is in effect, or waits on a release. Prompt wording only for prompt fixes. */
export const releaseStatusLabel = (e: Erratum): string => {
  const prompt = e.kind === "prompt-ambiguity";
  switch (e.releaseStatus) {
    case "none":
      return prompt ? "No prompt fix planned" : "In effect now";
    case "next-release":
      return prompt ? "Prompt fix pending next release" : "In effect now · joins the baseline at the next release";
    case "released":
      return prompt
        ? `Prompt fixed in ${releaseName(e.releasedIn ?? "a release")}`
        : `In the baseline since ${releaseName(e.releasedIn ?? "a release")}`;
  }
};
