// Web of trust / transitive trust (scenario 4). A directed weighted graph of
// actors; edge weight w(u→v) ∈ [0,1] is direct trust. Trust along a PATH is the
// PRODUCT of its edge weights; trust from a source s to a target t aggregated
// across competing paths is the MAX over paths of the path product ("use the
// strongest chain" — order-independent, avoids double-counting, stays in [0,1];
// do NOT sum). v1 keeps all weights in [0,1] (no distrust/negative edges) and a
// DAG (no cycles), which keeps simple-path enumeration finite.

const EPS = 1e-9;
const round = (x: number): number => Math.round(x * 1e6) / 1e6;

export interface Edge {
  from: string;
  to: string;
  /** Direct trust in [0,1]. */
  w: number;
}

/** All simple directed paths s→t, each with its (unrounded) product of weights. */
function enumeratePaths(
  edges: Edge[],
  s: string,
  t: string,
): { path: string[]; product: number }[] {
  const out: { path: string[]; product: number }[] = [];
  const walk = (node: string, visited: Set<string>, path: string[], product: number): void => {
    if (node === t) {
      out.push({ path: [...path], product });
      return;
    }
    for (const e of edges) {
      if (e.from !== node || visited.has(e.to)) continue;
      visited.add(e.to);
      walk(e.to, visited, [...path, e.to], product * e.w);
      visited.delete(e.to);
    }
  };
  walk(s, new Set([s]), [s], 1);
  return out;
}

/**
 * Strongest-chain (max-product, widest-path) trust from s to t. Returns the
 * rounded best value, the maximizing node sequence, and `tie` = true when two
 * DISTINCT paths achieve the max product (the value stays unique either way; only
 * the path identity is then ambiguous — author edge weights so tie === false).
 */
export function bestPathTrust(
  edges: Edge[],
  s: string,
  t: string,
): { value: number; path: string[]; tie: boolean } {
  const paths = enumeratePaths(edges, s, t);
  if (paths.length === 0) return { value: 0, path: [], tie: false };
  let best = paths[0] as { path: string[]; product: number };
  for (const p of paths) {
    if (p.product > best.product + EPS) best = p;
  }
  const tie = paths.filter((p) => Math.abs(p.product - best.product) <= EPS).length > 1;
  return { value: round(best.product), path: best.path, tie };
}

/** Count distinct simple directed paths s→t whose product is strictly above τ. */
export function pathsAbove(edges: Edge[], s: string, t: string, tau: number): number {
  return enumeratePaths(edges, s, t).filter((p) => round(p.product) > tau + EPS).length;
}

/** Is t reachable from s with strongest-chain trust strictly above τ? */
export function reachableAbove(edges: Edge[], s: string, t: string, tau: number): boolean {
  return bestPathTrust(edges, s, t).value > tau + EPS;
}
