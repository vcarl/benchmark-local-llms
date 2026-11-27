/**
 * The report: one immutable snapshot per dataset manifest (D11).
 *
 *   datasets/<name>.yaml → rows (legacy: pinned attempts; v4: bundles + score records)
 *   → <output>/<sha256>.json (stableStringify bytes, never rewritten)
 *   → <output>/details/<id>.json, <output>/index.json
 *
 * A snapshot carries no build timestamp, so the same inputs rebuild the same
 * bytes: the executions the manifest lists, the release, `configs.yaml` and
 * the harness at `inputs.harnessGitSha`. What a reader can check today is the
 * release (`./bench release verify` over the published challenge files and
 * blobs); the snapshot digest is a citation. A full rebuild also needs the
 * execution bundles and archives, which are not yet published.
 */
import path from "node:path";
import { FileSystem, type Path } from "@effect/platform";
import { Effect, Option, Schema } from "effect";
import { listChallengeFiles, loadChallenge, type ResolvedChallenge } from "../config/challenges.js";
import { parseEvalVersion } from "../config/errata.js";
import { stableStringify } from "../config/hashing.js";
import { compareReleases } from "../config/release-order.js";
import { parseYaml } from "../config/yaml.js";
import {
  type DatasetManifest,
  isLegacyManifest,
  type LegacyManifest,
  readManifest,
  type V4Manifest,
} from "../dataset/manifest.js";
import { FileIOError, SnapshotInvalid } from "../errors/index.js";
import { detailSources } from "../legacy/aggregate.js";
import { legacySetChallenge } from "../legacy/identity.js";
import { loadLegacyDataset } from "../legacy/pinned.js";
import { legacyRegrader, type Ungraded } from "../legacy/regrade.js";
import { buildRows, type RowsDataset } from "../legacy/rows.js";
import {
  type DetailWriteResult,
  type FamilyOf,
  singletonFamily,
  writeDetails,
} from "../legacy/write-details.js";
import { challengeDrift, loadRelease, type Release } from "../release/release.js";
import type { AttemptManifest, ItemResult } from "../schema/attempt.js";
import { digestOf, sha256Hex } from "../store/digest.js";
import { modelKeyOverrides } from "./model-key.js";
import { gradersOf, scoredExecutions, v4RowsOf, writeV4Details } from "./v4-rows.js";

export interface ReportOptions {
  /** Directory of dataset manifests (`<name>.yaml`); one snapshot each. */
  readonly datasetsDir: string;
  /** Store holding `bundles/` and `scores/` (v4 datasets). */
  readonly store: string;
  /** Directory holding `<release>/{release.json, errata.yaml, challenges/, blobs/}`. */
  readonly releasesDir: string;
  /** Directory the legacy manifests' archive basenames are read under. */
  readonly legacyRoot: string;
  /** Snapshot directory: `index.json`, `<digest>.json`, `details/`. */
  readonly output: string;
  /** `configs.yaml` whose `modelKey` overrides apply (missing = none). */
  readonly configsPath: string;
  /** Full `git rev-parse HEAD` of the harness building the snapshots. */
  readonly harnessGitSha: string;
  /** The harness has tracked changes the snapshot's rows can depend on (`./bench report --allow-dirty`). */
  readonly harnessDirty?: boolean;
}

/** A snapshot file's content (D11). */
export interface Snapshot extends RowsDataset {
  readonly schemaVersion: 4;
  /** The release's `release.json` without its items: label, dates, commitment. */
  readonly releaseFile: Omit<Release["file"], "items">;
  readonly inputs: {
    /** SHA-256 of the manifest file's bytes. */
    readonly manifest: string;
    /** SHA-256 of the release's `release.json` bytes. */
    readonly release: string;
    /** SHA-256 of `configs.yaml` (its `modelKey` overrides group rows); null when absent. */
    readonly configs: string | null;
    /** Sorted distinct sandbox runners of the scorer blobs whose score records graded the rows. */
    readonly runners: ReadonlyArray<string>;
    /**
     * Sorted distinct scoring rules versions that graded the counted executions:
     * each score record's scorer blob's, and 1 for a legacy line that keeps its
     * stored score (alpha). The scorer digests are `release.json`'s at the eval version.
     */
    readonly scoringRules: ReadonlyArray<number>;
    /** The harness commit; suffixed `-dirty` when `harnessDirty`. */
    readonly harnessGitSha: string;
    /** Built from a tree with tracked changes, so `harnessGitSha` does not reproduce it. */
    readonly harnessDirty: boolean;
  };
}

