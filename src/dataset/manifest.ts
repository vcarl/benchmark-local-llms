/**
 * Dataset manifests (`datasets/<name>.yaml`): a dataset is exactly what its
 * manifest lists. A v4 manifest lists sealed bundles by digest; a legacy
 * manifest pins schemaVersion 1–3 attempt files and the content-store blobs
 * they reference by SHA-256 of their bytes (see src/legacy/freeze.ts).
 */
import { FileSystem } from "@effect/platform";
import { Effect, Schema } from "effect";
import * as YAML from "yaml";
import { parseYaml } from "../config/yaml.js";
import { FileIOError } from "../errors/index.js";
import { HardwareProfile } from "../schema/run-manifest.js";

export const Sha256Hex = Schema.String.pipe(Schema.pattern(/^[0-9a-f]{64}$/));

const common = {
  name: Schema.String,
  title: Schema.String,
  release: Schema.String,
  evalVersion: Schema.NullOr(Schema.String),
  /** SHA-256 of the snapshot's `rows` (stableStringify): an archival dataset's pin; a build whose rows differ fails. */
  rowsDigest: Schema.optional(Schema.String),
};

export const V4Manifest = Schema.Struct({
  ...common,
  ranked: Schema.Boolean,
  bundles: Schema.Array(Sha256Hex),
});
export type V4Manifest = typeof V4Manifest.Type;

/** One archive's pins: attempt file name → sha256, and `<kind>/<key>.<ext>` → sha256. */
export const LegacyArchivePins = Schema.Struct({
  attempts: Schema.Record({ key: Schema.String, value: Sha256Hex }),
  blobs: Schema.Record({ key: Schema.String, value: Sha256Hex }),
});
export type LegacyArchivePins = typeof LegacyArchivePins.Type;

export const LegacyBlock = Schema.Struct({
  /** The machine attempts without `env.hardwareId` are attributed to. */
  hardware: Schema.Struct({ id: Schema.String, profile: Schema.optional(HardwareProfile) }),
  /** Archive basename → its pins; the first archive is the dataset's own, later ones are reused. */
  archives: Schema.Record({ key: Schema.String, value: LegacyArchivePins }),
});
export type LegacyBlock = typeof LegacyBlock.Type;

export const LegacyManifest = Schema.Struct({
  ...common,
  ranked: Schema.Boolean,
  legacy: LegacyBlock,
});
export type LegacyManifest = typeof LegacyManifest.Type;

export const DatasetManifest = Schema.Union(V4Manifest, LegacyManifest);
export type DatasetManifest = typeof DatasetManifest.Type;

export const isLegacyManifest = (m: DatasetManifest): m is LegacyManifest => "legacy" in m;

/** Bundle digest → its `configId · challenge` comment. */
export type BundleComments = Readonly<Record<string, string>>;

const sortedRecord = <V>(r: Readonly<Record<string, V>>): Record<string, V> =>
  Object.fromEntries(Object.entries(r).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/** Read and decode a manifest, with the comments on its `bundles` entries. */
export const readManifest = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const source = yield* fs
      .readFileString(path)
      .pipe(
        Effect.mapError((cause) => new FileIOError({ path, operation: "read-manifest", cause })),
      );
    const manifest = yield* parseYaml(path, source).pipe(
      Effect.flatMap(Schema.decodeUnknown(DatasetManifest)),
    );
    const comments: Record<string, string> = {};
    const bundles = YAML.parseDocument(source).get("bundles");
    if (YAML.isSeq(bundles))
      for (const node of bundles.items)
        if (YAML.isScalar(node) && typeof node.value === "string" && node.comment)
          comments[node.value] = node.comment.trim();
    return { manifest, comments };
  });

/**
 * Write a manifest as stable, diff-friendly YAML: top-level keys in schema
 * order, `attempts`/`blobs` keys sorted, archives and bundles in list order,
 * each bundle followed by its comment when `comments` has one.
 */
export const writeManifest = (
  path: string,
  manifest: DatasetManifest,
  comments: BundleComments = {},
) =>
  Effect.gen(function* () {
    const { name, title, release, evalVersion, ranked, rowsDigest } = manifest;
    const body = isLegacyManifest(manifest)
      ? {
          legacy: {
            hardware: manifest.legacy.hardware,
            archives: Object.fromEntries(
              Object.entries(manifest.legacy.archives).map(([k, a]) => [
                k,
                { attempts: sortedRecord(a.attempts), blobs: sortedRecord(a.blobs) },
              ]),
            ),
          },
        }
      : { bundles: manifest.bundles };
    const doc = new YAML.Document({
      name,
      title,
      release,
      evalVersion,
      ranked,
      ...(rowsDigest === undefined ? {} : { rowsDigest }),
      ...body,
    });
    const seq = doc.get("bundles");
    if (YAML.isSeq(seq))
      for (const node of seq.items)
        if (YAML.isScalar(node) && typeof node.value === "string") {
          const c = comments[node.value];
          if (c !== undefined) node.comment = ` ${c}`;
        }
    const fs = yield* FileSystem.FileSystem;
    yield* fs
      .writeFileString(path, doc.toString({ lineWidth: 0 }))
      .pipe(
        Effect.mapError((cause) => new FileIOError({ path, operation: "write-manifest", cause })),
      );
  });

/** Append `digests` not already listed, in the given order. */
export const addBundles = (manifest: V4Manifest, digests: ReadonlyArray<string>): V4Manifest => {
  const bundles = [...manifest.bundles];
  for (const x of digests) if (!bundles.includes(x)) bundles.push(x);
  return { ...manifest, bundles };
};
