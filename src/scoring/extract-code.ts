/**
 * Port of `runner.py:extract_code` — pulls a Python snippet out of a model
 * response. Strategy (matching the prototype order):
 *
 *   1. Markdown fence: `r"```(?:python|py)?\s*\n(.*?)```"` with DOTALL.
 *   2. If the output contains a `def`/`import`/`from` line anywhere, collect
 *      every subsequent line until a line that looks like prose
 *      (`^[A-Z][a-z].*[.:]$`), or end of input.
 *   3. Otherwise: use the whole trimmed output.
 *
 * This is intentionally a no-effect pure function; the subprocess invocation
 * layer wraps execution separately.
 */

const FENCE_RE = /```(?:python|py)?\s*\n([\s\S]*?)```/;
const PROSE_STOP_RE = /^[A-Z][a-z].*[.:]$/;

export const extractCode = (output: string): string => {
  const fenceMatch = FENCE_RE.exec(output);
  if (fenceMatch && fenceMatch[1] !== undefined) {
    return fenceMatch[1].trim();
  }

  const trimmed = output.trim();
  const lines = trimmed.split(/\r?\n/);
  const codeLines: string[] = [];
  let inCode = false;

  for (const line of lines) {
    if (line.startsWith("def ") || line.startsWith("import ") || line.startsWith("from ")) {
      inCode = true;
    }
    if (inCode) {
      // Stop at obvious non-code (explanation text after the function).
      const firstChar = line.charAt(0);
      const isIndented = firstChar === " " || firstChar === "\t";
      const looksLikeCodeKeyword =
        line.startsWith("def ") ||
        line.startsWith("import ") ||
        line.startsWith("from ") ||
        line.startsWith("#") ||
        line.startsWith("@");
      if (line.length > 0 && !isIndented && !looksLikeCodeKeyword) {
        if (PROSE_STOP_RE.test(line)) {
          break;
        }
      }
      codeLines.push(line);
    }
  }

  if (codeLines.length > 0) {
    return codeLines.join("\n").trim();
  }

  return trimmed;
};
