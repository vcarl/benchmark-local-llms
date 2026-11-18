import type { LoadedAttempt } from "./load-attempts.js";

export interface DetailSelection {
  readonly dropped: { readonly incomplete: number; readonly duplicate: number };
  readonly detailSources: ReadonlyArray<{ attemptId: string; sourcePath: string }>;
}

const isCompleted = (a: LoadedAttempt): boolean =>
  a.manifest.finishedAt !== null && a.manifest.interrupted === false;

/**
 * The attempts that get an item-detail file: completed ones, deduplicated by
 * `attemptId` (first wins). Interrupted and duplicate attempts are counted.
 */
export const detailSources = (attempts: ReadonlyArray<LoadedAttempt>): DetailSelection => {
  let incomplete = 0;
  let duplicate = 0;
  const seen = new Set<string>();
  const sources: { attemptId: string; sourcePath: string }[] = [];
  for (const a of attempts) {
    if (!isCompleted(a)) incomplete++;
    else if (seen.has(a.manifest.attemptId)) duplicate++;
    else {
      seen.add(a.manifest.attemptId);
      sources.push({ attemptId: a.manifest.attemptId, sourcePath: a.sourcePath });
    }
  }
  return { dropped: { incomplete, duplicate }, detailSources: sources };
};