/** A built snapshot and the writer of its detail files. */
export interface BuiltSnapshot {
  readonly manifest: DatasetManifest;
  readonly snapshot: Snapshot;
  /** Write the detail files whose id `done` lacks into `dir`, adding each written id to `done`. */
  readonly writeDetails: (
    dir: string,
    done: Set<string>,
  ) => Effect.Effect<DetailWriteResult, unknown, FileSystem.FileSystem | Path.Path>;
}

export const IndexEntry = Schema.Struct({
  dataset: Schema.String,
  title: Schema.String,
  release: Schema.String,
  evalVersion: Schema.NullOr(Schema.String),
  ranked: Schema.Boolean,
  legacy: Schema.Boolean,
  digest: Schema.String,
  rows: Schema.Number,
  challenges: Schema.Number,
  span: Schema.NullOr(Schema.String),
});
export type IndexEntry = typeof IndexEntry.Type;
const IndexFile = Schema.Struct({ snapshots: Schema.Array(IndexEntry) });

export interface ReportSummary {
  readonly snapshots: ReadonlyArray<{
    readonly entry: IndexEntry;
    /** False when the identical snapshot file was already in the output. */
    readonly written: boolean;
  }>;
  readonly detailsWritten: number;
  readonly detailsSkipped: number;
  /** Detail files removed because no indexed snapshot references them. */
  readonly detailsPruned: number;
  /** Index entries kept from earlier builds. */
  readonly kept: number;
}

const io =
  (p: string, operation: string) =>
  (cause: unknown): FileIOError =>
    new FileIOError({ path: p, operation, cause });

/** Why a challenge file or directory did not load, for an error naming it. */
const loadFailure =
  (p: string) =>
  (e: { readonly _tag: string }): SnapshotInvalid =>
    new SnapshotInvalid({
      path: p,
      detail: `does not load (${e._tag}${"message" in e && e.message !== "" ? `: ${String(e.message)}` : ""})`,
    });

/**
 * The challenge set (a release's challenge YAML) and item families read from
 * it. A file or directory that does not load fails the build, naming it.
 */
const loadChallengeSet = (
  challengesDir: string,
): Effect.Effect<
  { challenges: ResolvedChallenge[]; familyOf: FamilyOf },
  SnapshotInvalid,
  FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const byItem = new Map<string, { family: string }>();
    const challenges: ResolvedChallenge[] = [];
    const files = yield* listChallengeFiles(challengesDir).pipe(
      Effect.mapError(loadFailure(challengesDir)),
    );
    for (const f of files) {
      const c = yield* loadChallenge(f.path).pipe(Effect.mapError(loadFailure(f.path)));
      challenges.push(c);
      for (const i of c.items) byItem.set(`${c.id}/${i.itemId}`, i);
    }
    return {
      challenges,
      familyOf: (challengeId, item) =>
        byItem.get(`${challengeId}/${item.promptName}`)?.family ??
        singletonFamily(challengeId, item),
    };
  });

/**
 * `artifact → modelKey` from a `configs.yaml` and the file's SHA-256; a
 * missing file gives none (digest null), an unparseable one fails.
 */
const loadModelKeys = (configsPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const bytes = yield* fs.readFile(configsPath).pipe(Effect.option);
    if (Option.isNone(bytes)) return { modelKeys: new Map<string, string>(), digest: null };
    const parsed = yield* parseYaml(configsPath, new TextDecoder().decode(bytes.value)).pipe(
      Effect.mapError(loadFailure(configsPath)),
    );
    return { modelKeys: modelKeyOverrides(parsed), digest: sha256Hex(bytes.value) };
  });

