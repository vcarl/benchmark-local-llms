import { Schema } from "effect";
import { ScorerConfig } from "./scorer.js";

/**
 * A named system prompt resolved from `prompts/system-prompts.yaml` at load
 * time. Both `key` and `text` are stored so the RunManifest is self-contained
 * and the webapp / report can show a friendly label without re-reading the
 * global YAML. See requirements §2.2.
 */
export const SystemPrompt = Schema.Struct({
  key: Schema.String,
  text: Schema.String,
});
export type SystemPrompt = typeof SystemPrompt.Type;

/**
 * A frozen prompt definition at execution time. The prompt `name` is the sole
 * identity — variants of the same base prompt (e.g. direct vs cot) get
 * distinct names (`math_multiply_direct`, `math_multiply_cot`).
 *
 * `promptHash` is SHA-256[:12] over `promptText + system.text`; it forms part
 * of the cross-run cache key `(artifact, promptName, promptHash, temperature)`
 * (§2.3).
 */
export const PromptCorpusEntry = Schema.Struct({
  name: Schema.String,
  category: Schema.String,
  tier: Schema.Number,
  system: SystemPrompt,
  promptText: Schema.String,
  scorer: ScorerConfig,
  promptHash: Schema.String,
});
export type PromptCorpusEntry = typeof PromptCorpusEntry.Type;
