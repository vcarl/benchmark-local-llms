import path from "node:path";
import { FileSystem } from "@effect/platform";
import { Effect, Schema } from "effect";
import { ConfigError, SchemaDecodeError, type YamlParseError } from "../errors/config.js";
import { CutoffConfig, PlayerDef, type ScenarioCorpusEntry } from "../schema/scenario.js";
import { computeScenarioHash } from "./hashing.js";
import { parseYaml } from "./yaml.js";

/**
 * Raw on-disk scenario YAML shape. Like `PromptInput` in `prompt-corpus.ts`
 * this mirrors the file layout (§2.2) rather than the canonical in-memory
 * schema — the difference here is `scenarioMd` which is a *filename* in the
 * YAML but the *full markdown content* in {@link ScenarioCorpusEntry}. The
 * loader reads the referenced file and embeds its contents.
 */
const ScenarioInput = Schema.Struct({
  name: Schema.String,
  fixture: Schema.String,
  players: Schema.Array(PlayerDef),
  scorer: Schema.String,
  scorerParams: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  cutoffs: CutoffConfig,
  tier: Schema.Number,
  /** Filename (relative to the scenarios dir), resolved at load time. */
  scenarioMd: Schema.String,
  tags: Schema.optional(Schema.Array(Schema.String)),
});
type ScenarioInput = typeof ScenarioInput.Type;

const loadScenarioFile = (
  filePath: string,
): Effect.Effect<
  ScenarioInput,
  YamlParseError | SchemaDecodeError | import("@effect/platform/Error").PlatformError,
  FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const source = yield* fs.readFileString(filePath);
    const parsed = yield* parseYaml(filePath, source);
    return yield* Schema.decodeUnknown(ScenarioInput)(parsed).pipe(
      Effect.mapError((cause) => new SchemaDecodeError({ typeName: "ScenarioInput", cause })),
    );
  });

/**
 * Load every `*.yaml` in the scenarios dir, decode each as a
 * {@link ScenarioCorpusEntry}, and resolve the companion `.md` directive
 * file into the `scenarioMd` field. Unlike prompts there is no system-prompt
 * registry to validate against (scenarios use their own `scorer:` registry
 * key resolved at scoring time, not load time).
 *
 * Failure modes: YAML parse, schema decode, duplicate scenario `name`, or
 * missing/unreadable `.md` file (surfaces as `ConfigError` with the resolved
 * path). Filesystem errors (e.g. missing scenarios dir) propagate as
 * `PlatformError`.
 */
export const loadScenarioCorpus = (
  dir: string,
): Effect.Effect<
  ReadonlyArray<ScenarioCorpusEntry>,
  YamlParseError | SchemaDecodeError | ConfigError | import("@effect/platform/Error").PlatformError,
  FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const all = yield* fs.readDirectory(dir);
    const yamlFiles = all
      .filter((f) => f.endsWith(".yaml"))
      .map((f) => path.join(dir, f))
      .sort();

    const seen = new Map<string, string>();
    const entries: ScenarioCorpusEntry[] = [];

    for (const filePath of yamlFiles) {
      const input = yield* loadScenarioFile(filePath);
      const prior = seen.get(input.name);
      if (prior !== undefined) {
        return yield* Effect.fail(
          new ConfigError({
            path: filePath,
            message: `duplicate scenario name "${input.name}" (also defined in ${prior})`,
          }),
        );
      }
      seen.set(input.name, filePath);

      const mdPath = path.resolve(dir, input.scenarioMd);
      const scenarioMd = yield* fs.readFileString(mdPath).pipe(
        Effect.mapError(
          (e) =>
            new ConfigError({
              path: mdPath,
              message: `failed to read scenarioMd for scenario ${input.name}: ${e.message}`,
            }),
        ),
      );

      const scenarioHash = computeScenarioHash({
        fixture: input.fixture,
        scorer: input.scorer,
        scorerParams: input.scorerParams,
        players: input.players,
        cutoffs: input.cutoffs,
      });

      entries.push({
        name: input.name,
        fixture: input.fixture,
        players: input.players,
        scorer: input.scorer,
        scorerParams: input.scorerParams,
        cutoffs: input.cutoffs,
        tier: input.tier,
        scenarioMd,
        scenarioHash,
        tags: input.tags,
      });
    }

    return entries;
  });
