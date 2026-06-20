import type { LoadedAttempt } from "./load-attempts.js";
import { toWebappRecord, type WebappRecord } from "./webapp-contract.js";

export interface AggregateResult {
  readonly records: ReadonlyArray<WebappRecord>;
  readonly dropped: { readonly incomplete: number; readonly duplicate: number };
  readonly detailSources: ReadonlyArray<{ attemptId: string; sourcePath: string }>;
}

const isCompleted = (a: LoadedAttempt): boolean =>
  a.manifest.finishedAt !== null && a.manifest.interrupted === false;

/**
 * Map loaded attempts to webapp records: keep only completed attempts, dedup by
 * `attemptId` (first wins), and flatten each to one {@link WebappRecord}.
 */
export const aggregateAttempts = (attempts: ReadonlyArray<LoadedAttempt>): AggregateResult => {
  let incomplete = 0;
  let duplicate = 0;
  const seen = new Set<string>();
  const records: WebappRecord[] = [];
  const detailSources: { attemptId: string; sourcePath: string }[] = [];
  for (const a of attempts) {
    if (!isCompleted(a)) {
      incomplete++;
      continue;
    }
    if (seen.has(a.manifest.attemptId)) {
      duplicate++;
      continue;
    }
    seen.add(a.manifest.attemptId);
    records.push(toWebappRecord(a.manifest, a.items));
    detailSources.push({ attemptId: a.manifest.attemptId, sourcePath: a.sourcePath });
  }
  return { records, dropped: { incomplete, duplicate }, detailSources };
};
