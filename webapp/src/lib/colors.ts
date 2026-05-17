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

export const FAMILY_COLORS: Record<string, string> = {
  Llama: "#e06666",
  Qwen: "#6fa8dc",
  Mistral: "#93c47d",
  Gemma: "#b996de",
  DeepSeek: "#f6b26b",
  Phi: "#76d7c4",
  GPT: "#ffd966",
  GLM: "#c27ba0",
  Other: "#9aa0a6",
};

export const familyColor = (family: string | null): string => {
  if (family === null) return FAMILY_COLORS.Other;
  return FAMILY_COLORS[family] ?? FAMILY_COLORS.Other;
};
