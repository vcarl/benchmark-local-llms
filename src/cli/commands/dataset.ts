/**
 * `dataset` subcommand: edits dataset manifests (`datasets/<name>.yaml`).
 * `dataset add <name> <bundle…>` appends sealed bundles to a v4 manifest.
 */
import path from "node:path";
import { Args, Command, Options } from "@effect/cli";
import { FileSystem } from "@effect/platform";
import { Effect, Option } from "effect";
import {
  addBundles,
  isLegacyManifest,
  readManifest,
  writeManifest,
} from "../../dataset/manifest.js";
import { ConfigError } from "../../errors/index.js";
import { makeLoggerLayer } from "../logger.js";

const DIGEST = /^[0-9a-f]{64}$/;

/** `configId · challenge` from a bundle file's header line, when the file is there and has both. */
const headerComment = (file: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* fs.readFileString(file).pipe(Effect.option);
    if (Option.isNone(text)) return undefined;
    const header = yield* Effect.try(
      () => JSON.parse(text.value.split("\n", 1)[0] ?? "") as Record<string, unknown>,
    ).pipe(Effect.option);
    if (Option.isNone(header)) return undefined;
    const { configId, challenge } = header.value;
    return typeof configId === "string" && typeof challenge === "string"
      ? `${configId} · ${challenge}`
      : undefined;
  });

/**
 * Append bundles to the v4 manifest `<datasetsDir>/<name>.yaml`. Each bundle
 * is a 64-hex digest (its file looked up in `<store>/bundles/`) or a path to a
 * sealed `<digest>.jsonl`.
 */
export const datasetAdd = (args: {
  readonly datasetsDir: string;
  readonly store: string;
  readonly name: string;
  readonly bundles: ReadonlyArray<string>;
}) =>
  Effect.gen(function* () {
    const file = path.join(args.datasetsDir, `${args.name}.yaml`);
    const { manifest, comments } = yield* readManifest(file);
    if (isLegacyManifest(manifest))
      return yield* Effect.fail(
        new ConfigError({ path: file, message: "a legacy dataset lists no bundles" }),
      );
    const digests: string[] = [];
    const added: Record<string, string> = {};
    for (const arg of args.bundles) {
      const base = path.basename(arg, ".jsonl");
      const isDigest = DIGEST.test(arg);
      if (!isDigest && !(arg.endsWith(".jsonl") && DIGEST.test(base)))
        return yield* Effect.fail(
          new ConfigError({ path: arg, message: "not a bundle digest or <digest>.jsonl path" }),
        );
      const digest = isDigest ? arg : base;
      digests.push(digest);
      const comment = yield* headerComment(
        isDigest ? path.join(args.store, "bundles", `${arg}.jsonl`) : arg,
      );
      if (comment !== undefined) added[digest] = comment;
    }
    const next = addBundles(manifest, digests);
    yield* writeManifest(file, next, { ...added, ...comments });
    return next.bundles.length - manifest.bundles.length;
  });

const name = Args.text({ name: "name" }).pipe(Args.withDescription("Dataset name"));
const bundles = Args.text({ name: "bundle" }).pipe(
  Args.withDescription("Bundle digest, or path to a sealed <digest>.jsonl"),
  Args.atLeast(1),
);
const datasetsDir = Options.directory("datasets-dir").pipe(
  Options.withDescription("Directory of dataset manifests"),
  Options.withDefault("datasets"),
);
const store = Options.directory("store").pipe(
  Options.withDescription("Store whose bundles/ the bundle comments are read from"),
  Options.withDefault("store"),
);

const add = Command.make("add", { name, bundles, datasetsDir, store }, (args) =>
  datasetAdd(args).pipe(
    Effect.flatMap((n) => Effect.logInfo(`dataset ${args.name}: added ${n} bundle(s)`)),
    Effect.provide(makeLoggerLayer(false)),
  ),
).pipe(
  Command.withDescription(
    "Append bundle digests (with a `# configId · challenge` comment) to a dataset manifest",
  ),
);

export const datasetCommand = Command.make("dataset").pipe(
  Command.withDescription("Edit dataset manifests (datasets/<name>.yaml)"),
  Command.withSubcommands([add]),
);
