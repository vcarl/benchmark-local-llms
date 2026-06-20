const FAMILY_COLORS: Record<string, string> = {
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
