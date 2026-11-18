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
import { Challenge, type ChallengeItem, type SingleItem } from "../schema/challenge.js";
import type { ConstraintDef } from "../schema/constraints.js";
import { ConstraintCheck } from "../schema/enums.js";
import type { ChatMessage, PromptCorpusEntry, SystemPrompt } from "../schema/prompt.js";
import type { ScorerConfig } from "../schema/scorer.js";
import { scoreConstraints } from "../scoring/constraint.js";
import { scoreExactMatch } from "../scoring/exact-match.js";
import { translateInlineFlags } from "../scoring/regex-flags.js";
import { computePromptHash, shortSha256, stableStringify } from "./hashing.js";
import { selectChallengeStems } from "./select.js";
import { parseYaml } from "./yaml.js";

export interface ResolvedItem {
  readonly itemId: string;
  readonly promptHash: string;
  readonly itemHash: string;
  readonly scorer: ScorerConfig;
  readonly prompt: PromptCorpusEntry;
  /** Multi-turn item name this unit is a turn of; absent on single-shot items. */
  readonly parentItemId?: string;
  /** 1-based turn index; absent on single-shot items. */
  readonly turn?: number;
  /**
   * Cluster id for the report's uncertainty: the YAML `family`, else the item's
   * own `challengeId/name` (a turn defaults to its parent's). Metadata only —
   * it enters no hash, so changing it never re-identifies an item.
   */
  readonly family: string;
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

/** Scan one raw parsed item (and each of its turns) for an unknown constraint `check` discriminator. */
const detectUnknownConstraintCheck = (rawItem: unknown): string | null => {
  if (rawItem === null || typeof rawItem !== "object") return null;
  const item = rawItem as Record<string, unknown>;
  const turns = item["turns"];
  if (Array.isArray(turns)) {
    for (const t of turns) {
      const bad = detectUnknownConstraintCheck(t);
      if (bad !== null) return bad;
    }
    return null;
  }
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
const validateConstraintPatterns = (challengeId: string, item: SingleItem): ConfigError | null => {
  if (item.scorer !== "constraint") return null;
  const nearMisses = (item.nearMisses ?? []).map(
    (n): ConstraintDef => ({
      check: "regex",
      name: `near miss ${n.slip}`,
      pattern: n.pattern,
    }),
  );
  for (const c of [...item.constraints, ...nearMisses]) {
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
 * Bridge a decoded inline {@link SingleItem} (flat YAML shape) into a nested
 * {@link ScorerConfig}. For `code_exec` the companion test file is read here,
 * resolved relative to {@link challengeDir}.
 */
const resolveScorer = (
  item: SingleItem,
  challengeDir: string,
): Effect.Effect<ScorerConfig, ConfigError, FileSystem.FileSystem> => {
  switch (item.scorer) {
    case "exact_match":
      return Effect.succeed({
        type: "exact_match" as const,
        expected: item.expected,
        extract: item.extract,
        // Absent unless declared, so items without near misses keep their scorerHash.
        ...(item.nearMisses === undefined ? {} : { nearMisses: item.nearMisses }),
      });
    case "constraint":
      return Effect.succeed({
        type: "constraint" as const,
        constraints: item.constraints,
        ...(item.nearMisses === undefined ? {} : { nearMisses: item.nearMisses }),
      });
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

/**
 * The text behind a prompt's `promptHash` and its `prompts/` blob: the plain
 * prompt when there is no history, otherwise the full conversation the turn is
 * asked under (`stableStringify` of the gold history plus the turn's prompt).
 */
export const promptContent = (p: Pick<PromptCorpusEntry, "promptText" | "history">): string =>
  p.history === undefined
    ? p.promptText
    : stableStringify([...p.history, { role: "user", content: p.promptText }]);

/** Build the frozen {@link PromptCorpusEntry} for one inline item (or one turn). */
const buildPromptEntry = (
  item: SingleItem,
  challengeDir: string,
  history: ReadonlyArray<ChatMessage> | undefined,
): Effect.Effect<PromptCorpusEntry, ConfigError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const scorer = yield* resolveScorer(item, challengeDir);
    const text = { promptText: item.prompt, ...(history === undefined ? {} : { history }) };
    return {
      name: item.name,
      category: item.category,
      tier: item.tier,
      system: NONE_SYSTEM,
      ...text,
      scorer,
      promptHash: computePromptHash(promptContent(text), NONE_SYSTEM.text),
      tags: item.tags,
    };
  });

/** One scored unit: a single-shot item, or one turn of a multi-turn item. */
interface Unit {
  readonly item: SingleItem;
  /** Gold assistant answer (turns only). */
  readonly answer?: string;
  readonly history?: ReadonlyArray<ChatMessage>;
  readonly parentItemId?: string;
  readonly turn?: number;
}

/**
 * Expand a multi-turn item into one unit per turn (`name#k`), each carrying
 * the gold history of turns 1..k-1. Single-shot items pass through.
 */
const expandItem = (item: ChallengeItem): ReadonlyArray<Unit> => {
  if (!("turns" in item)) return [{ item }];
  const history: ChatMessage[] = [];
  return item.turns.map(({ answer, ...turn }, i) => {
    const unit: Unit = {
      item: {
        ...turn,
        name: `${item.name}#${i + 1}`,
        category: item.category,
        tier: item.tier,
        tags: item.tags,
        family: item.family,
      },
      answer,
      ...(history.length === 0 ? {} : { history: [...history] }),
      parentItemId: item.name,
      turn: i + 1,
    };
    history.push({ role: "user", content: turn.prompt }, { role: "assistant", content: answer });
    return unit;
  });
};

/** Score a turn's gold answer under its own scorer; turns allow only the pure scorers. */
const goldScore = (answer: string, scorer: ScorerConfig): Effect.Effect<number> =>
  scorer.type === "exact_match"
    ? Effect.map(scoreExactMatch(answer, scorer), (s) => s.score)
    : scorer.type === "constraint"
      ? Effect.map(scoreConstraints(answer, scorer), (s) => s.score)
      : Effect.succeed(0);

export const resolveChallenge = (
  challenge: Challenge,
  challengeDir: string,
): Effect.Effect<ResolvedChallenge, ConfigError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const seen = new Map<string, number>();
    const units = challenge.items.flatMap((item, index) =>
      expandItem(item).map((u) => ({ ...u, index })),
    );
    const items = yield* Effect.forEach(units, ({ item, answer, history, index, ...turn }) =>
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
        const prompt = yield* buildPromptEntry(item, challengeDir, history);
        if (answer !== undefined && (yield* goldScore(answer, prompt.scorer)) !== 1) {
          return yield* Effect.fail(
            new ConfigError({
              path: challenge.id,
              message: `Challenge '${challenge.id}' turn '${item.name}': gold answer '${answer}' does not score 1 under its own scorer.`,
            }),
          );
        }
        const itemHash = shortSha256(`${prompt.promptHash}|${scorerKey(prompt.scorer)}`);
        return {
          itemId: prompt.name,
          promptHash: prompt.promptHash,
          itemHash,
          scorer: prompt.scorer,
          prompt,
          ...turn,
          family: item.family ?? `${challenge.id}/${turn.parentItemId ?? item.name}`,
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

/** One selected suite: its file stem plus the fully resolved challenge. */
export interface SelectedChallenge {
  readonly stem: string;
  readonly resolved: ResolvedChallenge;
}

/**
 * The outcome of one selection pass. {@link stems} is the selected stem list in
 * the same order as {@link challenges} — callers that need a stem axis (the
 * matrix grid's columns) read it directly instead of re-deriving it.
 */
export interface SelectedChallenges {
  readonly stems: ReadonlyArray<string>;
  readonly challenges: ReadonlyArray<SelectedChallenge>;
}

/**
 * The single challenge-selection path: list `dir`, keep the stems matching
 * `pattern` (no pattern → every suite), and load each match, sorted by stem.
 *
 * An empty selection is returned as empty rather than failed — "nothing
 * matched" means different things to different callers (a fatal
 * misconfiguration for `run`, an ordinary empty report elsewhere), so the
 * policy stays with the caller.
 */
export const loadSelectedChallenges = (
  dir: string,
  pattern?: string,
): Effect.Effect<
  SelectedChallenges,
  | YamlParseError
  | SchemaDecodeError
  | UnknownConstraintCheck
  | ConfigError
  | import("@effect/platform/Error").PlatformError,
  FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const files = yield* listChallengeFiles(dir);
    const stems = selectChallengeStems(
      files.map((f) => f.stem),
      pattern,
    );
    const chosen = files.filter((f) => stems.includes(f.stem));
    const challenges = yield* Effect.forEach(chosen, (f) =>
      loadChallenge(f.path).pipe(Effect.map((resolved) => ({ stem: f.stem, resolved }))),
    );
    return { stems: chosen.map((f) => f.stem), challenges };
  });
