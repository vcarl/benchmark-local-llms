import { FileSystem } from "@effect/platform";
import { Effect, Schema } from "effect";
import { SchemaDecodeError, type YamlParseError } from "../errors/config.js";
import { ModelConfig } from "../schema/model.js";
import { parseYaml } from "./yaml.js";

const ModelConfigArray = Schema.Array(ModelConfig);

/**
 * Load `models.yaml` and decode it into a `ReadonlyArray<ModelConfig>`.
 *
 * The schema treats `name`, `quant`, `params`, `ctxSize`, `scenarioCtxSize`,
 * and `active` as optional overrides — when absent, downstream code derives
 * them from the `artifact` string. Explicit values always win over derived
 * ones so that prototype display names (e.g. "Qwen 2.5 72B Instruct") survive
 * migration even when artifact derivation would produce different output.
 *
 * Failure modes:
 * - Filesystem read → `PlatformError` (from `FileSystem.readFileString`).
 * - YAML parse failure → {@link YamlParseError}.
 * - Top-level is not an array, or any entry fails schema → {@link SchemaDecodeError}.
 */
export const loadModels = (
  path: string,
): Effect.Effect<
  ReadonlyArray<ModelConfig>,
  YamlParseError | SchemaDecodeError | import("@effect/platform/Error").PlatformError,
  FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const source = yield* fs.readFileString(path);
    const parsed = yield* parseYaml(path, source);
    const decoded = yield* Schema.decodeUnknown(ModelConfigArray)(parsed).pipe(
      Effect.mapError((cause) => new SchemaDecodeError({ typeName: "ModelConfig[]", cause })),
    );
    return decoded;
  });
