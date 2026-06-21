// Author-time helpers for social relational-network challenges. WE design a
// specific scenario (a named cast + explicit relationships); these compute the
// ground-truth answer so we can author `expected` with confidence, warn when the
// answer is ambiguous (a tie — usually a sign the scenario needs sharpening),
// and render the scenario as natural prose for the prompt.

export type EdgeKind = "kin" | "debt" | "loyalty" | "betrayal";

export interface Edge {
  from: string;
  to: string;
  kind: EdgeKind;
  /** 1 (slight) .. 5 (deep). Sign is implied by kind (betrayal is negative). */
  strength: number;
}

export interface Graph {
  agents: string[];
  edges: Edge[];
}

const SIGN: Record<EdgeKind, 1 | -1> = { kin: 1, debt: 1, loyalty: 1, betrayal: -1 };
const EPS = 1e-9;

/** Convenience edge constructor. */
export function edge(from: string, to: string, kind: EdgeKind, strength: number): Edge {
  return { from, to, kind, strength };
}

const round = (x: number): number => Math.round(x * 1e6) / 1e6;
const weight = (e: Edge): number => SIGN[e.kind] * (e.strength / 5);

// --- prose ---
const adv = (s: number): string => (s >= 4 ? "deeply" : s >= 3 ? "notably" : "slightly");

function clause(kind: EdgeKind, a: string): string {
  switch (kind) {
    case "kin":
      return `is ${a} akin to`;
    case "loyalty":
      return `is ${a} loyal to`;
    case "debt":
      return `${a} owes a debt to`;
    case "betrayal":
      return `${a} betrayed`;
  }
}

/** Render the relationships as bullet prose to drop into a prompt. */
export function describe(graph: Graph): string {
  return graph.edges.map((e) => `- ${e.from} ${clause(e.kind, adv(e.strength))} ${e.to}.`).join("\n");
}

// --- ground truth ---

/**
 * Sum over all simple directed paths source→target of length ≤ maxDepth of the
 * product of signed edge weights. `kinds` optionally restricts traversable edges.
 */
function affinity(
  graph: Graph,
  source: string,
  target: string,
  maxDepth: number,
  kinds?: Set<EdgeKind>,
): number {
  const adj = new Map<string, { to: string; w: number }[]>();
  for (const a of graph.agents) adj.set(a, []);
  for (const e of graph.edges) {
    if (kinds && !kinds.has(e.kind)) continue;
    adj.get(e.from)?.push({ to: e.to, w: weight(e) });
  }
  const visited = new Set<string>([source]);
  let total = 0;
  const walk = (node: string, depth: number, product: number): void => {
    if (node === target && depth > 0) {
      total += product;
      return; // endpoint reached; do not route through the target
    }
    if (depth >= maxDepth) return;
    for (const { to, w } of adj.get(node) ?? []) {
      if (visited.has(to)) continue;
      visited.add(to);
      walk(to, depth + 1, product * w);
      visited.delete(to);
    }
  };
  walk(source, 0, 1);
  return total;
}

export interface AllegianceResult {
  answer: string;
  scores: Record<string, number>;
  margin: number;
  tie: boolean;
}

/** Which of {a, b} does z side with (higher signed path-affinity)? */
export function allegiance(graph: Graph, z: string, a: string, b: string, depth = 3): AllegianceResult {
  const fa = affinity(graph, z, a, depth);
  const fb = affinity(graph, z, b, depth);
  return {
    answer: fa >= fb ? a : b,
    scores: { [a]: round(fa), [b]: round(fb) },
    margin: round(Math.abs(fa - fb)),
    tie: Math.abs(fa - fb) <= EPS,
  };
}
