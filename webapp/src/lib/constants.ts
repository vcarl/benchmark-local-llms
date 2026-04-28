export const CAPABILITY_TAGS = [
  "instruction-following",
  "long-term-planning",
  "tool-use",
  "spatial-reasoning",
  "resource-management",
  "code-synthesis",
  "code-debugging",
  "math-reasoning",
  "logical-deduction",
  "factual-recall",
] as const;

export type CapabilityTag = typeof CAPABILITY_TAGS[number];

export const PASS_THRESHOLD = 0.7;

export const scoreBand = (
  score: number,
): "green" | "yellow-green" | "yellow" | "orange" | "red" => {
  if (score >= 0.8) return "green";
  if (score >= 0.6) return "yellow-green";
  if (score >= 0.4) return "yellow";
  if (score >= 0.2) return "orange";
  return "red";
};
