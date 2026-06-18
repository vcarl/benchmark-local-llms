import { Schema } from "effect";
import { Runtime } from "./enums.js";

/**
 * A named, hashable LLM configuration: the knobs a user sets when submitting
 * a model to a challenge. The system prompt is part of the configuration
 * (resolved from `system-prompts.yaml` by key), not the prompt.
 */
export const Configuration = Schema.Struct({
  id: Schema.String,
  artifact: Schema.String,
  runtime: Runtime,
  quant: Schema.optional(Schema.String),
  temperature: Schema.Number,
  systemPrompt: Schema.String,
  maxTokens: Schema.Number,
  ctxSize: Schema.optional(Schema.Number),
  active: Schema.optional(Schema.Boolean),
});
export type Configuration = typeof Configuration.Type;