const sha256Of = (file: string) =>
  Effect.flatMap(FileSystem.FileSystem, (fs) =>
    fs.readFile(file).pipe(Effect.map(sha256Hex), Effect.mapError(io(file, "read"))),
  );

/** The release's errata up to `version` (a draft: none), public fields only. */
const errataAt = (release: Release, version: string | null) =>
  release.errata
    .slice(0, version === null ? 0 : (parseEvalVersion(version)?.n ?? 0))
    .map(({ notes: _, scorers: __, ...publicFields }) => publicFields);

/** Rows of a legacy dataset: its pinned attempts against the release's challenge set. */
const legacyRows = (
  manifest: LegacyManifest,
  release: Release,
  { challenges, familyOf }: ChallengeSet,
  opts: ReportOptions,
  modelKeys: ReadonlyMap<string, string>,
) =>
  Effect.gen(function* () {
    const { attempts, readBlob } = yield* loadLegacyDataset(manifest, opts.legacyRoot);
    const regrader = yield* legacyRegrader(opts.store, release, manifest.evalVersion, challenges);
    const setChallenges = challenges.map(legacySetChallenge);
    const rows = buildRows({
      attempts,
      challengeSet: setChallenges,
      dataset: {
        label: manifest.name,
        title: manifest.title,
        archiveDir: Object.keys(manifest.legacy.archives)[0] ?? "",
        challengesDir: "challenges",
        release: manifest.release,
        version: manifest.evalVersion,
        errata: errataAt(release, manifest.evalVersion),
        ranked: manifest.ranked,
        legacy: true,
      },
      legacyHardware: manifest.legacy.hardware,
      modelKeys,
      grade: regrader.grade,
    });
    const items = new Map(
      setChallenges.flatMap((c) => c.items.map((i) => [`${c.id}/${i.itemId}`, i] as const)),
    );
    // A detail line shows its current-scorer grade when the log holds one.
    const regrade = (m: AttemptManifest, line: ItemResult) => {
      const it = items.get(`${m.challengeId}/${line.itemId}`);
      if (it === undefined || it.promptHash !== line.promptHash) return undefined;
      const r = regrader.lookup(line, m.configHash, m.challengeId, it.scorerHash);
      const scorer = regrader.configOf(m.challengeId, line.itemId);
      return r === undefined || "line" in r || scorer === undefined
        ? undefined
        : { score: r.score, scorer };
    };
    const byPath = new Map(attempts.map((a) => [a.sourcePath, a]));
    const writer = (dir: string, done: Set<string>) => {
      const sources = detailSources(attempts)
        .detailSources.filter((s) => !done.has(s.attemptId))
        .map((s) => ({ ...s, attempt: byPath.get(s.sourcePath) }))
        .flatMap(({ attempt, ...s }) => (attempt === undefined ? [] : [{ ...s, attempt }]));
      for (const s of sources) done.add(s.attemptId);
      return writeDetails(dir, sources, readBlob, familyOf, regrade);
    };
    return {
      rows,
      runners: [...regrader.runners],
      rules: [...regrader.rules],
      ungraded: [...regrader.missing.values()],
      writeDetails: writer,
    };
  });

/** Rows of a v4 dataset at `evalVersion`: its bundles, graded by our score records. */
const v4Rows = (
  manifest: V4Manifest,
  release: Release,
  { challenges, familyOf }: ChallengeSet,
  opts: ReportOptions,
  modelKeys: ReadonlyMap<string, string>,
) =>
  Effect.gen(function* () {
    const { evalVersion } = manifest;
    const { scored, stale } = yield* scoredExecutions(manifest, release, opts.store, evalVersion);
    const rows = v4RowsOf(
      { scored, stale },
      challenges,
      {
        label: manifest.name,
        title: manifest.title,
        archiveDir: "store",
        challengesDir: "challenges",
        release: manifest.release,
        version: evalVersion,
        errata: errataAt(release, evalVersion),
        ranked: manifest.ranked,
        legacy: false,
      },
      modelKeys,
    );
    return {
      rows,
      ...(yield* gradersOf(scored, release)),
      writeDetails: (dir: string, done: Set<string>) =>
        writeV4Details(dir, done, scored, release, challenges, familyOf),
    };
  });

