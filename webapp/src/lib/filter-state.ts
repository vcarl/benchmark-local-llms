import type { Filters, GroupBy } from "./pipeline";

// Router search state for the home route. Filter chips serialize as comma-
// separated lists; numeric range sliders serialize as a min/max pair.
export type SearchState = {
  tags?: string;
  runtime?: string;
  family?: string;
  paramMin?: string;        // numeric param-count slider (in B)
  paramMax?: string;
  quant?: string;
  category?: string;
  tempMin?: string;
  tempMax?: string;
  durationMin?: string;     // wall-time slider (seconds)
  durationMax?: string;
  isScenario?: string;
  groupBy?: GroupBy;
  preset?: string;
  model?: string;
  sortPrimary?: string;
  sortSecondary?: string;
};

export const csv = (s: string | undefined): string[] =>
  s === undefined || s === "" ? [] : s.split(",");

const numOrUndef = (s: string | undefined): number | undefined => {
  if (s === undefined || s === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

const rangeFrom = (
  minStr: string | undefined,
  maxStr: string | undefined,
  defaultMin: number,
): { min: number; max: number } | undefined => {
  const min = numOrUndef(minStr);
  const max = numOrUndef(maxStr);
  if (min === undefined && max === undefined) return undefined;
  return { min: min ?? defaultMin, max: max ?? Infinity };
};

export const parseFilters = (search: SearchState): Filters => ({
  tags: csv(search.tags),
  category: csv(search.category),
  runtime: csv(search.runtime),
  family: csv(search.family),
  paramRange: rangeFrom(search.paramMin, search.paramMax, 0),
  quant: csv(search.quant),
  tempRange: rangeFrom(search.tempMin, search.tempMax, -Infinity),
  durationRange: rangeFrom(search.durationMin, search.durationMax, 0),
  isScenario: search.isScenario === "true" ? true : search.isScenario === "false" ? false : undefined,
});
