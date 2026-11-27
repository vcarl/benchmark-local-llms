/**
 * Rows of a v4 dataset (data-model spec, Layer 4): the manifest's bundles,
 * each execution graded by our score record at the eval version.
 *
 * - A row is config digest × hardwareId × contributor.
 * - An execution counts only when its prompt is current: its `messagesDigest`
 *   equals the one the release's prompt blob, the header's system prompt and
 *   the gold history give ({@link releaseMessagesDigest}, as `./bench verify`
 *   checks). Any other is stale: it needs no score record and never reaches
 *   a detail file.
 * - A cell (row × challenge) counts the executions of exactly one complete
 *   bundle, one run of the config on the challenge: the row's bundle of that
 *   challenge holding a current execution of every item, most recently
 *   started, a tie going to the lower bundle digest. Items are never pooled
 *   across bundles; with no complete bundle the cell is `not_run`.
 * - A missing score record fails the build (`./bench score` first); two
 *   records of one (execution, scorer) that disagree fail it naming the item.
 *
 * Cells and row statistics are the legacy rows' ({@link buildCell},
 * {@link assembleRows}); `sourceAttempts` holds bundle digests.
 */
import type { FileSystem, Path } from "@effect/platform";
import { Effect, Schema } from "effect";
import type { ResolvedChallenge } from "../config/challenges.js";
import { stableStringify } from "../config/hashing.js";
import type { V4Manifest } from "../dataset/manifest.js";
import { type FileIOError, SnapshotInvalid } from "../errors/index.js";
import { legacySetChallenge } from "../legacy/identity.js";
import {
  assembleRows,
  buildCell,
  type Cell,
  type Counted,
  type Dataset,
  type RowSource,
} from "../legacy/rows.js";
import {
  type DetailLine,
  detailPayload,
  type FamilyOf,
  writeDetailFile,
} from "../legacy/write-details.js";
import { type Release, releaseMessagesDigest, scorerDigestAt } from "../release/release.js";
import type { HardwareProfile } from "../schema/run-manifest.js";
import { ScorerBlob } from "../scoring/rules.js";
import { bundlePath, type Execution, readBundle, type VerifiedBundle } from "../store/bundle.js";
import { digestOf } from "../store/digest.js";
import { conflicts, readScores, type ScoreRecord } from "../store/scores.js";

/** One execution of a listed bundle with its score record at the eval version. */
export interface ScoredExecution {
  readonly bundle: VerifiedBundle;
  readonly execution: Execution;
  readonly digest: string;
  readonly record: ScoreRecord;
}

const fail = (path: string, detail: string) => Effect.fail(new SnapshotInvalid({ path, detail }));

/** Whether `execution` answered the release's current prompt for its item. */
export const isCurrent = (
  release: Pick<Release, "file" | "blobs">,
  bundle: Pick<VerifiedBundle, "header">,
  execution: Execution,
): boolean =>
  releaseMessagesDigest(release, execution.item, bundle.header.config.systemPrompt) ===
  execution.messagesDigest;

/** A listed bundle's execution that answered another prompt than the release's current one. */
export interface StaleExecution {
  readonly bundle: VerifiedBundle;
  readonly execution: Execution;
}

/**
 * Every listed bundle's current executions with their score records at
 * `evalVersion`, and its stale ones.
 */
export const scoredExecutions = (
  manifest: V4Manifest,
  release: Release,
  store: string,
  evalVersion: string | null,
) =>
  Effect.gen(function* () {
    const scored: ScoredExecution[] = [];
    const stale: StaleExecution[] = [];
    for (const digest of manifest.bundles) {
      const bundle = yield* readBundle(bundlePath(store, digest));
      if (bundle.header.release !== manifest.release) {
        return yield* fail(
          bundle.path,
          `release ${bundle.header.release}, dataset ${manifest.release}`,
        );
      }
      const records = yield* readScores(store, digest);
      const items = new Map(bundle.executions.map((e) => [digestOf(e), e.item]));
      const bad = conflicts(records, items)[0];
      if (bad !== undefined) {
        return yield* fail(
          bundle.path,
          `score records of ${bad.item} disagree under scorer ${bad.scorer} (nondeterministic scorer)`,
        );
      }
      const byKey = new Map(records.map((r) => [stableStringify([r.execution, r.scorer]), r]));
      for (const execution of bundle.executions) {
        const scorer = scorerDigestAt(release, evalVersion, execution.item);
        if (scorer === undefined || !isCurrent(release, bundle, execution)) {
          stale.push({ bundle, execution });
          continue;
        }
        const d = digestOf(execution);
        const record = byKey.get(stableStringify([d, scorer]));
        if (record === undefined) {
          return yield* fail(
            bundle.path,
            `no score record for ${execution.item} at ${evalVersion ?? "the draft"}; run ./bench score --dataset ${manifest.name}`,
          );
        }
        scored.push({ bundle, execution, digest: d, record });
      }
    }
    return { scored, stale };
  });

