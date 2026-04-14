import path from "node:path";
import { FileSystem } from "@effect/platform";
import { Effect, Schema } from "effect";
import {
  ConfigError,
  SchemaDecodeError,
  UnknownConstraintCheck,
  UnknownSystemPrompt,
  type YamlParseError,
} from "../errors/config.js";
import { ConstraintDef } from "../schema/constraints.js";
import { ConstraintCheck } from "../schema/enums.js";
import type { PromptCorpusEntry } from "../schema/prompt.js";
import { computePromptHash } from "./hashing.js";
import { SystemPromptRegistry } from "./system-prompts.js";
import { parseYaml } from "./yaml.js";

/**
 * Raw per-file prompt YAML shape. The on-disk representation is deliberately
 * *flat* (one file per prompt, scorer config interleaved with prompt metadata
 * — see §2.2), whereas {@link PromptCorpusEntry} is *nested* (scorer is a
 * discriminated union struct). This loader bridges the two formats.
 *
 * Split into four `scorer:`-discriminated structs instead of a single wide
 * struct so missing-required-field errors (e.g. `scorer: exact_match` without
 * `extract`) surface as `SchemaDecodeError` with a pointer to the exact
 * field, rather than a generic "any field could be optional" accept-anything.
 */
const ExactMatchInput = Schema.Struct({
  name: Schema.String,
  category: Schema.String,
  tier: Schema.Number,
  system: Schema.String,
  prompt: Schema.String,
  scorer: Schema.Literal("exact_match"),
  expected: Schema.String,
  extract: Schema.String,
});

const ConstraintInput = Schema.Struct({
  name: Schema.String,
  category: Schema.String,
  tier: Schema.Number,
  system: Schema.String,
  prompt: Schema.String,
  scorer: Schema.Literal("constraint"),
  // Decoded as an array of ConstraintDefs — the constraint union already
  // exists in the schema layer, so we reuse it rather than re-defining the
  // 20 variants here.
  constraints: Schema.Array(ConstraintDef),
});

const CodeExecInput = Schema.Struct({
  name: Schema.String,
  category: Schema.String,
  tier: Schema.Number,
  system: Schema.String,
  prompt: Schema.String,
  scorer: Schema.Literal("code_exec"),
  /** Path to companion test file, resolved relative to the prompts dir. */
  testFile: Schema.String,
});

const GameInput = Schema.Struct({
  name: Schema.String,
  category: Schema.String,
  tier: Schema.Number,
  system: Schema.String,
  prompt: Schema.String,
  scorer: Schema.Literal("game"),
  gameScorer: Schema.String,
  scorerParams: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
});

const PromptInput = Schema.Union(ExactMatchInput, ConstraintInput, CodeExecInput, GameInput);
type PromptInput = typeof PromptInput.Type;

/**
 * Known constraint check names. Pre-validated against the raw parsed YAML
 * *before* the schema decode runs, so that an unknown `check:` value fails
 * with {@link UnknownConstraintCheck} instead of a generic
 * {@link SchemaDecodeError}. Matches `ConstraintCheck` in `src/schema/enums.ts`.
 *
 * A stricter alternative would be to parse the `ParseError` produced by
 * `ConstraintDef` and detect "unknown discriminator" failures specifically;
 * pre-validation is simpler and avoids coupling to internal ParseError shape.
 */
const KNOWN_CONSTRAINT_CHECKS: ReadonlySet<string> = new Set(ConstraintCheck.literals);

/**
 * Scan the pre-schema parsed YAML for an unknown constraint check discriminator.
 * Returns `Option.none`-like null on no violation, or the offending check name.
 */
const detectUnknownConstraintCheck = (parsed: unknown): string | null => {
  if (parsed === null || typeof parsed !== "object") return null;
  const root = parsed as Record<string, unknown>;
  if (root["scorer"] !== "constraint") return null;
  const constraints = root["constraints"];
  if (!Array.isArray(constraints)) return null;
  for (const raw of constraints) {
    if (raw === null || typeof raw !== "object") continue;
    const check = (raw as Record<string, unknown>)["check"];
    if (typeof check === "string" && !KNOWN_CONSTRAINT_CHECKS.has(check)) {
      return check;
    }
  }
  return null;
};

/**
 * Load a single prompt file: read, YAML-parse, validate constraint check names
 * up-front, schema-decode into {@link PromptInput}. The companion test file
 * (for `code_exec` scorers) is NOT resolved here — that happens in the corpus
 * pass so both "read .yaml" and "read .test.py" can be parallelized.
 */