type ChallengeSet = Effect.Effect.Success<ReturnType<typeof loadChallengeSet>>;

/**
 * The release's challenge set, checked against its `release.json` (prompt and
 * scorer digests per item, as `./bench release verify` checks them): drift
 * fails the build, naming the items.
 */
const checkedChallengeSet = (release: Release) =>
  Effect.gen(function* () {
    const set = yield* loadChallengeSet(path.join(release.dir, "challenges"));
    const drift = challengeDrift(release, set.challenges);
    if (drift.length > 0)
      return yield* Effect.fail(
        new SnapshotInvalid({
          path: path.join(release.dir, "release.json"),
          detail: `challenges drift from release.json:\n  ${drift.join("\n  ")}`,
        }),
      );
    return set;
  });

/** Build one dataset's snapshot in memory. */
export const buildSnapshot = (manifestPath: string, opts: ReportOptions) =>
  Effect.gen(function* () {
    const { manifest } = yield* readManifest(manifestPath);
    const releaseDir = path.join(opts.releasesDir, manifest.release);
    const release = yield* loadRelease(releaseDir);
    const set = yield* checkedChallengeSet(release);
    const configs = yield* loadModelKeys(opts.configsPath);
    const built = isLegacyManifest(manifest)
      ? yield* legacyRows(manifest, release, set, opts, configs.modelKeys)
      : yield* v4Rows(manifest, release, set, opts, configs.modelKeys);
    const ungraded = "ungraded" in built ? built.ungraded : [];
    if (ungraded.length > 0) {
      return yield* Effect.fail(
        new SnapshotInvalid({
          path: manifestPath,
          detail: `${ungraded.length} legacy execution(s) graded under an earlier scorer have no score record under the current one; run ./bench score --dataset ${manifest.name}`,
        }),
      );
    }
    // A closed release's dataset is archival: its manifest pins its rows, so no harness change moves them silently.
    if (manifest.rowsDigest !== undefined && digestOf(built.rows.rows) !== manifest.rowsDigest) {
      return yield* Effect.fail(
        new SnapshotInvalid({
          path: manifestPath,
          detail: `rows digest ${digestOf(built.rows.rows)} differs from the pinned ${manifest.rowsDigest}: this build would change the archival dataset's rows`,
        }),
      );
    }
    const { items: _, ...releaseFile } = release.file;
    const snapshot: Snapshot = {
      schemaVersion: 4,
      releaseFile,
      ...built.rows,
      inputs: {
        manifest: yield* sha256Of(manifestPath),
        release: yield* sha256Of(path.join(releaseDir, "release.json")),
        configs: configs.digest,
        runners: [...new Set(built.runners)].sort(),
        scoringRules: [...new Set(built.rules)].sort((a, b) => a - b),
        harnessGitSha: opts.harnessDirty ? `${opts.harnessGitSha}-dirty` : opts.harnessGitSha,
        harnessDirty: opts.harnessDirty === true,
      },
    };
    return { manifest, snapshot, writeDetails: built.writeDetails } satisfies BuiltSnapshot;
  });

/**
 * A legacy dataset's counted lines graded under an earlier scorer that the
 * score log holds no current-scorer record for (`./bench score` grades them).
 */
export const legacyUngraded = (manifestPath: string, opts: ReportOptions) =>
  Effect.gen(function* () {
    const { manifest } = yield* readManifest(manifestPath);
    if (!isLegacyManifest(manifest)) return [] as Ungraded[];
    const release = yield* loadRelease(path.join(opts.releasesDir, manifest.release));
    const set = yield* checkedChallengeSet(release);
    return (yield* legacyRows(manifest, release, set, opts, new Map())).ungraded;
  });

/** Earliest cell `executedFrom` – latest `executedTo`, as dates; null when no cell has either. */
export const executionSpan = (d: RowsDataset): string | null => {
  const from = d.rows.flatMap((r) => Object.values(r.cells).flatMap((c) => c.executedFrom ?? []));
  const to = d.rows.flatMap((r) => Object.values(r.cells).flatMap((c) => c.executedTo ?? []));
  if (from.length === 0 && to.length === 0) return null;
  const pick = (xs: string[], sign: 1 | -1) =>
    xs.sort((a, b) => sign * (Date.parse(a) - Date.parse(b)))[0]?.slice(0, 10) ?? "?";
  return `${pick(from, 1)} – ${pick(to, -1)}`;
};