const rowIdOf = ({ header }: VerifiedBundle) =>
  `${header.configDigest}@${header.env.hardwareId}@${header.run.contributor}`;

/** The more recently started bundle; a tie goes to the lower digest. */
const later = (a: VerifiedBundle, b: VerifiedBundle) =>
  a.header.run.startedAt > b.header.run.startedAt ||
  (a.header.run.startedAt === b.header.run.startedAt && a.digest < b.digest);

const counted = ({ bundle, execution, record }: ScoredExecution): Counted => ({
  line: {
    score: record.score,
    failureKind: record.failureKind,
    executedAt: execution.executedAt,
    generationTokens: execution.measured.generationTokens,
    generationTps: execution.measured.generationTps,
    wallTimeSec: execution.measured.wallTimeSec,
    peakMemoryGb: execution.measured.peakMemoryGb,
  },
  runtimeVersion: bundle.header.env.runtimeVersion,
  gitSha: bundle.header.env.harnessGitSha,
  source: bundle.digest,
  restamped: false,
});

/** The rows of the listed bundles (`scored` and `stale`) over the challenge set. */
export const v4RowsOf = (
  {
    scored,
    stale,
  }: { scored: ReadonlyArray<ScoredExecution>; stale: ReadonlyArray<StaleExecution> },
  challenges: ReadonlyArray<ResolvedChallenge>,
  dataset: Dataset,
  modelKeys: ReadonlyMap<string, string>,
) => {
  const bundlesOf = new Map<string, Map<string, VerifiedBundle>>();
  for (const { bundle } of [...scored, ...stale]) {
    const k = rowIdOf(bundle);
    bundlesOf.set(k, (bundlesOf.get(k) ?? new Map()).set(bundle.digest, bundle));
  }
  const scoredOf = new Map<string, ScoredExecution[]>();
  for (const x of scored)
    scoredOf.set(x.bundle.digest, [...(scoredOf.get(x.bundle.digest) ?? []), x]);
  const hardware: Record<string, HardwareProfile> = {};
  const rows: RowSource[] = [];
  for (const [rowId, byDigest] of bundlesOf) {
    const bundles = [...byDigest.values()];
    const { header } = bundles.reduce((x, y) => (later(y, x) ? y : x));
    const cells: Record<string, Cell> = {};
    for (const ch of challenges) {
      const keys = ch.items.map((it) => `${ch.id}/${it.itemId}`);
      // item → sample → execution, per bundle of this challenge
      let chosen: { bundle: VerifiedBundle; items: Map<string, Map<string, Counted>> } | undefined;
      for (const b of bundles) {
        if (b.header.challenge !== ch.id) continue;
        const items = new Map<string, Map<string, Counted>>();
        for (const x of scoredOf.get(b.digest) ?? [])
          items.set(
            x.execution.item,
            (items.get(x.execution.item) ?? new Map()).set(String(x.execution.sample), counted(x)),
          );
        // Complete: every item, each with samples 0..n-1 and no gap. The header
        // does not record the requested sample count (--items lets it differ
        // per item), so a missing trailing sample cannot be told apart.
        const complete = keys.every((k) => {
          const s = items.get(k);
          return s !== undefined && [...s.keys()].every((n) => Number(n) < s.size);
        });
        if (!complete) continue;
        if (chosen === undefined || later(b, chosen.bundle)) chosen = { bundle: b, items };
      }
      cells[ch.id] = buildCell(
        ch,
        keys.map((k) => chosen?.items.get(k) ?? new Map()),
        "not_run",
      );
    }
    hardware[header.env.hardwareId] = header.env.hardware;
    rows.push({
      rowId,
      hardwareId: header.env.hardwareId,
      configHash: header.configDigest,
      configId: header.configId,
      artifact: header.config.artifact,
      runtime: header.config.runtime,
      quant: header.config.quant ?? null,
      temperature: header.config.temperature,
      variantFields: {
        ...header.config,
        ...header.config.sampling,
        chatTemplate: header.env.chatTemplate,
        weights: header.config.weightsDigest?.slice(0, 12) ?? "unknown",
      },
      cells,
      submitters: (sources) => [
        ...new Set(
          bundles.filter((b) => sources.has(b.digest)).map((b) => b.header.run.contributor),
        ),
      ],
    });
  }
  return assembleRows({
    dataset,
    challengeSet: challenges.map(legacySetChallenge),
    hardware,
    rows,
    modelKeys,
  });
};

