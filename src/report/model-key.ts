/**
 * Model identity of an artifact, so the GGUF, MLX, omlx and llama.cpp builds
 * of one model group together. The heuristic strips the org and packaging
 * tokens; a `configs.yaml` entry's `modelKey` overrides it for that artifact.
 */

/** Packaging tokens: format, bit width, quant scheme. */
const PACKAGING = /^(gguf|mlx|\d+bit|mxfp\d+|q\d+(_k)?(_[a-z0-9]+)*|oq\d+e?)$/i;

/** Display name: last path segment, `org_` prefix and packaging tokens dropped, case kept. */
export const modelNameOf = (artifact: string): string => {
  const last = artifact.split("/").pop() ?? artifact;
  // `bartowski/nvidia_Llama-…`, `Qwen_Qwen3.5-…`: an uploader's org prefix.
  const name = last.replace(/^[A-Za-z]+_(?=[A-Za-z])/, "");
  const kept = name.split("-").filter((t) => !PACKAGING.test(t));
  return kept.length > 0 ? kept.join("-") : name;
};

/** Grouping key: the display name, lower-cased. */
export const modelKeyOf = (artifact: string, overrides: ReadonlyMap<string, string>): string =>
  overrides.get(artifact) ?? modelNameOf(artifact).toLowerCase();

/** `artifact → modelKey` for the `configs.yaml` entries (parsed YAML) that set `modelKey`. */
export const modelKeyOverrides = (configs: unknown): Map<string, string> =>
  new Map(
    (Array.isArray(configs) ? configs : []).flatMap(
      (c: { artifact?: unknown; modelKey?: unknown }) =>
        typeof c?.artifact === "string" && typeof c.modelKey === "string"
          ? [[c.artifact, c.modelKey] as const]
          : [],
    ),
  );
