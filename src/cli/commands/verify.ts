/**
 * `verify` subcommand — check bundle files without writing anything.
 *
 * Runs the verifying reader (`readBundle`: envelope, schemaVersion 4,
 * canonical bytes, digest == file name for a file named by a digest,
 * executions count, no duplicate item × sample, configDigest and hardwareId
 * re-derived) and then release pinning (ingest step 2), and prints one line
 * per bundle: `ok <digest> <path>` (with a warning for a draft release) or
 * `FAILED <path>: <reason>`. Exits nonzero when any bundle fails.
 */
import path from "node:path";
import { Args, Command, Options } from "@effect/cli";
import { Effect, Either } from "effect";
import { loadRelease, type Release, releaseMessagesDigest } from "../../release/release.js";
import { readBundle, type VerifiedBundle } from "../../store/bundle.js";

/**
 * Ingest step 2, release pinning: the release is committed (a draft is
 * accepted for local verification, with a warning); the challenge and every
 * execution's item are in it; every `messagesDigest` equals the digest of the
 * messages built from the release's prompt blob, the header's system prompt
 * and the gold history.
 */
export const releasePinningProblems = (
  bundle: VerifiedBundle,
  release: Release,
): { problems: string[]; warning?: string } => {
  const { header } = bundle;
  const { file } = release;
  if (file.release === "0") return { problems: ["release 0 is closed to new bundles"] };
  if (file.release !== "draft" && file.commitment === undefined) {
    return { problems: [`release ${file.release} is not committed`] };
  }
  const prefix = `${header.challenge}/`;
  if (!Object.keys(file.items).some((k) => k.startsWith(prefix))) {
    return { problems: [`challenge ${header.challenge} is not in release ${file.release}`] };
  }
  const problems: string[] = [];
  for (const e of bundle.executions) {
    const item = e.item.startsWith(prefix) ? file.items[e.item] : undefined;
    const blob = item === undefined ? undefined : release.blobs.get(item.prompt);
    if (item === undefined) {
      problems.push(`${e.item}: not an item of ${header.challenge} in release ${file.release}`);
    } else if (blob === undefined) {
      problems.push(`${e.item}: no prompt blob ${item.prompt}`);
    } else if (
      releaseMessagesDigest(release, e.item, header.config.systemPrompt) !== e.messagesDigest
    ) {
      problems.push(`${e.item} sample ${e.sample}: messagesDigest does not match the release`);
    }
  }
  return file.release === "draft"
    ? { problems, warning: "draft release, pinned for local verification only" }
    : { problems };
};

export const verifyBundles = (files: ReadonlyArray<string>, releasesDir: string) =>
  Effect.gen(function* () {
    const lines: string[] = [];
    const releases = new Map<string, Either.Either<Release, string>>();
    let failed = 0;
    for (const file of files) {
      const r = yield* Effect.either(readBundle(file));
      if (Either.isLeft(r)) {
        failed += 1;
        const reason =
          r.left._tag === "BundleInvalid" ? `${r.left.check}: ${r.left.detail}` : r.left.message;
        lines.push(`FAILED ${file}: ${reason}`);
        continue;
      }
      const name = r.right.header.release;
      let release = releases.get(name);
      if (release === undefined) {
        const loaded = yield* Effect.either(loadRelease(path.join(releasesDir, name)));
        release = Either.mapLeft(loaded, (e) => `release ${name}: ${e.message}`);
        releases.set(name, release);
      }
      const pinned = Either.isRight(release)
        ? releasePinningProblems(r.right, release.right)
        : { problems: [release.left] };
      if (pinned.problems.length === 0) {
        const warning = pinned.warning === undefined ? "" : ` (warning: ${pinned.warning})`;
        lines.push(`ok ${r.right.digest} ${file}${warning}`);
      } else {
        failed += 1;
        lines.push(`FAILED ${file}: ${pinned.problems.join("; ")}`);
      }
    }
    return { lines, failed };
  });

const bundlesArg = Args.file({ name: "bundle" }).pipe(
  Args.atLeast(1),
  Args.withDescription("Bundle file(s) to verify"),
);

const releasesDir = Options.directory("releases-dir").pipe(
  Options.withDescription("Directory holding the release directories"),
  Options.withDefault("releases"),
);

export const verifyCommand = Command.make(
  "verify",
  { bundles: bundlesArg, releasesDir },
  ({ bundles, releasesDir }) =>
    Effect.gen(function* () {
      const { lines, failed } = yield* verifyBundles(bundles, releasesDir);
      yield* Effect.sync(() => {
        for (const l of lines) console.log(l);
        if (failed > 0) process.exitCode = 1;
      });
    }),
).pipe(
  Command.withDescription(
    "Verify bundle files (digests, canonical form, counts, release pinning); writes nothing",
  ),
);