/** The sandbox runners and scoring rules versions of the scorer blobs that graded `scored`. */
export const gradersOf = (scored: ReadonlyArray<ScoredExecution>, release: Release) =>
  Effect.gen(function* () {
    const runners = new Set<string>();
    const rules = new Set<number>();
    for (const digest of new Set(scored.map((s) => s.record.scorer))) {
      const blob = yield* scorerBlobOf(release, digest);
      if (blob.runner !== undefined) runners.add(blob.runner);
      rules.add(blob.rules);
    }
    return { runners: [...runners], rules: [...rules] };
  });

const scorerBlobOf = (release: Release, digest: string) => {
  const where = `${release.dir}/blobs/${digest}`;
  const bytes = release.blobs.get(digest);
  return bytes === undefined
    ? fail(where, "no such scorer blob")
    : Schema.decodeUnknown(ScorerBlob)(bytes).pipe(
        Effect.mapError((e) => new SnapshotInvalid({ path: where, detail: e.message })),
      );
};

/**
 * Write `details/<bundleDigest>.json` for every listed bundle whose digest
 * `done` lacks: the legacy detail JSON over the bundle's executions, prompt
 * text from the release's prompt blob, scorer from the grading scorer blob.
 */
export const writeV4Details = (
  dir: string,
  done: Set<string>,
  scored: ReadonlyArray<ScoredExecution>,
  release: Release,
  challenges: ReadonlyArray<ResolvedChallenge>,
  familyOf: FamilyOf,
): Effect.Effect<
  { written: number; skipped: number },
  SnapshotInvalid | FileIOError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const byBundle = new Map<string, ScoredExecution[]>();
    for (const s of scored)
      byBundle.set(s.bundle.digest, [...(byBundle.get(s.bundle.digest) ?? []), s]);
    let written = 0;
    for (const [digest, execs] of byBundle) {
      if (done.has(digest)) continue;
      done.add(digest);
      const { header } = (execs[0] as ScoredExecution).bundle;
      const items = [];
      for (const { execution: e, record } of execs) {
        const promptDigest = release.file.items[e.item]?.prompt ?? "";
        const promptText = release.blobs.get(promptDigest);
        if (promptText === undefined) {
          return yield* fail(
            `${release.dir}/blobs/${promptDigest}`,
            `no prompt blob for ${e.item}`,
          );
        }
        const itemId = e.item.slice(header.challenge.length + 1);
        const resolved = challenges
          .find((c) => c.id === header.challenge)
          ?.items.find((i) => i.itemId === itemId);
        const item: DetailLine = {
          itemId,
          promptName: itemId,
          ...(resolved?.parentItemId === undefined ? {} : { parentItemId: resolved.parentItemId }),
          ...(resolved?.turn === undefined ? {} : { turn: resolved.turn }),
          output: e.output,
          reasoning: e.reasoning,
          score: record.score,
          error: e.error,
          ...(record.breakdown === null ? {} : { breakdown: record.breakdown }),
          ...e.measured,
        };
        items.push({
          item,
          promptText,
          scorer: (yield* scorerBlobOf(release, record.scorer)).config,
        });
      }
      const payload = detailPayload(
        {
          manifest: {
            attemptId: digest,
            configId: header.configId,
            configHash: header.configDigest,
            artifact: header.config.artifact,
            challengeId: header.challenge,
            challengeVersion: challenges.find((c) => c.id === header.challenge)?.version ?? 0,
          },
          systemPromptText: header.config.systemPrompt,
          items,
        },
        familyOf,
      );
      yield* writeDetailFile(dir, digest, payload);
      written++;
    }
    return { written, skipped: 0 };
  });
