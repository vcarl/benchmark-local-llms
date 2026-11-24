/**
 * `release` subcommand: `sync <release>` (the draft's release.json + missing
 * blobs from its challenges), `commit <YYYY.N>` (a new release from the draft,
 * with its commitment), `verify <release>` (blobs, coverage, commitment; exits
 * nonzero on any problem). See src/release/release.ts.
 */
import path from "node:path";
import { Args, Command, Options } from "@effect/cli";
import { Effect } from "effect";
import { commitRelease, syncRelease, verifyRelease } from "../../release/release.js";
import { makeLoggerLayer } from "../logger.js";

const releasesDir = Options.directory("releases-dir").pipe(
  Options.withDescription("Directory holding the release directories"),
  Options.withDefault("releases"),
);
const releaseArg = Args.text({ name: "release" }).pipe(
  Args.withDescription("Release name (0, YYYY.N, draft)"),
);

const sync = Command.make("sync", { release: releaseArg, releasesDir }, (args) =>
  syncRelease(path.join(args.releasesDir, args.release)).pipe(
    Effect.flatMap(({ items, blobsWritten }) =>
      Effect.logInfo(`release ${args.release}: ${items} items, ${blobsWritten} blob(s) written`),
    ),
    Effect.provide(makeLoggerLayer(false)),
  ),
).pipe(Command.withDescription("Write release.json and any missing blobs from the challenges"));

const from = Options.directory("from").pipe(
  Options.withDescription("Release directory whose challenges are committed"),
  Options.withDefault("releases/draft"),
);

const commit = Command.make("commit", { release: releaseArg, releasesDir, from }, (args) =>
  commitRelease(args.releasesDir, args.release, args.from).pipe(
    Effect.flatMap(({ commitment, items }) =>
      Effect.logInfo(`release ${args.release}: ${items} items committed; commitment ${commitment}`),
    ),
    Effect.provide(makeLoggerLayer(false)),
  ),
).pipe(Command.withDescription("Create releases/<YYYY.N> from the draft with its commitment"));

const verify = Command.make("verify", { release: releaseArg, releasesDir }, (args) =>
  Effect.gen(function* () {
    const { ok, problems } = yield* verifyRelease(path.join(args.releasesDir, args.release));
    yield* Effect.sync(() => {
      for (const l of ok) console.log(`ok ${l}`);
      for (const l of problems) console.log(`FAILED ${l}`);
      if (problems.length > 0) process.exitCode = 1;
    });
  }),
).pipe(
  Command.withDescription(
    "Re-derive every blob, re-resolve the challenges, apply errata and recompute the commitment",
  ),
);

export const releaseCommand = Command.make("release").pipe(
  Command.withDescription("Sync, commit and verify releases"),
  Command.withSubcommands([sync, commit, verify]),
);
