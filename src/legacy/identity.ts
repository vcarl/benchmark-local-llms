/**
 * The 12-hex identities that name legacy archives: configHash, promptHash,
 * itemHash, challengeHash and scorerHash. They exist only to read and
 * re-derive legacy attempts; every other identity is a full sha256 digest
 * (src/store/digest.ts). Computing them lives here and nowhere else.
 */
import { createHash } from "node:crypto";
import { promptContent, type ResolvedChallenge } from "../config/challenges.js";
import { stableStringify } from "../config/hashing.js";
import type { ScorerConfig } from "../schema/scorer.js";
import type { SetChallenge } from "./rows.js";

export const shortSha256 = (input: string): string =>
  createHash("sha256").update(input, "utf8").digest("hex").slice(0, 12);

/** Hash of what the model sees: prompt text joined with the resolved system prompt text. */
export const computePromptHash = (promptText: string, systemText: string): string =>
  shortSha256(`${promptText}|${systemText}`);

/** Store key (and on-disk bytes preimage) for a scorer config. */
export const scorerHash = (scorer: ScorerConfig): string => shortSha256(stableStringify(scorer));

/** The configHash inputs; `chatTemplateSha` is the 12-hex prefix of the template file's digest. */
export interface ConfigHashInputs {
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
  presenceContextSize?: number | undefined;
  chatTemplateKwargs?: Readonly<Record<string, string | number | boolean>> | undefined;
  chatTemplateSha?: string | undefined;
}

/** Identity hash for a configuration: knobs the user sets, not code version. */
export const computeConfigHash = (c: ConfigHashInputs, systemPromptText: string): string =>
  shortSha256(
    [
      c.artifact,
      c.runtime,
      c.quant ?? "",
      String(c.temperature),
      String(c.maxTokens),
      systemPromptText,
      // Appended, and only when set, so configurations without the sampler
      // knobs keep the hash they already have.
      ...(c.repetitionPenalty === undefined ? [] : [`rp=${c.repetitionPenalty}`]),
      ...(c.repetitionContextSize === undefined ? [] : [`rcs=${c.repetitionContextSize}`]),
      ...(c.topP === undefined ? [] : [`tp=${c.topP}`]),
      ...(c.topK === undefined ? [] : [`tk=${c.topK}`]),
      ...(c.minP === undefined ? [] : [`mp=${c.minP}`]),
      ...(c.presencePenalty === undefined ? [] : [`pp=${c.presencePenalty}`]),
      ...(c.presenceContextSize === undefined ? [] : [`pcs=${c.presenceContextSize}`]),
      // Keys sorted so YAML key order does not change identity.
      ...(c.chatTemplateKwargs === undefined
        ? []
        : [
            `ctk=${JSON.stringify(Object.entries(c.chatTemplateKwargs).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))}`,
          ]),
      // The template renders the prompt the model sees, so its content is identity.
      ...(c.chatTemplateSha === undefined ? [] : [`ct=${c.chatTemplateSha}`]),
    ].join("|"),
  );

/** Per-item and per-challenge identity of a resolved challenge. */
export interface LegacyChallengeIdentity {
  readonly challengeHash: string;
  readonly items: ReadonlyArray<{
    readonly itemId: string;
    readonly promptHash: string;
    readonly itemHash: string;
    readonly scorerHash: string;
  }>;
}

export const legacyItemIdentity = (c: ResolvedChallenge): LegacyChallengeIdentity => {
  const items = c.items.map((i) => {
    // Inline items never carry a system prompt, so the hash joins an empty one.
    const promptHash = computePromptHash(promptContent(i.prompt), "");
    return {
      itemId: i.itemId,
      promptHash,
      itemHash: shortSha256(`${promptHash}|${stableStringify(i.scorer)}`),
      scorerHash: scorerHash(i.scorer),
    };
  });
  const challengeHash = shortSha256(
    c.items.map((i, k) => `${items[k]?.promptHash}:${stableStringify(i.scorer)}`).join("|"),
  );
  return { challengeHash, items };
};

/** The slice of a resolved challenge the legacy rows key on: its items' `itemHash` and the `challengeHash`. */
export const legacySetChallenge = (c: ResolvedChallenge): SetChallenge => {
  const { challengeHash, items } = legacyItemIdentity(c);
  return {
    id: c.id,
    version: c.version,
    challengeHash,
    items: c.items.map((i, k) => ({
      itemId: i.itemId,
      itemHash: items[k]?.itemHash as string,
      promptHash: items[k]?.promptHash as string,
      scorerHash: items[k]?.scorerHash as string,
      family: i.family,
      scope: i.scope,
    })),
  };
};
