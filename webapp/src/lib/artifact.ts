export function modelFamily(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("deepseek")) return "DeepSeek";
  if (lower.includes("qwen") || lower.includes("qwq")) return "Qwen";
  if (lower.includes("mistral") || lower.includes("devstral") || lower.includes("magistral")) return "Mistral";
  if (lower.includes("gemma")) return "Gemma";
  if (lower.includes("llama")) return "Llama";
  if (lower.includes("phi")) return "Phi";
  if (lower.includes("gpt")) return "GPT";
  if (lower.includes("glm")) return "GLM";
  return "Other";
}

/**
 * Split a model artifact (e.g. `mlx-community/Qwen3.6-35B-A3B-4bit`) on its
 * FIRST `/`: everything before becomes `prefix` (the org, e.g. `mlx-community`)
 * and everything after becomes `name` (the useful model part). When there is no
 * `/`, `prefix` is null and `name` is the whole string. Only the first `/` is a
 * boundary — any later slashes stay in `name`.
 */
export function splitArtifact(artifact: string): { prefix: string | null; name: string } {
  const idx = artifact.indexOf("/");
  if (idx === -1) return { prefix: null, name: artifact };
  return { prefix: artifact.slice(0, idx), name: artifact.slice(idx + 1) };
}

// Compact display name for tight spots (scatter labels): the artifact's last
// path segment with org prefixes (`nvidia_…`) and packaging/quant tokens
// (`GGUF`, `MLX`, `4bit`, `MXFP4`, `Q4_K_M`, `Instruct`, `it`) dropped.
// `mlx-community/Qwen3-Coder-30B-A3B-Instruct-4bit` → `Qwen3-Coder-30B-A3B`.
const NOISE_TOKEN = /^(gguf|mlx|\d+bit|mxfp\d+|q\d+(_k)?(_[sml])?|instruct|it)$/i;
export function shortModelName(artifact: string): string {
  const name = (artifact.split("/").pop() ?? artifact).replace(/^[a-z]+_/, "");
  const kept = name.split("-").filter((t) => !NOISE_TOKEN.test(t));
  return kept.length > 0 ? kept.join("-") : name;
}
