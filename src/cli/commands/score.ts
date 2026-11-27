/**
 * `score` subcommand: `score --dataset <name>` computes the score records the
 * dataset's eval version needs and the score log lacks, and appends them to
 * `<store>/scores/<bundleDigest>.jsonl`. Each execution is graded by the
 * scorer blob the release puts in effect at that eval version (a draft:
 * `release.json`'s). An execution whose prompt is not the release's current
 * one is stale (src/report/v4-rows.ts) and is not graded. For a legacy dataset it grades the counted archive lines
 * whose recorded scorer is not their item's current one, into
 * `<store>/scores/legacy.jsonl` (src/legacy/regrade.ts). Nothing is rewritten.
 */
import path from "node:path";
import { Command, Options } from "@effect/cli";
import type { CommandExecutor, FileSystem, Path } from "@effect/platform";
import { Clock, Effect, Schema } from "effect";
import { stableStringify } from "../../config/hashing.js";
import { isLegacyManifest, readManifest } from "../../dataset/manifest.js";
import { ConfigError } from "../../errors/index.js";
import { LEGACY_SCORE_LOG } from "../../legacy/regrade.js";
import { gitSha } from "../../orchestration/run-loop.js";
import { loadRelease, scorerDigestAt } from "../../release/release.js";
import { legacyUngraded } from "../../report/index.js";
import { isCurrent } from "../../report/v4-rows.js";
import type { ScorerConfig } from "../../schema/scorer.js";
import {
  SCORING_RULES,
  ScorerBlob,
  scoreFields,
  scoreRecord,
  scorerDigest,
} from "../../scoring/rules.js";
import { bundlePath, readBundle } from "../../store/bundle.js";
import { digestOf } from "../../store/digest.js";
import { appendScores, readScores } from "../../store/scores.js";
import { makeLoggerLayer } from "../logger.js";

/** Grade a legacy dataset's counted lines that lack a current-scorer record. */
const scoreLegacy = (
  file: string,
  args: {
    store: string;
    datasetsDir: string;
    releasesDir: string;
    legacyRoot: string;
    harnessGitSha: string;
  },
) =>
  Effect.gen(function* () {
    const ungraded = yield* legacyUngraded(file, {
      ...args,
      output: "",
      configsPath: "",
    });
    for (const u of ungraded)
      if (scorerDigest(u.scorer.config) !== u.scorer.digest)
        return yield* Effect.fail(
          new ConfigError({
            path: file,
            message: `${u.challengeId}/${u.line.itemId}: blob ${u.scorer.digest} re-hashes to ${scorerDigest(u.scorer.config)}`,
          }),
        );
    // Code scorers run in throwaway sandbox containers; grade several at once.
    const records = yield* Effect.forEach(
      ungraded,
      (u) =>
        Effect.gen(function* () {
          const fields = yield* scoreFields(
            {
              item: `${u.challengeId}/${u.line.promptName}`,
              output: u.line.output,
              reasoning: u.line.reasoning,
              error: u.line.error,
              stopReason: u.line.stopReason ?? null,
            },
            u.scorer.config,
          );
          const scoredAt = new Date(yield* Clock.currentTimeMillis).toISOString();
          return {
            execution: u.execution,
            scorer: u.scorer.digest,
            ...fields,
            harnessGitSha: args.harnessGitSha,
            scoredAt,
          };
        }),
      { concurrency: 8 },
    );
    yield* appendScores(args.store, LEGACY_SCORE_LOG, records);
    return { bundles: 0, appended: records.length, present: 0 };
  });

