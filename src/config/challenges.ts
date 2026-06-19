import { FileSystem } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { Effect, Schema } from "effect";
import { ConfigError, SchemaDecodeError, type YamlParseError } from "../errors/config.js";
import { Challenge } from "../schema/challenge.js";
import type { PromptCorpusEntry } from "../schema/prompt.js";
import type { ScorerConfig } from "../schema/scorer.js";
import { shortSha256, stableStringify } from "./hashing.js";
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

export const resolveChallenge = (
  challenge: Challenge,
  corpus: ReadonlyArray<PromptCorpusEntry>,
): Effect.Effect<ResolvedChallenge, ConfigError, never> =>
  Effect.gen(function* () {
    const byName = new Map(corpus.map((p) => [p.name, p]));
    const items = yield* Effect.forEach(challenge.items, (item) =>
      Effect.gen(function* () {
        const prompt = byName.get(item.prompt);
        if (prompt === undefined) {
          return yield* Effect.fail(
            new ConfigError({
              path: challenge.id,
              message: `Challenge '${challenge.id}' references unknown prompt '${item.prompt}'.`,
            }),
          );
        }
        const scorer = item.scorer ?? prompt.scorer;
        const itemHash = shortSha256(`${prompt.promptHash}|${scorerKey(scorer)}`);
        return {
          itemId: prompt.name,
          promptHash: prompt.promptHash,
          itemHash,
          scorer,
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
  path: string,
  corpus: ReadonlyArray<PromptCorpusEntry>,
): Effect.Effect<
  ResolvedChallenge,
  YamlParseError | SchemaDecodeError | ConfigError | PlatformError,
  FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const source = yield* fs.readFileString(path);
    const parsed = yield* parseYaml(path, source);
    const decoded = yield* Schema.decodeUnknown(Challenge)(parsed).pipe(
      Effect.mapError((cause) => new SchemaDecodeError({ typeName: "Challenge", cause })),
    );
    return yield* resolveChallenge(decoded, corpus);
  });