/** A snapshot's bytes, digest and index entry. */
export const snapshotFile = (s: Snapshot) => {
  const bytes = stableStringify(s);
  const digest = sha256Hex(bytes);
  const entry: IndexEntry = {
    dataset: s.dataset.label,
    title: s.dataset.title,
    release: s.dataset.release ?? "",
    evalVersion: s.dataset.version,
    ranked: s.dataset.ranked,
    legacy: s.dataset.legacy,
    digest,
    rows: s.rows.length,
    challenges: s.challengeSet.length,
    span: executionSpan(s),
  };
  return { bytes, digest, entry };
};

const group = (e: IndexEntry) =>
  e.release === "draft" ? 3 : e.legacy ? (e.release === "0" ? 0 : 1) : 2;
const evalN = (e: IndexEntry) =>
  e.evalVersion === null ? -1 : (parseEvalVersion(e.evalVersion)?.n ?? -1);

/**
 * Index order: alpha, other legacy, releases newest first, drafts last;
 * within a dataset the newest eval version first, then this build's
 * snapshot (`fresh`) before earlier ones, then by digest.
 */
export const orderIndex = (
  entries: ReadonlyArray<IndexEntry>,
  fresh: ReadonlySet<string>,
): IndexEntry[] =>
  [...entries].sort(
    (a, b) =>
      group(a) - group(b) ||
      compareReleases(b.release, a.release) ||
      a.dataset.localeCompare(b.dataset) ||
      evalN(b) - evalN(a) ||
      Number(fresh.has(b.digest)) - Number(fresh.has(a.digest)) ||
      a.digest.localeCompare(b.digest),
  );

/** Every manifest under `datasetsDir`, by file name. */
const manifestPaths = (datasetsDir: string) =>
  Effect.flatMap(FileSystem.FileSystem, (fs) =>
    fs.readDirectory(datasetsDir).pipe(
      Effect.mapError(io(datasetsDir, "list")),
      Effect.map((names) =>
        names
          .filter((n) => n.endsWith(".yaml"))
          .sort()
          .map((n) => path.join(datasetsDir, n)),
      ),
    ),
  );

/** The part of a snapshot that names its detail files. */
const SnapshotRefs = Schema.Struct({
  rows: Schema.Array(
    Schema.Struct({
      cells: Schema.Record({
        key: Schema.String,
        value: Schema.Struct({ sourceAttempts: Schema.Array(Schema.String) }),
      }),
    }),
  ),
});

/**
 * Build every dataset's snapshot and write it, its detail files and the
 * index, then remove detail files that no indexed snapshot references. An existing `<digest>.json` must hold the same bytes (a snapshot is
 * never rewritten); earlier index entries whose file is still present stay unless this build has a snapshot of the same dataset and eval version, which replaces them and removes their files.
 */
