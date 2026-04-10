export function scoreColor(pct: number): string {
  if (pct >= 90) return "#22c55e";
  if (pct >= 70) return "#86efac";
  if (pct >= 50) return "#facc15";
  if (pct >= 30) return "#fb923c";
  return "#ef4444";
}

export function textColor(pct: number): string {
  if (pct >= 90) return "#fff";
  if (pct >= 70) return "#111827";
  if (pct >= 50) return "#111827";
  if (pct >= 30) return "#111827";
  return "#fff";
}

export const RUNTIME_COLORS: Record<string, string> = {
  llamacpp: "#3b82f6",
  mlx: "#22c55e",
};
