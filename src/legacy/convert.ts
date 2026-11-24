/**
 * Legacy → v4 conversion under **Provenance before reuse**
 * (docs/GUARANTEES.md#provenance-before-reuse): a legacy execution becomes a
 * v4 execution only when every link from the pinned archive bytes to the v4
 * record is proven; anything else is reported and needs a rerun.
 *
 * Checks, per attempt and then per line:
 * - **Source.** The attempt file's bytes match the SHA-256 the legacy manifest
 *   pins, the attempt is complete, and every content-store blob it references
 *   (system prompt, prompts, scorers) matches its pin.
 * - **Config.** The header records every configHash input
 *   ({@link configHashRecomputable}) and those fields, with the pinned system
 *   prompt, reproduce its 12-hex `configHash` exactly. A chat template's full
 *   digest is the `templates/<name>.jinja` file's only when its 12-hex prefix
 *   is the recorded `chatTemplateSha`. The hardware profile (the header's, or
 *   the manifest's `legacy.hardware` for an attempt without one) hashes to the
 *   recorded 12-hex `hardwareId`.
 * - **Prompt.** The line's `promptHash` is the release item's current one, and
 *   the `messagesDigest` is computed from the release's prompt blob, the
 *   system prompt and the gold history ({@link releaseMessagesDigest}).
 * - **Output.** output, reasoning, rawOutput, stopReason, error, executedAt,
 *   seed and measurements are carried over as recorded (an absent optional
 *   `seed` or `stopReason` is `null`, as `./bench run` writes it). Nothing is
 *   re-derived or corrected; legacy scores are not carried (`./bench score`
 *   grades the bundle).
 * - **Link.** Each bundle is one source attempt: its header's `source` names
 *   the file and the SHA-256 of its bytes, each execution its `sourceLine`.
 *   An attempt converts whole, so its bundle is the complete run it records:
 *   a line the attempt replayed from the cache stays in it, as the run
 *   counted it. Bundles carry no conversion time, so re-running the
 *   conversion writes identical bytes.
 */
import path from "node:path";
import { FileSystem } from "@effect/platform";
import { Effect, Either } from "effect";
import { loadSelectedChallenges } from "../config/challenges.js";
import { stableStringify } from "../config/hashing.js";
import { isLegacyManifest, type LegacyManifest, readManifest } from "../dataset/manifest.js";
import { ConfigError, FileIOError } from "../errors/index.js";
import { challengeDrift, loadRelease, releaseMessagesDigest } from "../release/release.js";
import type { ItemResult } from "../schema/attempt.js";
import {
  type BundleConfig,
  type BundleHeader,
  bundlePath,
  type Execution,
  hardwareIdOf,
  readBundle,
} from "../store/bundle.js";
import { digestOf, sha256Hex } from "../store/digest.js";
import { configHashRecomputable } from "./content-store.js";
import { computeConfigHash, legacySetChallenge } from "./identity.js";
import { currentItems, type LoadedAttempt, parseAttempt } from "./load-attempts.js";
import { pinnedBlobReader, readPinned } from "./pinned.js";
import { reconstructAttempt } from "./reconstruct.js";

export interface ConvertOptions {
  /** The legacy dataset manifest whose pinned attempts are converted. */
  readonly source: string;
  /** Directory the manifest's archive basenames are read under. */
  readonly legacyRoot: string;
  /** Store the bundles are written into (`<store>/bundles/`). */
  readonly store: string;
  readonly releasesDir: string;
  /** Directory of vendored chat templates (`<name>.jinja`). */
  readonly templatesDir: string;
}

/** One legacy (config, challenge, item) left unconverted, and why. */
export interface Unconverted {
  readonly configId: string;
  readonly configHash: string;
  readonly challenge: string;
  readonly item: string;
  readonly reason: string;
  /** Archive lines (copies included) it covers. */
  readonly lines: number;
}

export interface ConvertResult {
  /** Bundle digest → `configId · challenge`, in conversion order. */
  readonly bundles: ReadonlyArray<{ readonly digest: string; readonly comment: string }>;
  readonly executions: number;
  readonly unconverted: ReadonlyArray<Unconverted>;
  /** Per `configId@configHash`: release items it has no converted execution of, with the reasons. */
  readonly needsRerun: Readonly<
    Record<string, { items: string[]; reasons: Record<string, number> }>
  >;
}

