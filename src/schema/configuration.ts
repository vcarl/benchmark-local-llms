import { Schema } from "effect";
import { Runtime } from "./enums.js";

/**
 * A named, hashable LLM configuration: the knobs a user sets when submitting
 * a model to a challenge. The system prompt is part of the configuration
 * (resolved from `system-prompts.yaml` by key), not the prompt.
 */
const ConfigurationFields = Schema.Struct({
  id: Schema.String,
  artifact: Schema.String,
  runtime: Runtime,
  quant: Schema.optional(Schema.String),
  temperature: Schema.Number,
  systemPrompt: Schema.String,
  maxTokens: Schema.Number,
  ctxSize: Schema.optional(Schema.Number),
  active: Schema.optional(Schema.Boolean),
  /**
   * Optional vendored chat-template name. When set, resolves to
   * `templates/<chatTemplate>.jinja` and is passed to llama-server as
   * `--jinja --chat-template-file`. Needed for official `mistralai/*-GGUF`
   * artifacts that ship without an embedded template; configs that omit it
   * use the runtime's built-in / embedded template unchanged.
   */
  chatTemplate: Schema.optional(Schema.String),
  /**
   * Extra CLI args appended verbatim after the server's built-in flags. Only
   * consumed by the mlx runtime (threaded to `mlx_lm.server` via
   * {@link ModelConfig.extraArgs}); the llamacpp path ignores it. Used to pass
   * flags like `--trust-remote-code` for models that require custom code.
   */
  extraArgs: Schema.optional(Schema.Array(Schema.String)),
  /**
   * Sampler repetition penalty (>1 discourages verbatim repeats). Left unset,
   * nothing is sent and the configuration hashes exactly as it did before this
   * field existed. Set it and the value joins `configHash`, because it changes
   * what the model generates — results either side of it are not comparable.
   */
  repetitionPenalty: Schema.optional(Schema.Number),
  /** How many recent tokens {@link repetitionPenalty} considers. */
  repetitionContextSize: Schema.optional(Schema.Number),
});

/**
 * The `chatTemplate` field is consumed only by the llamacpp server factory
 * (rendered as `--chat-template-file`). On an `mlx` or `omlx` entry it would be
 * silently ignored, so reject it at decode time — fail-fast on decorative config rather
 * than letting a no-op flag pass. This surfaces through the same typed
 * `SchemaDecodeError` channel as every other config-decode failure
 * (see `src/config/configurations.ts`).
 */
export const Configuration = ConfigurationFields.pipe(
  Schema.filter((c) =>
    c.runtime !== "llamacpp" && c.chatTemplate !== undefined
      ? {
          path: ["chatTemplate"],
          message: `chatTemplate is not supported for runtime '${c.runtime}' (only llamacpp applies it); remove it or use extraArgs`,
        }
      : undefined,
  ),
);
export type Configuration = typeof Configuration.Type;
