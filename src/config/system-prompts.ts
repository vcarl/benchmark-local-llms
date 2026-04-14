import { FileSystem } from "@effect/platform";
import { Context, Effect, Schema } from "effect";
import { SchemaDecodeError, type YamlParseError } from "../errors/config.js";
import { parseYaml } from "./yaml.js";

/**
 * Resolved `prompts/system-prompts.yaml`: a flat mapping from system-prompt
 * key (e.g. `"cot"`, `"code_direct"`) to the literal system prompt text.
 *
 * This is the decoded shape returned by {@link loadSystemPrompts} *and* the
 * payload carried by the {@link SystemPromptRegistry} service — downstream
 * loaders (prompt corpus) resolve `system:` keys against it.
 */
const SystemPromptsSchema = Schema.Record({ key: Schema.String, value: Schema.String });
export type SystemPromptMap = typeof SystemPromptsSchema.Type;

/**
 * Service tag for the resolved system-prompt registry. Provided as a Layer
 * by {@link systemPromptRegistryLayer} so that `loadPromptCorpus` can
 * require the registry in its `R` channel, making the load-order dependency
 * explicit in the type signature.
 */
export class SystemPromptRegistry extends Context.Tag("config/SystemPromptRegistry")<
  SystemPromptRegistry,
  SystemPromptMap
>() {}

/**
 * Load the system-prompt YAML and decode it into a `Record<string, string>`.
 *
 * Failure modes:
 * - Filesystem read → `PlatformError` (from `FileSystem.readFileString`).
 * - YAML parse failure → {@link YamlParseError}.
 * - Decoded value is not a string map → {@link SchemaDecodeError}.
 */
export const loadSystemPrompts = (
  path: string,
): Effect.Effect<
  SystemPromptMap,
  YamlParseError | SchemaDecodeError | import("@effect/platform/Error").PlatformError,
  FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const source = yield* fs.readFileString(path);
    const parsed = yield* parseYaml(path, source);
    const decoded = yield* Schema.decodeUnknown(SystemPromptsSchema)(parsed).pipe(
      Effect.mapError((cause) => new SchemaDecodeError({ typeName: "SystemPrompts", cause })),
    );
    return decoded;
  });