const KNOBS = [
  "topP",
  "topK",
  "minP",
  "presencePenalty",
  "presenceContextSize",
  "repetitionPenalty",
  "repetitionContextSize",
] as const;

/** One proven line, waiting for its bundle. */
interface Candidate {
  readonly attempt: LoadedAttempt;
  readonly fileKey: string;
  readonly sourceLine: number;
  readonly line: ItemResult;
  readonly execution: Execution;
  readonly header: BundleHeader;
}

const INCOMPLETE_CONFIG =
  "config: the header does not record every configHash input (schemaVersion 2 without sampler settings)";
const CONFIG_MISMATCH =
  "config: the recorded config and the pinned system prompt do not reproduce configHash";

const canonicalLine = (v: unknown) => `${stableStringify(v)}\n`;

export const convertLegacy = (opts: ConvertOptions) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const { manifest } = yield* readManifest(opts.source);
    if (!isLegacyManifest(manifest))
      return yield* Effect.fail(
        new ConfigError({ path: opts.source, message: "not a legacy dataset manifest" }),
      );
    const release = yield* loadRelease(path.join(opts.releasesDir, manifest.release));
    const challenges = (yield* loadSelectedChallenges(
      path.join(release.dir, "challenges"),
    )).challenges.map((c) => c.resolved);
    const drift = challengeDrift(release, challenges);
    if (drift.length > 0)
      return yield* Effect.fail(
        new ConfigError({ path: release.dir, message: `challenges drift: ${drift.join("; ")}` }),
      );
    const promptHashOf = new Map<string, string>(
      challenges
        .map(legacySetChallenge)
        .flatMap((c) => c.items.map((i) => [`${c.id}/${i.itemId}`, i.promptHash] as const)),
    );

    const unconverted = new Map<string, Unconverted>();
    const skip = (
      a: { configId: string; configHash: string; challenge: string },
      item: string,
      reason: string,
    ) => {
      const k = stableStringify([a.configId, a.configHash, a.challenge, item, reason]);
      const prior = unconverted.get(k);
      unconverted.set(k, { ...a, item, reason, lines: (prior?.lines ?? 0) + 1 });
    };
    const skipAll = (a: LoadedAttempt, reason: string) => {
      const who = {
        configId: a.manifest.configId,
        configHash: a.manifest.configHash,
        challenge: a.manifest.challengeId,
      };
      for (const l of a.items) skip(who, `${a.manifest.challengeId}/${l.itemId}`, reason);
    };

    // One bundle per source attempt, executions in line order.
    const byFile = new Map<string, Candidate[]>();

    for (const [archive, pins] of Object.entries(manifest.legacy.archives)) {
      const dir = path.join(opts.legacyRoot, archive);
      const read = pinnedBlobReader(new Map([[dir, pins.blobs]]));
      for (const name of Object.keys(pins.attempts).sort()) {
        const fileKey = `${archive}/${name}`;
        const unknown = { configId: "?", configHash: "?", challenge: "?" };
        const sha = pins.attempts[name] as string;
        const bytes = yield* Effect.either(readPinned(path.join(dir, name), sha));
        if (Either.isLeft(bytes)) {
          skip(
            unknown,
            fileKey,
            `source: attempt bytes do not match the pinned SHA-256 (${bytes.left._tag})`,
          );
          continue;
        }
        const parsed = yield* Effect.either(parseAttempt(path.join(dir, name), bytes.right));
        if (Either.isLeft(parsed)) {
          skip(unknown, fileKey, `source: attempt does not parse (${parsed.left.reason})`);
          continue;
        }
        const attempt = parsed.right;
        const m = attempt.manifest;
        if (m.finishedAt === null || m.interrupted) {
          skipAll(attempt, "source: attempt is incomplete (interrupted)");
          continue;
        }
        if (!configHashRecomputable(m)) {
          skipAll(attempt, INCOMPLETE_CONFIG);
          continue;
        }
        const recon = yield* Effect.either(reconstructAttempt(attempt, read));
        if (Either.isLeft(recon)) {
          const why =
            recon.left._tag === "NotReconstructible" ? recon.left.reason : recon.left._tag;
          // The system blob is read only when the recorded config and its text reproduce configHash.
          skipAll(
            attempt,
            why.includes("content/system/")
              ? CONFIG_MISMATCH
              : `source: blobs not reconstructible through the pins (${why})`,
          );
          continue;
        }
        const header = yield* provenConfig(
          attempt,
          recon.right.systemPromptText,
          fileKey,
          sha,
          manifest,
          opts,
        );
        if (typeof header === "string") {
          skipAll(attempt, header);
          continue;
        }
        const who = { configId: m.configId, configHash: m.configHash, challenge: m.challengeId };
        const current = new Set(currentItems(m, attempt.items));
        for (const [i, line] of attempt.items.entries()) {
          const item = `${m.challengeId}/${line.itemId}`;
          const promptHash = promptHashOf.get(item);
          const messagesDigest = releaseMessagesDigest(release, item, header.config.systemPrompt);
          const why = !current.has(line)
            ? "prompt: item retired in its attempt"
            : promptHash === undefined
              ? "prompt: not an item of the release"
              : line.promptHash !== promptHash
                ? "prompt: promptHash is not the release's current prompt"
                : messagesDigest === undefined
                  ? "prompt: the release has no prompt blob for the item"
                  : undefined;
          if (why !== undefined || messagesDigest === undefined) {
            skip(who, item, why ?? "");
            continue;
          }
          const c: Candidate = {
            attempt,
            fileKey,
            sourceLine: i + 2,
            line,
            header,
            execution: executionOf(line, item, messagesDigest, i + 2),
          };
          byFile.set(fileKey, [...(byFile.get(fileKey) ?? []), c]);
        }
      }
    }

    const bundles: { digest: string; comment: string }[] = [];
    const converted = new Set<string>();
    let executions = 0;
    yield* fs
      .makeDirectory(path.join(opts.store, "bundles"), { recursive: true })
      .pipe(
        Effect.mapError(
          (cause) => new FileIOError({ path: opts.store, operation: "mkdir", cause }),
        ),
      );
    for (const fileKey of [...byFile.keys()].sort()) {
      const cands = (byFile.get(fileKey) as Candidate[]).sort(
        (a, b) => a.sourceLine - b.sourceLine,
      );
      const { header, attempt } = cands[0] as Candidate;
      const m = attempt.manifest;
      const seen = new Set<string>();
      const execs: Execution[] = [];
      for (const c of cands) {
        const k = `${c.execution.item}#${c.execution.sample}`;
        if (seen.has(k)) {
          skip(
            { configId: m.configId, configHash: m.configHash, challenge: m.challengeId },
            c.execution.item,
            "source: duplicate item × sample in its attempt",
          );
          continue;
        }
        seen.add(k);
        execs.push(c.execution);
        converted.add(stableStringify([m.configId, m.configHash, c.execution.item]));
      }
      const text = [{ ...header, executions: execs.length }, ...execs].map(canonicalLine).join("");
      const digest = sha256Hex(text);
      const file = bundlePath(opts.store, digest);
      const exists = yield* fs
        .exists(file)
        .pipe(
          Effect.mapError((cause) => new FileIOError({ path: file, operation: "stat", cause })),
        );
      if (!exists)
        yield* fs
          .writeFileString(file, text)
          .pipe(
            Effect.mapError((cause) => new FileIOError({ path: file, operation: "write", cause })),
          );
      yield* readBundle(file);
      bundles.push({ digest, comment: `${header.configId} · ${header.challenge}` });
      executions += execs.length;
    }

    const list = [...unconverted.values()].sort((a, b) =>
      stableStringify([a.configId, a.challenge, a.item, a.reason]) <
      stableStringify([b.configId, b.challenge, b.item, b.reason])
        ? -1
        : 1,
    );
    const needsRerun: Record<string, { items: string[]; reasons: Record<string, number> }> = {};
    for (const u of list) {
      if (
        !promptHashOf.has(u.item) ||
        converted.has(stableStringify([u.configId, u.configHash, u.item]))
      )
        continue;
      const k = `${u.configId}@${u.configHash}`;
      const r = needsRerun[k] ?? { items: [], reasons: {} };
      if (!r.items.includes(u.item)) r.items.push(u.item);
      r.reasons[u.reason] = (r.reasons[u.reason] ?? 0) + 1;
      needsRerun[k] = r;
    }
    return { bundles, executions, unconverted: list, needsRerun } satisfies ConvertResult;
  });

