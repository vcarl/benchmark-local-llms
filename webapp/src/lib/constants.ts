/**
 * A run passes only when its score is exactly 1 (a fully correct answer).
 * Any partial credit, runtime error, or wrong output counts as a fail.
 */
export const isPass = (score: number): boolean => score === 1;

export const scoreBand = (
  score: number,
): "green" | "yellow-green" | "yellow" | "orange" | "red" => {
  if (score >= 0.8) return "green";
  if (score >= 0.6) return "yellow-green";
  if (score >= 0.4) return "yellow";
  if (score >= 0.2) return "orange";
  return "red";
};

export const REPO_URL = "https://github.com/vcarl/benchmark-local-llms";
export const issueTemplateUrl = (template: string): string =>
  `${REPO_URL}/issues/new?template=${template}`;

export const EFFICIENCY_SCALE = 100;
export const formatEfficiency = (e: number | null): string => (e === null ? "—" : e.toFixed(2));
