/**
 * The content-addressed sidecar store of self-sufficient v2 archives: prompt
 * text, scorer config and system-prompt text as blobs under
 * `<archiveDir>/content/{prompts,scorers,system}/`, keyed by reused identity
 * hashes (promptHash / scorerHash / configHash). Blobs are read only through a
 * dataset's pins (src/legacy/pinned.ts), which also check each blob's bytes
 * against its key ({@link verifyBlob}).
 */
import { Effect } from "effect";
import { BlobDigestMismatch } from "../errors/index.js";
import { computeConfigHash, computePromptHash, shortSha256 } from "./identity.js";

export type BlobKind = "prompts" | "scorers" | "system";

/**
 * What a system blob is checked against: its configHash plus the other inputs
 * that hash covers. An attempt manifest or a resolved configuration.
 */
export type SystemKey = Parameters<typeof computeConfigHash>[0] & {
  readonly configHash: string;
  /** The manifest's schemaVersion; absent for a resolved configuration. */
  readonly schemaVersion?: number;
};

/** A prompt or scorer blob is named by its key; a system blob by its {@link SystemKey}. */
export type BlobRef<K extends BlobKind> = K extends "system" ? SystemKey : string;

export const contentDir = (archiveDir: string): string => `${archiveDir}/content`;

/** The configHash inputs a manifest records as generation provenance. */
const GENERATION_KNOBS = [
  "repetitionPenalty",
  "repetitionContextSize",
  "topP",
  "topK",
  "minP",
  "presencePenalty",
  "presenceContextSize",
  "chatTemplateKwargs",
  "chatTemplateSha",
] as const;

/**
 * Whether `k` carries every input of its configHash. A schemaVersion 2
 * manifest that records none of the generation knobs was written before
 * manifests recorded them, while configHash already included any the
 * configuration set, so its configHash cannot be recomputed from it.
 */
export const configHashRecomputable = (k: SystemKey): boolean =>
  (k.schemaVersion ?? 3) >= 3 || GENERATION_KNOBS.some((f) => k[f] !== undefined);

const keyOf = (ref: string | SystemKey): string => (typeof ref === "string" ? ref : ref.configHash);

/**
 * Check `content` against the key it is stored under:
 * - prompts: `computePromptHash(content, "")` (prompt hashes carry no system text);
 * - scorers: `shortSha256(content)`, the exact stored bytes;
 * - system: `computeConfigHash(ref, content)`, except that a mismatch is
 *   accepted when {@link configHashRecomputable} is false.
 */
export const verifyBlob = <K extends BlobKind>(
  kind: K,
  ref: BlobRef<K>,
  content: string,
): Effect.Effect<void, BlobDigestMismatch> => {
  const r: string | SystemKey = ref;
  const key = keyOf(r);
  const actual =
    kind === "prompts"
      ? computePromptHash(content, "")
      : kind === "scorers"
        ? shortSha256(content)
        : computeConfigHash(r as SystemKey, content);
  if (actual === key) return Effect.void;
  if (kind === "system" && !configHashRecomputable(r as SystemKey)) return Effect.void;
  return Effect.fail(new BlobDigestMismatch({ kind, key, actual }));
};
