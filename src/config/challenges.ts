import path from "node:path";
import { FileSystem } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { Effect, Schema } from "effect";
import {
  ConfigError,
  SchemaDecodeError,
  UnknownConstraintCheck,
  type YamlParseError,
} from "../errors/config.js";
import { Challenge, type ChallengeItem } from "../schema/challenge.js";
import { ConstraintCheck } from "../schema/enums.js";
import type { PromptCorpusEntry, SystemPrompt } from "../schema/prompt.js";
import type { ScorerConfig } from "../schema/scorer.js";
import { translateInlineFlags } from "../scoring/regex-flags.js";
import { computePromptHash, shortSha256, stableStringify } from "./hashing.js";
import { parseYaml } from "./yaml.js";

export interface ResolvedItem {
  readonly itemId: string;
  readonly promptHash: string;
  readonly itemHash: string;
  readonly scorer: ScorerConfig;
  readonly prompt: PromptCorpusEntry;
}
export interface ResolvedChallenge {
  readonly id: string;
  readonly version: number;
  readonly passThreshold: number;
  readonly challengeHash: string;
  readonly items: ReadonlyArray<ResolvedItem>;
}

const scorerKey = (s: ScorerConfig): string => stableStringify(s);

/**
 * System prompt is a config concern, not a challenge concern. Inline items
 * never carry one, so every resolved item's prompt records the empty `none`
 * system. Kept so {@link PromptCorpusEntry} stays self-contained and the
 * `promptHash` formula (`promptText + system.text`) is unchanged from the
 * pre-inline era — existing archived attempts remain reconstructable.
 */
const NONE_SYSTEM: SystemPrompt = { key: "none", text: "" };

/**
 * Known constraint check names. Pre-validated against the raw parsed YAML
 * *before* the schema decode runs, so an unknown `check:` value fails with
 * {@link UnknownConstraintCheck} instead of a generic {@link SchemaDecodeError}.
 */
const KNOWN_CONSTRAINT_CHECKS: ReadonlySet<string> = new Set(ConstraintCheck.literals);

/** Scan one raw parsed item for an unknown constraint `check` discriminator. */
const detectUnknownConstraintCheck = (rawItem: unknown): string | null => {
  if (rawItem === null || typeof rawItem !== "object") return null;
  const item = rawItem as Record<string, unknown>;
  if (item["scorer"] !== "constraint") return null;
  const constraints = item["constraints"];
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
 * Validate a `set_match` / `ordered_match` config. Returns a problem message,
 * or `null` if the config is well-formed. The subset rule is load-bearing: an
 * `expected` token outside `vocabulary` can never be matched in a response, so
 * it would silently cap recall below 1 and make the item unwinnable.
 */
const validateEntityScorer = (
  vocabulary: ReadonlyArray<string>,
  expected: ReadonlyArray<string>,
): string | null => {
  if (vocabulary.length === 0) return "vocabulary must be non-empty";
  if (expected.length === 0) return "expected must be non-empty";
  const seen = new Set<string>();
  for (const e of expected) {
    if (seen.has(e)) return `expected contains duplicate '${e}'`;
    seen.add(e);
  }
  const vocab = new Set(vocabulary);
  const missing = expected.filter((e) => !vocab.has(e));
  if (missing.length > 0) {
    return `expected tokens not in vocabulary: [${missing.join(", ")}]`;
  }
  return null;
};

/** Compile a pattern as a JS RegExp; returns the error message, or `null` if it compiles. */
const regexCompileProblem = (pattern: string, flags: string): string | null =>
  Effect.runSync(
    Effect.try({
      try: () => new RegExp(pattern, flags),
      catch: (e) => (e instanceof Error ? e.message : String(e)),
    }).pipe(Effect.match({ onFailure: (msg) => msg, onSuccess: () => null })),
  );

/**
 * Fail fast at load time on any regex-family constraint whose pattern does
 * not compile as a JS RegExp (after leading Python inline-flag translation,
 * mirroring exactly what `constraint-checks.ts` does at scoring time). An
 * uncompilable pattern can never pass — at runtime it lands in the scorer's
 * `errored` bucket and silently counts as 0 — so authoring mistakes must be
 * loud here rather than quietly capping every attempt's score.
 */
const validateConstraintPatterns = (
  challengeId: string,
  item: ChallengeItem,
): ConfigError | null => {
  if (item.scorer !== "constraint") return null;
  for (const c of item.constraints) {
    if (c.check !== "regex" && c.check !== "regex_count_min") continue;
    const base = c.check === "regex" ? (c.dotall === true ? "s" : "") : "g";
    const t = translateInlineFlags(c.pattern, base);
    const problem = regexCompileProblem(t.pattern, t.flags);
    if (problem !== null) {
      return new ConfigError({
        path: challengeId,
        message:
          `Challenge '${challengeId}' item '${item.name}' constraint '${c.name}' (${c.check}): ` +
          `pattern does not compile as a JS RegExp after inline-flag translation: ` +
          `${c.pattern} — ${problem}`,
      });
    }
  }
  return null;
};

/**
 * Bridge a decoded inline {@link ChallengeItem} (flat YAML shape) into a nested
 * {@link ScorerConfig}. For `code_exec` the companion test file is read here,
 * resolved relative to {@link challengeDir}.
 */
const resolveScorer = (
  item: ChallengeItem,
  challengeDir: string,
): Effect.Effect<ScorerConfig, ConfigError, FileSystem.FileSystem> => {
  switch (item.scorer) {
    case "exact_match":
      return Effect.succeed({
        type: "exact_match" as const,
        expected: item.expected,
        extract: item.extract,
      });
    case "constraint":
      return Effect.succeed({ type: "constraint" as const, constraints: item.constraints });
    case "game":
      return Effect.succeed({
        type: "game" as const,
        gameScorer: item.gameScorer,
        scorerParams: item.scorerParams,
      });
    case "set_match":
    case "ordered_match": {
      const problem = validateEntityScorer(item.vocabulary, item.expected);
      if (problem !== null) {
        return Effect.fail(
          new ConfigError({
            path: item.name,
            message: `Item '${item.name}' (${item.scorer}): ${problem}`,
          }),
        );
      }
      return Effect.succeed({
        type: item.scorer,
        vocabulary: item.vocabulary,
        expected: item.expected,
        caseSensitive: item.caseSensitive,
      });
    }
    case "code_exec": {
      const resolved = path.resolve(challengeDir, item.testFile);
      return Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const testCode = yield* fs.readFileString(resolved).pipe(
          Effect.mapError(
            (e) =>
              new ConfigError({
                path: resolved,
                message: `failed to read testFile for item ${item.name}: ${e.message}`,
              }),
          ),
        );
        return { type: "code_exec" as const, testCode };
      });
    }
  }
};

