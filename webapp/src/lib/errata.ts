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

export const promptFixLabel = (e: Erratum): string => {
  switch (e.promptFix) {
    case "none":
      return "No prompt fix";
    case "pending-next-release":
      return "Prompt fix pending next release";
    case "fixed-in-release":
      return `Prompt fix shipped in ${e.release ?? "a release"}`;
  }
};
