/**
 * `legacy` subcommand: the schemaVersion 1–3 attempt archives as datasets.
 * `legacy freeze` writes a legacy dataset manifest from an archive, read in place.
 * `legacy convert` turns a legacy manifest's pinned attempts into v4 bundles,
 * converting an execution only when its provenance is proven
 * (src/legacy/convert.ts), and lists the converted bundles in a v4 dataset.
 */
import path from "node:path";
import { Command, Options } from "@effect/cli";
import { FileSystem } from "@effect/platform";
import { Effect, Option } from "effect";
import {
  addBundles,
  isLegacyManifest,
  readManifest,
  writeManifest,
} from "../../dataset/manifest.js";
import { ConfigError, FileIOError } from "../../errors/index.js";
import { convertLegacy } from "../../legacy/convert.js";
import { freezeLegacy } from "../../legacy/freeze.js";
import { hardwareId, probeHardware } from "../../orchestration/hardware.js";
import { makeLoggerLayer } from "../logger.js";

/** `--legacy-hardware` → the machine pre-schemaVersion-3 attempts are attributed to. */
export const resolveLegacyHardware = (value: string) =>
  value === "local"
    ? Effect.map(probeHardware, (profile) => ({ id: hardwareId(profile), profile }))
    : Effect.succeed({ id: value });

/**
 * The machine a freeze attributes pre-schemaVersion-3 attempts to: an explicit
 * `--legacy-hardware`, else the one `manifestPath` already pins (so a re-freeze
 * never re-attributes rows), else this machine.
 */
export const freezeHardware = (option: Option.Option<string>, manifestPath: string) =>
  Effect.gen(function* () {
    if (Option.isSome(option)) return yield* resolveLegacyHardware(option.value);
    const fs = yield* FileSystem.FileSystem;
    if (yield* fs.exists(manifestPath).pipe(Effect.orElseSucceed(() => false))) {
      const { manifest } = yield* readManifest(manifestPath);
      if (isLegacyManifest(manifest)) {
        const { id, profile } = manifest.legacy.hardware;
        return profile === undefined ? { id } : { id, profile };
      }
    }
    return yield* resolveLegacyHardware("local");
  });

const dataset = Options.text("dataset").pipe(Options.withDescription("Dataset name"));
const title = Options.text("title").pipe(Options.withDescription("Dataset display title"));
const release = Options.text("release").pipe(
  Options.withDescription('Release the dataset is scored against ("0" or "draft")'),
);
const evalVersion = Options.text("eval-version").pipe(
  Options.withDescription("Eval version (omit for a draft)"),
  Options.optional,
);
const archive = Options.text("archive").pipe(
  Options.withDescription("Basename of the dataset's archive under --legacy-root"),
);
const reuse = Options.text("reuse").pipe(
  Options.withDescription(
    "Basename of an archive whose attempts of the dataset's rows (config × machine) also count",
  ),
  Options.optional,
);
const challengesDir = Options.directory("challenges-dir").pipe(
  Options.withDescription("Challenge directory whose challenges are the dataset's challenge set"),
);
const legacyRoot = Options.directory("legacy-root").pipe(
  Options.withDescription("Directory holding the archives"),
  Options.withDefault("."),
);
const legacyHardware = Options.text("legacy-hardware").pipe(
  Options.withDescription(
    "Machine for attempts without a hardware profile: 'local' (this machine), 'unknown', or a hardwareId (default: the one the existing manifest pins, else 'local')",
  ),
  Options.optional,
);
const unranked = Options.boolean("unranked").pipe(
  Options.withDescription(
    "Show the dataset without rank numbers or tiers (manifest `ranked: false`)",
  ),
  Options.withDefault(false),
);
const datasetsDir = Options.directory("datasets-dir").pipe(
  Options.withDescription("Directory the manifest is written to"),
  Options.withDefault("datasets"),
);