/** Build the frozen {@link PromptCorpusEntry} for one inline item. */
const buildPromptEntry = (
  item: ChallengeItem,
  challengeDir: string,
): Effect.Effect<PromptCorpusEntry, ConfigError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const scorer = yield* resolveScorer(item, challengeDir);
    return {
      name: item.name,
      category: item.category,
      tier: item.tier,
      system: NONE_SYSTEM,
      promptText: item.prompt,
      scorer,
      promptHash: computePromptHash(item.prompt, NONE_SYSTEM.text),
      tags: item.tags,
    };
  });

export const resolveChallenge = (
  challenge: Challenge,
  challengeDir: string,
): Effect.Effect<ResolvedChallenge, ConfigError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const seen = new Map<string, number>();
    const items = yield* Effect.forEach(challenge.items, (item, index) =>
      Effect.gen(function* () {
        const prior = seen.get(item.name);
        if (prior !== undefined) {
          return yield* Effect.fail(
            new ConfigError({
              path: challenge.id,
              message: `Challenge '${challenge.id}' has duplicate item name '${item.name}' (items ${prior} and ${index}).`,
            }),
          );
        }
        seen.set(item.name, index);
        const patternProblem = validateConstraintPatterns(challenge.id, item);
        if (patternProblem !== null) {
          return yield* Effect.fail(patternProblem);
        }
        const prompt = yield* buildPromptEntry(item, challengeDir);
        const itemHash = shortSha256(`${prompt.promptHash}|${scorerKey(prompt.scorer)}`);
        return {
          itemId: prompt.name,
          promptHash: prompt.promptHash,
          itemHash,
          scorer: prompt.scorer,
          prompt,
        } satisfies ResolvedItem;
      }),
    );
    const challengeHash = shortSha256(
      items.map((i) => `${i.promptHash}:${scorerKey(i.scorer)}`).join("|"),
    );
    return {
      id: challenge.id,
      version: challenge.version,
      passThreshold: challenge.passThreshold,
      challengeHash,
      items,
    };
  });

export const loadChallenge = (
  challengePath: string,
): Effect.Effect<
  ResolvedChallenge,
  YamlParseError | SchemaDecodeError | UnknownConstraintCheck | ConfigError | PlatformError,
  FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const source = yield* fs.readFileString(challengePath);
    const parsed = yield* parseYaml(challengePath, source);

    // Pre-validate constraint check names per item so an unknown `check:` value
    // fails with UnknownConstraintCheck rather than a generic decode error.
    if (parsed !== null && typeof parsed === "object") {
      const rawItems = (parsed as Record<string, unknown>)["items"];
      if (Array.isArray(rawItems)) {
        for (const raw of rawItems) {
          const badCheck = detectUnknownConstraintCheck(raw);
          if (badCheck !== null) {
            return yield* Effect.fail(new UnknownConstraintCheck({ check: badCheck }));
          }
        }
      }
    }

    const decoded = yield* Schema.decodeUnknown(Challenge)(parsed).pipe(
      Effect.mapError((cause) => new SchemaDecodeError({ typeName: "Challenge", cause })),
    );
    return yield* resolveChallenge(decoded, path.dirname(challengePath));
  });

export interface ChallengeFile {
  readonly stem: string;
  readonly path: string;
}

/**
 * List every `*.yaml` in `dir` as `{ stem, path }`, sorted by stem. Selection
 * matches on the filename stem, so this never parses the YAML — the loaded
 * challenge's own `id` is still authoritative for the archive.
 */
export const listChallengeFiles = (
  dir: string,
): Effect.Effect<
  ReadonlyArray<ChallengeFile>,
  import("@effect/platform/Error").PlatformError,
  FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const entries = yield* fs.readDirectory(dir);
    return entries
      .filter((f) => f.endsWith(".yaml"))
      .map((f) => ({ stem: f.replace(/\.yaml$/, ""), path: path.join(dir, f) }))
      .sort((a, b) => a.stem.localeCompare(b.stem));
  });
