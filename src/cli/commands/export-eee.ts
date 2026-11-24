/**
 * `export-eee` subcommand — project one attempt archive onto the Every Eval
 * Ever (EEE) schema: an aggregate JSON plus an instance-level samples JSONL,
 * laid out as `<out>/data/<collection>/<developer>/<model>/<uuid>[_samples].…`.
 * The attempt must be one a legacy dataset manifest lists; its file and blobs
 * are read through that manifest's pins. Local files only; nothing is
 * uploaded. See docs/EEE-EXPORT.md.
 */
import path from "node:path";
import { Args, Command, Options } from "@effect/cli";
import { Effect } from "effect";
import { isLegacyManifest, readManifest } from "../../dataset/manifest.js";
import { ConfigError } from "../../errors/index.js";
import { exportEee } from "../../export/eee/build.js";
import { pinnedBlobReader, readPinned } from "../../legacy/pinned.js";
import { makeLoggerLayer } from "../logger.js";

const attemptArg = Args.text({ name: "attempt" }).pipe(
  Args.withDescription("AttemptId (or its .jsonl file name) of an attempt the dataset lists"),
);

const datasetOpt = Options.text("dataset").pipe(
  Options.withDefault("alpha"),
  Options.withDescription("Legacy dataset whose manifest lists the attempt (default: alpha)"),
);
const datasetsDirOpt = Options.directory("datasets-dir").pipe(
  Options.withDefault("datasets"),
  Options.withDescription("Directory of dataset manifests"),
);
const legacyRootOpt = Options.directory("legacy-root").pipe(
  Options.withDefault("."),
  Options.withDescription("Directory holding the archives the manifest names"),
);

/** The attempt file `name` in the dataset's pins, checked against its pin, and the archive's blob reader. */
export const pinnedAttempt = (manifestPath: string, legacyRoot: string, name: string) =>
  Effect.gen(function* () {
    const { manifest } = yield* readManifest(manifestPath);
    if (!isLegacyManifest(manifest))
      return yield* Effect.fail(
        new ConfigError({ path: manifestPath, message: "not a legacy dataset" }),
      );
    const file = name.endsWith(".jsonl") ? path.basename(name) : `${name}.jsonl`;
    const hit = Object.entries(manifest.legacy.archives).find(([, p]) => p.attempts[file]);
    if (hit === undefined)
      return yield* Effect.fail(
        new ConfigError({ path: manifestPath, message: `${file} is not listed by the dataset` }),
      );
    const [archive, pins] = hit;
    const dir = path.join(legacyRoot, archive);
    yield* readPinned(path.join(dir, file), pins.attempts[file] as string);
    return { file: path.join(dir, file), read: pinnedBlobReader(new Map([[dir, pins.blobs]])) };
  });

const outOpt = Options.text("out").pipe(
  Options.withDefault("eee-export"),
  Options.withDescription("Output root directory (default: eee-export)"),
);

const collectionOpt = Options.text("collection").pipe(
  Options.withDefault("llms-bench"),
  Options.withDescription("Collection folder under data/ (default: llms-bench)"),
);

const relationshipOpt = Options.choice("relationship", [
  "third_party",
  "first_party",
  "collaborative",
  "other",
]).pipe(
  Options.withDefault("third_party" as const),
  Options.withDescription(
    "evaluator_relationship: third_party unless the contributor built the model",
  ),
);

const verboseOpt = Options.boolean("verbose").pipe(
  Options.withAlias("v"),
  Options.withDefault(false),
  Options.withDescription("Enable debug-level log output"),
);

export const exportEeeCommand = Command.make(
  "export-eee",
  {
    attempt: attemptArg,
    dataset: datasetOpt,
    datasetsDir: datasetsDirOpt,
    legacyRoot: legacyRootOpt,
    out: outOpt,
    collection: collectionOpt,
    relationship: relationshipOpt,
    verbose: verboseOpt,
  },
  ({ attempt, dataset, datasetsDir, legacyRoot, out, collection, relationship, verbose }) =>
    Effect.gen(function* () {
      const { file, read } = yield* pinnedAttempt(
        path.join(datasetsDir, `${dataset}.yaml`),
        legacyRoot,
        attempt,
      );
      const res = yield* exportEee(file, out, { relationship, collection }, read);
      yield* Effect.sync(() => {
        console.log(`export-eee: ${res.rows} samples`);
        console.log(res.aggregatePath);
        console.log(res.samplesPath);
      });
    }).pipe(Effect.provide(makeLoggerLayer(verbose))),
).pipe(
  Command.withDescription(
    "Export a legacy attempt as Every Eval Ever (schema 0.3.0) JSON + samples JSONL",
  ),
);