/** The v4 execution a proven legacy line carries over to. */
const executionOf = (
  line: ItemResult,
  item: string,
  messagesDigest: string,
  sourceLine: number,
): Execution => {
  const {
    promptTokens,
    generationTokens,
    promptTps,
    generationTps,
    peakMemoryGb,
    wallTimeSec,
    ttftMs,
    prefillMs,
    decodeMs,
    timingSource,
    prefillTokens,
    cachedPromptTokens,
    draftTokens,
    draftAcceptedTokens,
  } = line;
  const timing = {
    ttftMs,
    prefillMs,
    decodeMs,
    timingSource,
    prefillTokens,
    cachedPromptTokens,
    draftTokens,
    draftAcceptedTokens,
  };
  return {
    item,
    sample: line.sample ?? 0,
    seed: line.seed ?? null,
    messagesDigest,
    executedAt: line.executedAt,
    output: line.output,
    reasoning: line.reasoning,
    rawOutput: line.rawOutput,
    error: line.error,
    stopReason: line.stopReason ?? null,
    sourceLine,
    measured: {
      promptTokens,
      generationTokens,
      promptTps,
      generationTps,
      peakMemoryGb,
      wallTimeSec,
      ...Object.fromEntries(Object.entries(timing).filter(([, v]) => v !== undefined)),
    },
  };
};