export const runReport = (opts: ReportOptions) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const built: BuiltSnapshot[] = [];
    for (const p of yield* manifestPaths(opts.datasetsDir))
      built.push(yield* buildSnapshot(p, opts));
    const files = new Map(
      built.map((b) => {
        const f = { ...b, ...snapshotFile(b.snapshot) };
        return [f.digest, f] as const;
      }),
    );

    // Entries kept from earlier builds: only those whose file still holds the bytes of its digest.
    const indexPath = path.join(opts.output, "index.json");
    const priorSrc = (yield* fs.exists(indexPath).pipe(Effect.mapError(io(indexPath, "stat"))))
      ? yield* fs.readFileString(indexPath).pipe(Effect.mapError(io(indexPath, "read")))
      : '{"snapshots":[]}';
    const prior = yield* Schema.decodeUnknown(Schema.parseJson(IndexFile))(priorSrc).pipe(
      Effect.mapError((e) => new SnapshotInvalid({ path: indexPath, detail: e.message })),
    );
    // One snapshot per (dataset, eval version): this build's, else the first prior one in index order; a replaced one's file is removed.
    const slot = (e: IndexEntry) => `${e.dataset}\0${e.evalVersion}`;
    const taken = new Set([...files.values()].map((f) => slot(f.entry)));
    const kept: IndexEntry[] = [];
    for (const e of prior.snapshots) {
      if (files.has(e.digest)) continue;
      const file = path.join(opts.output, `${e.digest}.json`);
      const present = yield* fs.exists(file).pipe(Effect.mapError(io(file, "stat")));
      if (taken.has(slot(e))) {
        if (present) yield* fs.remove(file).pipe(Effect.mapError(io(file, "remove")));
        continue;
      }
      if (!present) continue;
      const bytes = yield* fs.readFile(file).pipe(Effect.mapError(io(file, "read")));
      if (sha256Hex(bytes) === e.digest) {
        kept.push(e);
        taken.add(slot(e));
      } else
        yield* Effect.logWarning(
          `report: dropping index entry ${e.digest}: ${file} does not hash to it`,
        );
    }
    const index = orderIndex(
      [...[...files.values()].map((f) => f.entry), ...kept],
      new Set(files.keys()),
    );
    const ordered = index.flatMap((e) => files.get(e.digest) ?? []);

    const detailsDir = path.join(opts.output, "details");
    yield* fs
      .makeDirectory(detailsDir, { recursive: true })
      .pipe(Effect.mapError(io(detailsDir, "mkdir")));
    const snapshots: { entry: IndexEntry; written: boolean }[] = [];
    for (const f of ordered) {
      const file = path.join(opts.output, `${f.digest}.json`);
      const exists = yield* fs.exists(file).pipe(Effect.mapError(io(file, "stat")));
      if (exists) {
        const priorBytes = yield* fs.readFileString(file).pipe(Effect.mapError(io(file, "read")));
        if (priorBytes !== f.bytes) {
          return yield* Effect.fail(
            new SnapshotInvalid({ path: file, detail: "exists with different bytes" }),
          );
        }
      } else yield* fs.writeFileString(file, f.bytes).pipe(Effect.mapError(io(file, "write")));
      snapshots.push({ entry: f.entry, written: !exists });
    }

    // Detail ids are shared across snapshots: the first dataset in index order writes each.
    const done = new Set<string>();
    let detailsWritten = 0;
    let detailsSkipped = 0;
    for (const f of ordered) {
      const r = yield* f.writeDetails(detailsDir, done);
      detailsWritten += r.written;
      detailsSkipped += r.skipped;
    }

    yield* fs
      .writeFileString(indexPath, `${JSON.stringify({ snapshots: index }, null, 2)}\n`)
      .pipe(Effect.mapError(io(indexPath, "write")));

    // A detail file no indexed snapshot references is never fetched: remove it.
    // ponytail: prompt packs are not pruned (a few MB in all); prune them the same way if they grow.
    const referenced = new Set<string>();
    for (const e of index) {
      const file = path.join(opts.output, `${e.digest}.json`);
      const src = yield* fs.readFileString(file).pipe(Effect.mapError(io(file, "read")));
      const refs = yield* Schema.decodeUnknown(Schema.parseJson(SnapshotRefs))(src).pipe(
        Effect.mapError((err) => new SnapshotInvalid({ path: file, detail: err.message })),
      );
      for (const row of refs.rows)
        for (const cell of Object.values(row.cells))
          for (const id of cell.sourceAttempts) referenced.add(id);
    }
    let detailsPruned = 0;
    for (const name of yield* fs
      .readDirectory(detailsDir)
      .pipe(Effect.mapError(io(detailsDir, "list")))) {
      if (!name.endsWith(".json") || referenced.has(name.slice(0, -".json".length))) continue;
      const file = path.join(detailsDir, name);
      yield* fs.remove(file).pipe(Effect.mapError(io(file, "remove")));
      detailsPruned++;
    }

    return {
      snapshots,
      detailsWritten,
      detailsSkipped,
      detailsPruned,
      kept: kept.length,
    } satisfies ReportSummary;
  });