export const scoreDataset = (args: {
  readonly name: string;
  readonly datasetsDir: string;
  readonly store: string;
  readonly releasesDir: string;
  readonly legacyRoot?: string;
  readonly harnessGitSha: string;
}) =>
  Effect.gen(function* () {
    const file = path.join(args.datasetsDir, `${args.name}.yaml`);
    const { manifest } = yield* readManifest(file);
    const fail = (p: string, message: string) => Effect.fail(new ConfigError({ path: p, message }));
    if (isLegacyManifest(manifest))
      return yield* scoreLegacy(file, { ...args, legacyRoot: args.legacyRoot ?? "." });
    const release = yield* loadRelease(path.join(args.releasesDir, manifest.release));
    const configs = new Map<string, ScorerConfig>();
    const configOf = (digest: string) =>
      Effect.gen(function* () {
        const cached = configs.get(digest);
        if (cached !== undefined) return cached;
        const where = `${release.dir}/blobs/${digest}`;
        const bytes = release.blobs.get(digest);
        if (bytes === undefined) return yield* fail(where, "no such scorer blob");
        const blob = yield* Schema.decodeUnknown(ScorerBlob)(bytes).pipe(
          Effect.mapError((e) => new ConfigError({ path: where, message: e.message })),
        );
        if (blob.rules !== SCORING_RULES) {
          return yield* fail(
            where,
            `scoring rules ${blob.rules}; this harness runs ${SCORING_RULES}`,
          );
        }
        configs.set(digest, blob.config);
        return blob.config;
      });

    let appended = 0;
    let present = 0;
    for (const digest of manifest.bundles) {
      const bundle = yield* readBundle(bundlePath(args.store, digest));
      if (bundle.header.release !== manifest.release) {
        return yield* fail(
          bundle.path,
          `release ${bundle.header.release}, dataset ${manifest.release}`,
        );
      }
      const have = new Set(
        (yield* readScores(args.store, digest)).map((r) =>
          stableStringify([r.execution, r.scorer]),
        ),
      );
      const todo = [];
      for (const e of bundle.executions) {
        const scorer = scorerDigestAt(release, manifest.evalVersion, e.item);
        if (scorer === undefined || !isCurrent(release, bundle, e)) continue;
        if (have.has(stableStringify([digestOf(e), scorer]))) present += 1;
        else todo.push({ e, scorer, config: yield* configOf(scorer) });
      }
      // Code scorers run in throwaway sandbox containers; grade several at once.
      const records = yield* Effect.forEach(
        todo,
        ({ e, scorer, config }) =>
          Effect.gen(function* () {
            const scoredAt = new Date(yield* Clock.currentTimeMillis).toISOString();
            const record = yield* scoreRecord(e, config, {
              harnessGitSha: args.harnessGitSha,
              scoredAt,
            });
            if (record.scorer !== scorer)
              return yield* fail(
                bundle.path,
                `${e.item}: blob ${scorer} re-hashes to ${record.scorer}`,
              );
            return record;
          }),
        { concurrency: 8 },
      );
      yield* appendScores(args.store, digest, records);
      appended += records.length;
    }
    return { bundles: manifest.bundles.length, appended, present };
  }) satisfies Effect.Effect<
    unknown,
    unknown,
    FileSystem.FileSystem | Path.Path | CommandExecutor.CommandExecutor
  >;

const dataset = Options.text("dataset").pipe(Options.withDescription("Dataset name"));
const datasetsDir = Options.directory("datasets-dir").pipe(
  Options.withDescription("Directory of dataset manifests"),
  Options.withDefault("datasets"),
);
const store = Options.directory("store").pipe(
  Options.withDescription("Store holding bundles/ and scores/"),
  Options.withDefault("store"),
);
const releasesDir = Options.directory("releases-dir").pipe(
  Options.withDescription("Directory holding the release directories"),
  Options.withDefault("releases"),
);
const legacyRoot = Options.directory("legacy-root").pipe(
  Options.withDescription("Directory holding the legacy archives a legacy manifest names"),
  Options.withDefault("."),
);

export const scoreCommand = Command.make(
  "score",
  { dataset, datasetsDir, store, releasesDir, legacyRoot },
  (args) =>
    Effect.gen(function* () {
      const r = yield* scoreDataset({
        name: args.dataset,
        datasetsDir: args.datasetsDir,
        store: args.store,
        releasesDir: args.releasesDir,
        legacyRoot: args.legacyRoot,
        harnessGitSha: yield* gitSha,
      });
      yield* Effect.logInfo(
        `score ${args.dataset}: ${r.appended} record(s) appended, ${r.present} present, over ${r.bundles} bundle(s)`,
      );
    }).pipe(Effect.provide(makeLoggerLayer(false))),
).pipe(
  Command.withDescription(
    "Append the score records a dataset's eval version needs and the score log lacks",
  ),
);
