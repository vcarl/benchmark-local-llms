import { FileSystem } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { Effect, Schema } from "effect";
import { ConfigError, SchemaDecodeError, type YamlParseError } from "../errors/config.js";
import { resolveChatTemplate } from "../llm/servers/resolve-chat-template.js";
import { Configuration } from "../schema/configuration.js";
import { sha256Hex } from "../store/digest.js";
import { SystemPromptRegistry } from "./system-prompts.js";
import { parseYaml } from "./yaml.js";

export interface ResolvedConfiguration extends Configuration {
  readonly systemPromptText: string;
  /** SHA-256 of the `chatTemplate` file's bytes; set iff `chatTemplate` is. */
  readonly chatTemplateDigest?: string;
}

const ConfigArray = Schema.Array(Configuration);

export const loadConfigurations = (
  path: string,
): Effect.Effect<
  ReadonlyArray<ResolvedConfiguration>,
  YamlParseError | SchemaDecodeError | ConfigError | PlatformError,
  FileSystem.FileSystem | SystemPromptRegistry
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const registry = yield* SystemPromptRegistry;
    const source = yield* fs.readFileString(path);
    const parsed = yield* parseYaml(path, source);
    const decoded = yield* Schema.decodeUnknown(ConfigArray)(parsed).pipe(
      Effect.mapError((cause) => new SchemaDecodeError({ typeName: "Configuration[]", cause })),
    );
    return yield* Effect.forEach(decoded, (c) =>
      Effect.gen(function* () {
        const systemPromptText = registry[c.systemPrompt];
        if (systemPromptText === undefined) {
          return yield* Effect.fail(
            new ConfigError({
              path,
              message: `Configuration '${c.id}' references unknown system prompt '${c.systemPrompt}'.`,
            }),
          );
        }
        const chatTemplateDigest =
          c.chatTemplate === undefined
            ? undefined
            : sha256Hex(
                yield* resolveChatTemplate(c.chatTemplate).pipe(
                  Effect.flatMap((p) => fs.readFile(p)),
                  Effect.mapError(
                    (e) =>
                      new ConfigError({
                        path,
                        message: `Configuration '${c.id}': ${"reason" in e ? e.reason : String(e)}`,
                      }),
                  ),
                ),
              );
        return {
          ...c,
          systemPromptText,
          ...(chatTemplateDigest === undefined ? {} : { chatTemplateDigest }),
        };
      }),
    );
  });