const loadPromptFile = (
  filePath: string,
): Effect.Effect<
  PromptInput,
  | YamlParseError
  | SchemaDecodeError
  | UnknownConstraintCheck
  | import("@effect/platform/Error").PlatformError,
  FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const source = yield* fs.readFileString(filePath);
    const parsed = yield* parseYaml(filePath, source);
    const badCheck = detectUnknownConstraintCheck(parsed);
    if (badCheck !== null) {
      return yield* Effect.fail(new UnknownConstraintCheck({ check: badCheck }));
    }
    return yield* Schema.decodeUnknown(PromptInput)(parsed).pipe(
      Effect.mapError((cause) => new SchemaDecodeError({ typeName: "PromptInput", cause })),
    );
  });

/**
 * Convert a decoded {@link PromptInput} (flat YAML shape) into a frozen
 * {@link PromptCorpusEntry} (nested scorer-config shape). Resolves the system
 * prompt key against the registry, reads the companion test file for
 * `code_exec` entries, and computes `promptHash`.
 */
const buildCorpusEntry = (
  input: PromptInput,
  promptsDir: string,
  registry: Record<string, string>,
): Effect.Effect<PromptCorpusEntry, UnknownSystemPrompt | ConfigError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const systemText = registry[input.system];
    if (systemText === undefined) {
      return yield* Effect.fail(
        new UnknownSystemPrompt({
          key: input.system,
          availableKeys: Object.keys(registry),
        }),
      );
    }
    const system = { key: input.system, text: systemText };
    const promptHash = computePromptHash(input.prompt, systemText);

    const scorer = yield* resolveScorer(input, promptsDir);

    return {
      name: input.name,
      category: input.category,
      tier: input.tier,
      system,
      promptText: input.prompt,
      scorer,
      promptHash,
    };
  });

const resolveScorer = (
  input: PromptInput,
  promptsDir: string,
): Effect.Effect<PromptCorpusEntry["scorer"], ConfigError, FileSystem.FileSystem> => {
  switch (input.scorer) {
    case "exact_match":
      return Effect.succeed({
        type: "exact_match" as const,
        expected: input.expected,
        extract: input.extract,
      });
    case "constraint":
      return Effect.succeed({
        type: "constraint" as const,
        constraints: input.constraints,
      });
    case "game":
      return Effect.succeed({
        type: "game" as const,
        gameScorer: input.gameScorer,
        scorerParams: input.scorerParams,
      });
    case "code_exec": {
      const resolved = path.resolve(promptsDir, input.testFile);
      return Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const testCode = yield* fs.readFileString(resolved).pipe(
          Effect.mapError(
            (e) =>
              new ConfigError({
                path: resolved,
                message: `failed to read testFile for prompt ${input.name}: ${e.message}`,
              }),
          ),
        );
        return { type: "code_exec" as const, testCode };
      });
    }
  }
};

/**
 * Load every `*.yaml` in the prompts directory (flat, excluding
 * `system-prompts.yaml` and the `scenarios/` subdir), decode as a single
 * {@link PromptCorpusEntry} each, and validate the corpus as a whole.
 *
 * **Required services**
 * - `FileSystem.FileSystem` (read YAML + companion test files)
 * - {@link SystemPromptRegistry} (validate `system:` keys)
 *
 * **Failure modes** (fail-fast, first violation wins):
 * - File read → `PlatformError` (raised by @effect/platform).
 * - YAML parse → {@link YamlParseError}.
 * - Schema decode → {@link SchemaDecodeError}.
 * - Unknown constraint `check` discriminator → {@link UnknownConstraintCheck}.
 * - Unknown `system:` key → {@link UnknownSystemPrompt}.
 * - Duplicate prompt `name` across two files → {@link ConfigError} listing
 *   both paths.
 */
export const loadPromptCorpus = (
  dir: string,
): Effect.Effect<
  ReadonlyArray<PromptCorpusEntry>,
  | YamlParseError
  | SchemaDecodeError
  | UnknownSystemPrompt
  | UnknownConstraintCheck
  | ConfigError
  | import("@effect/platform/Error").PlatformError,
  FileSystem.FileSystem | SystemPromptRegistry
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const registry = yield* SystemPromptRegistry;

    const all = yield* fs.readDirectory(dir);
    const yamlFiles = all
      .filter((f) => f.endsWith(".yaml") && f !== "system-prompts.yaml")
      .map((f) => path.join(dir, f))
      .sort();

    // Duplicate detection: first-seen-by-name map. When the second copy is
    // encountered we fail with ConfigError carrying *both* paths (the earlier
    // path and the duplicate), per the plan's "Duplicate prompt names" rule.
    const seen = new Map<string, string>();
    const entries: PromptCorpusEntry[] = [];

    for (const filePath of yamlFiles) {
      const input = yield* loadPromptFile(filePath);
      const prior = seen.get(input.name);
      if (prior !== undefined) {
        return yield* Effect.fail(
          new ConfigError({
            path: filePath,
            message: `duplicate prompt name "${input.name}" (also defined in ${prior})`,
          }),
        );
      }
      seen.set(input.name, filePath);
      const entry = yield* buildCorpusEntry(input, dir, registry);
      entries.push(entry);
    }

    return entries;
  });