/**
 * The v4 bundle header (without `executions`) an attempt's proven config and
 * hardware give, or why they are not proven.
 */
const provenConfig = (
  attempt: LoadedAttempt,
  systemPrompt: string,
  file: string,
  sha256: string,
  manifest: LegacyManifest,
  opts: ConvertOptions,
) =>
  Effect.gen(function* () {
    const m = attempt.manifest;
    if (computeConfigHash(m, systemPrompt) !== m.configHash) return CONFIG_MISMATCH;
    let chatTemplateDigest: string | null = null;
    if (m.chatTemplateSha !== undefined) {
      const fs = yield* FileSystem.FileSystem;
      const bytes =
        m.chatTemplate === undefined
          ? undefined
          : yield* fs.readFile(path.join(opts.templatesDir, `${m.chatTemplate}.jinja`)).pipe(
              Effect.option,
              Effect.map((o) => (o._tag === "Some" ? o.value : undefined)),
            );
      const full = bytes === undefined ? undefined : sha256Hex(bytes);
      if (full === undefined || full.slice(0, 12) !== m.chatTemplateSha)
        return "config: the chat template's full digest is not provable from its recorded chatTemplateSha";
      chatTemplateDigest = full;
    }
    const hardware = m.env.hardware ?? manifest.legacy.hardware.profile;
    const legacyId = m.env.hardwareId ?? manifest.legacy.hardware.id;
    if (hardware === undefined || hardwareIdOf(hardware).slice(0, 12) !== legacyId)
      return "config: no hardware profile that hashes to the recorded hardwareId";
    const config: BundleConfig = {
      artifact: m.artifact,
      weightsDigest: null,
      runtime: m.runtime,
      ...(m.quant === undefined ? {} : { quant: m.quant }),
      temperature: m.temperature,
      maxTokens: m.maxTokens,
      sampling: Object.fromEntries(KNOBS.flatMap((k) => (m[k] === undefined ? [] : [[k, m[k]]]))),
      ...(m.chatTemplateKwargs === undefined ? {} : { chatTemplateKwargs: m.chatTemplateKwargs }),
      chatTemplateDigest,
      systemPrompt,
    };
    const header: BundleHeader = {
      schemaVersion: 4,
      configId: m.configId,
      config,
      configDigest: digestOf(config),
      release: manifest.release,
      challenge: m.challengeId,
      run: {
        id: m.invocationId ?? m.attemptId,
        contributor: m.submitter ?? "local",
        startedAt: m.startedAt,
        finishedAt: m.finishedAt,
      },
      env: {
        platform: m.env.platform,
        runtimeVersion: m.env.runtimeVersion,
        nodeVersion: m.env.nodeVersion,
        harnessGitSha: m.env.benchmarkGitSha,
        hardware,
        hardwareId: hardwareIdOf(hardware),
        ...(m.ctxSize === undefined ? {} : { ctxSize: m.ctxSize }),
        ...(m.extraArgs === undefined ? {} : { extraArgs: m.extraArgs }),
        ...(m.serverFlags === undefined ? {} : { serverFlags: m.serverFlags }),
        ...(m.chatTemplate === undefined ? {} : { chatTemplate: m.chatTemplate }),
      },
      executions: null,
      source: { file, sha256 },
    };
    return header;
  });
