import { Schema } from "effect";
import { Runtime } from "./enums.js";

/**
 * One entry in `models.yaml` (§2.6). Each entry represents a single model
 * artifact served by a single runtime. `name`, `quant`, and `params` can be
 * derived from the artifact string at load time; the optional fields here
 * let config override the derivation when it produces wrong values.
 *
 * `ctxSize` and `scenarioCtxSize` go to the backing server's `--ctx-size`
 * flag. If they differ, the server is restarted between prompt and scenario
 * phases (§5.3).
 *
 * `active` defaults to true; set false to skip a model without removing its
 * entry.
 */
export const ModelConfig = Schema.Struct({
  artifact: Schema.String,
  runtime: Runtime,
  name: Schema.optional(Schema.String),
  quant: Schema.optional(Schema.String),
  params: Schema.optional(Schema.String),
  ctxSize: Schema.optional(Schema.Number),
  scenarioCtxSize: Schema.optional(Schema.Number),
  active: Schema.optional(Schema.Boolean),
  temperature: Schema.optional(Schema.Number),
});
export type ModelConfig = typeof ModelConfig.Type;
