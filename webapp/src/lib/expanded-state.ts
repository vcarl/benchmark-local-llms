// URL-encoded expansion state for the per-run details list.
//
// Param values:
//   undefined  → empty set (all collapsed)
//   ""         → empty set (all collapsed)
//   "full"     → all rows expanded
//   "a,b,c"    → those exact names expanded
//
// Encoding choices:
//   empty set                 → ""
//   set covers allNames       → "full"
//   otherwise                 → sorted comma list

export const parseExpanded = (
  param: string | undefined,
  allNames: string[],
): Set<string> => {
  if (param === undefined) return new Set();
  if (param === "") return new Set();
  if (param === "full") return new Set(allNames);
  const known = new Set(allNames);
  const out = new Set<string>();
  for (const piece of param.split(",")) {
    if (piece === "") continue;
    if (known.has(piece)) out.add(piece);
  }
  return out;
};

export const encodeExpanded = (
  set: Set<string>,
  allNames: string[],
): string => {
  if (set.size === 0) return "";
  // "full" only when every name in allNames is present and no extra entries.
  let coversAll = true;
  for (const name of allNames) {
    if (!set.has(name)) { coversAll = false; break; }
  }
  if (coversAll && set.size === allNames.length) return "full";
  // Stable: sort by allNames order so encodings round-trip predictably.
  const order = new Map(allNames.map((n, i) => [n, i] as const));
  const present = [...set].filter((n) => order.has(n));
  present.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  return present.join(",");
};
