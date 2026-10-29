// Router search state for the root route. Categorical filter chips serialize
// as comma-separated lists; drilldown expansion as single ids.
export type SearchState = {
  family?: string;
  runtime?: string;
  quant?: string;
  temperature?: string;
  top?: string;             // scatter model cap: a count or "all"; absent = DEFAULT_TOP
  challenge?: string;       // base challenge_id keys (version-agnostic)
  config?: string;          // expanded leaderboard row (config_hash)
  attempt?: string;         // expanded challenge line (attempt_id)
  sortPrimary?: string;
  sortSecondary?: string;
  sortPrimaryDir?: string;
  sortSecondaryDir?: string;
};

export const csv = (s: string | undefined): string[] =>
  s === undefined || s === "" ? [] : s.split(",");

export interface Filters {
  family?: string[];
  runtime?: string[];
  quant?: string[];
  temperature?: string[];
  challenge?: string[];
}

export const parseFilters = (search: SearchState): Filters => ({
  family: csv(search.family),
  runtime: csv(search.runtime),
  quant: csv(search.quant),
  temperature: csv(search.temperature),
  challenge: csv(search.challenge),
});

export const DEFAULT_TOP = 30;
export const TOP_OPTIONS = ["10", "30", "50", "All"];

// `top` search param → model cap. Absent/invalid → DEFAULT_TOP; "all" → no cap.
export const parseTop = (s: string | undefined): number => {
  if (s === "all") return Infinity;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_TOP;
};