const freeze = Command.make(
  "freeze",
  {
    dataset,
    title,
    release,
    evalVersion,
    archive,
    reuse,
    challengesDir,
    legacyRoot,
    legacyHardware,
    unranked,
    datasetsDir,
  },
  (args) =>
    Effect.gen(function* () {
      const file = path.join(args.datasetsDir, `${args.dataset}.yaml`);
      const legacy = yield* freezeLegacy({
        archive: path.join(args.legacyRoot, args.archive),
        ...Option.match(args.reuse, {
          onNone: () => ({}),
          onSome: (r) => ({ reuse: path.join(args.legacyRoot, r) }),
        }),
        challengesDir: args.challengesDir,
        legacyHardware: yield* freezeHardware(args.legacyHardware, file),
      });
      const fs = yield* FileSystem.FileSystem;
      yield* fs
        .makeDirectory(args.datasetsDir, { recursive: true })
        .pipe(
          Effect.mapError(
            (cause) => new FileIOError({ path: args.datasetsDir, operation: "mkdir", cause }),
          ),
        );
      yield* writeManifest(file, {
        name: args.dataset,
        title: args.title,
        release: args.release,
        evalVersion: Option.getOrNull(args.evalVersion),
        ranked: !args.unranked,
        legacy,
      });
      for (const [name, pins] of Object.entries(legacy.archives))
        yield* Effect.logInfo(
          `legacy freeze: ${name}: ${Object.keys(pins.attempts).length} attempts, ${Object.keys(pins.blobs).length} blobs`,
        );
      yield* Effect.logInfo(`legacy freeze: wrote ${file}`);
    }).pipe(Effect.provide(makeLoggerLayer(false))),
).pipe(
  Command.withDescription(
    "Write datasets/<name>.yaml pinning the archive's attempts and blobs by SHA-256, read in place; a re-run rewrites the manifest from the archives' current state",
  ),
);

/**
 * Convert `source`'s pinned attempts into `<store>/bundles/` and list the
 * bundles in the v4 dataset `<datasetsDir>/<dataset>.yaml` (created from the
 * source's name fields when absent; a legacy manifest there is refused).
 * Writes the conversion report to `report`.
 */
export const legacyConvert = (args: {
  readonly source: string;
  readonly dataset: string;
  readonly datasetsDir: string;
  readonly legacyRoot: string;
  readonly store: string;
  readonly releasesDir: string;
  readonly templatesDir: string;
  readonly report: string;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const file = path.join(args.datasetsDir, `${args.dataset}.yaml`);
    const existing = (yield* fs.exists(file).pipe(Effect.orElseSucceed(() => false)))
      ? yield* readManifest(file)
      : undefined;
    if (existing !== undefined && isLegacyManifest(existing.manifest))
      return yield* Effect.fail(
        new ConfigError({
          path: file,
          message:
            "a dataset holds one format: move the legacy manifest aside (it is the --source)",
        }),
      );
    const result = yield* convertLegacy(args);
    const { manifest: source } = yield* readManifest(args.source);
    const base = existing?.manifest ?? {
      name: args.dataset,
      title: source.title,
      release: source.release,
      evalVersion: source.evalVersion,
      ranked: source.ranked,
      bundles: [],
    };
    if (isLegacyManifest(base)) return result;
    const comments = Object.fromEntries(result.bundles.map((b) => [b.digest, b.comment]));
    yield* writeManifest(
      file,
      addBundles(
        base,
        result.bundles.map((b) => b.digest),
      ),
      { ...comments, ...existing?.comments },
    );
    yield* fs
      .writeFileString(args.report, `${JSON.stringify(result, null, 2)}\n`)
      .pipe(
        Effect.mapError(
          (cause) => new FileIOError({ path: args.report, operation: "write", cause }),
        ),
      );
    return result;
  });

const convert = Command.make(
  "convert",
  {
    source: Options.file("source").pipe(
      Options.withDescription("Legacy dataset manifest whose pinned attempts are converted"),
    ),
    dataset: Options.text("dataset").pipe(
      Options.withDescription("v4 dataset the converted bundles are listed in"),
    ),
    datasetsDir,
    legacyRoot,
    store: Options.directory("store").pipe(
      Options.withDescription("Store the bundles are written into"),
      Options.withDefault("store"),
    ),
    releasesDir: Options.directory("releases-dir").pipe(
      Options.withDescription("Directory holding the release directories"),
      Options.withDefault("releases"),
    ),
    templatesDir: Options.directory("templates-dir").pipe(
      Options.withDescription("Directory of the vendored chat templates"),
      Options.withDefault("templates"),
    ),
    report: Options.file("report").pipe(
      Options.withDescription("Where the conversion report (JSON) is written"),
      Options.withDefault("store/convert-report.json"),
    ),
  },
  (args) =>
    Effect.gen(function* () {
      const r = yield* legacyConvert(args);
      const lines = r.unconverted.reduce((s, u) => s + u.lines, 0);
      yield* Effect.logInfo(
        `legacy convert: ${r.executions} executions in ${r.bundles.length} bundles; ${lines} lines over ${r.unconverted.length} (config, challenge, item) unconverted; ${Object.keys(r.needsRerun).length} config(s) need a rerun; report ${args.report}`,
      );
    }).pipe(Effect.provide(makeLoggerLayer(false))),
).pipe(
  Command.withDescription(
    "Convert a legacy dataset's pinned attempts into v4 bundles where provenance is proven, and list them in a v4 dataset",
  ),
);

export const legacyCommand = Command.make("legacy").pipe(
  Command.withDescription("Legacy (schemaVersion 1–3) archives as datasets"),
  Command.withSubcommands([freeze, convert]),
);
