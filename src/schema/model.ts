import { Schema } from "effect";
import { Runtime } from "./enums.js";

/**
 * The runtime model shape produced by `modelFromConfig`
 * (`src/orchestration/run-challenge.ts`) and consumed by the LLM-server
 * factory, `run-prompt`, `run-scenario`, `run-session`, and `run-id`.
 *
 * `ctxSize` flows to the llamacpp server's `-c` flag; the mlx server takes no
 * context flag, so `ctxSize` is a benign no-op there. There is no per-phase
 * server restart — a single server serves both the prompt and scenario phases.
 *
 * `name` defaults to the configuration id at construction; `quant`,
 * `temperature`, and `chatTemplate` carry through from the configuration.
 */
export const ModelConfig = Schema.Struct({
  artifact: Schema.String,
  runtime: Runtime,
  name: Schema.optional(Schema.String),
  quant: Schema.optional(Schema.String),
  ctxSize: Schema.optional(Schema.Number),
  temperature: Schema.optional(Schema.Number),
  /**
   * Optional vendored chat-template name (see {@link Configuration.chatTemplate}).
   * Resolved to `templates/<chatTemplate>.jinja` and passed to llama-server
   * as `--jinja --chat-template-file`.
   */
  chatTemplate: Schema.optional(Schema.String),
  /**
   * Extra CLI args appended verbatim after the mlx server's built-in flags
   * (see {@link Configuration.extraArgs}). Carried into the mlx `MlxConfig`;
   * the llamacpp path ignores it.
   */
  extraArgs: Schema.optional(Schema.Array(Schema.String)),
});
export type ModelConfig = typeof ModelConfig.Type;
