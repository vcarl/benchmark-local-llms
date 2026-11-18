import { FileSystem } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { Effect, Schema } from "effect";
import { ConfigError, SchemaDecodeError, type YamlParseError } from "../errors/config.js";
import { resolveChatTemplate } from "../llm/servers/resolve-chat-template.js";
import { Configuration } from "../schema/configuration.js";
import { shortSha256 } from "./hashing.js";
import { SystemPromptRegistry } from "./system-prompts.js";
import { parseYaml } from "./yaml.js";

export interface ResolvedConfiguration extends Configuration {
  readonly systemPromptText: string;
  readonly configHash: string;
  /** shortSha256 of the `chatTemplate` file's content; set iff `chatTemplate` is. */
  readonly chatTemplateSha?: string;
}

const ConfigArray = Schema.Array(Configuration);

/** Identity hash for a configuration: knobs the user sets, not code version. */
export const computeConfigHash = (
  c: {
    artifact: string;
    runtime: string;
    quant?: string | undefined;
    temperature: number;
    maxTokens: number;
    repetitionPenalty?: number | undefined;
    repetitionContextSize?: number | undefined;
    topP?: number | undefined;
    topK?: number | undefined;
    minP?: number | undefined;
    presencePenalty?: number | undefined;
    chatTemplateKwargs?: Readonly<Record<string, string | number | boolean>> | undefined;
    /** shortSha256 of the chat-template file's content (not its name). */
    chatTemplateSha?: string | undefined;
  },
  systemPromptText: string,
): string =>
  shortSha256(
    [
      c.artifact,
      c.runtime,
      c.quant ?? "",
      String(c.temperature),
      String(c.maxTokens),
      systemPromptText,
      // Appended, and only when set, so every configuration that does not use
      // the sampler knobs keeps the hash it already has — existing archives
      // stay attached to their configuration.
      ...(c.repetitionPenalty === undefined ? [] : [`rp=${c.repetitionPenalty}`]),
      ...(c.repetitionContextSize === undefined ? [] : [`rcs=${c.repetitionContextSize}`]),
      ...(c.topP === undefined ? [] : [`tp=${c.topP}`]),
      ...(c.topK === undefined ? [] : [`tk=${c.topK}`]),
      ...(c.minP === undefined ? [] : [`mp=${c.minP}`]),
      ...(c.presencePenalty === undefined ? [] : [`pp=${c.presencePenalty}`]),
      // Keys sorted so YAML key order does not change identity.
      ...(c.chatTemplateKwargs === undefined
        ? []
        : [
            `ctk=${JSON.stringify(Object.entries(c.chatTemplateKwargs).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))}`,
          ]),
      // The template renders the prompt the model sees, so editing its file
      // is a new identity: the cache must not replay outputs from the old one.
      ...(c.chatTemplateSha === undefined ? [] : [`ct=${c.chatTemplateSha}`]),
    ].join("|"),
  );

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
        const chatTemplateSha =
          c.chatTemplate === undefined
            ? undefined
            : shortSha256(
                yield* resolveChatTemplate(c.chatTemplate).pipe(
                  Effect.flatMap((p) => fs.readFileString(p)),
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
          configHash: computeConfigHash({ ...c, chatTemplateSha }, systemPromptText),
          ...(chatTemplateSha === undefined ? {} : { chatTemplateSha }),
        };
      }),
    );
  });
