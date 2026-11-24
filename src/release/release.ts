/**
 * Releases (`releases/<release>/`): `release.json` (every item's prompt and
 * scorer digest, plus the commitment once committed), `errata.yaml`,
 * `challenges/*.yaml`, and `blobs/<sha256>` holding every prompt and scorer
 * blob the release has used.
 *
 * Digests: a prompt blob is the prompt's `promptContent` bytes, a scorer blob
 * the scorer blob bytes of src/scoring/rules.ts; each is named and identified
 * by the SHA-256 of its bytes. Release 0 keeps the legacy 12-hex
 * `promptHash`/`scorerHash` values (they name legacy executions); its blobs
 * are still named by full SHA-256 and matched to an item by legacy key.
 *
 * Commitment: SHA-256 of `stableStringify` of the sorted
 * `[key, promptDigest, scorerDigest]` triples: one digest naming a release's
 * exact item set.
 */
import path from "node:path";
import { FileSystem } from "@effect/platform";
import { Clock, Effect, Either, Option, Schema } from "effect";
import type { ResolvedChallenge } from "../config/challenges.js";
import { loadSelectedChallenges, promptContent } from "../config/challenges.js";
import {
  coverageGaps,
  ErrataFile,
  type Erratum,
  errataIdProblems,
  evalVersion,
  parseEvalVersion,
  ReleaseFile,
  type ReleaseItem,
  releaseArgProblem,
  snapshotItems,
} from "../config/errata.js";
import { stableStringify } from "../config/hashing.js";
import { compareReleases } from "../config/release-order.js";
import { parseYaml } from "../config/yaml.js";
import { ConfigError, FileIOError, ReleaseInvalid } from "../errors/index.js";
import { computePromptHash, shortSha256 } from "../legacy/identity.js";
import { chatMessages } from "../llm/chat-completion.js";
import type { ChatMessage } from "../schema/prompt.js";
import { scorerBlob } from "../scoring/rules.js";
import { digestOf, sha256Hex } from "../store/digest.js";

export interface Release {
  readonly dir: string;
  readonly file: ReleaseFile;
  readonly errata: ReadonlyArray<Erratum>;
  /** Blob digest → its bytes (UTF-8). Every entry hashed to its name on load. */
  readonly blobs: ReadonlyMap<string, string>;
}

const io =
  (p: string, operation: string) =>
  (cause: unknown): FileIOError =>
    new FileIOError({ path: p, operation, cause });

const invalid = (p: string) => (e: { readonly message: string }) =>
  new ReleaseInvalid({ path: p, detail: e.message });

const readOptional = (file: string) =>
  Effect.flatMap(FileSystem.FileSystem, (fs) =>
    fs.exists(file).pipe(
      Effect.flatMap((exists) =>
        exists ? Effect.map(fs.readFileString(file), Option.some) : Effect.succeed(Option.none()),
      ),
      Effect.mapError(io(file, "read")),
    ),
  );

const decodeReleaseFile = (file: string, src: string) =>
  Effect.try(() => JSON.parse(src) as unknown).pipe(
    Effect.mapError(() => new ReleaseInvalid({ path: file, detail: "not JSON" })),
    Effect.flatMap((v) =>
      Schema.decodeUnknown(ReleaseFile)(v).pipe(Effect.mapError(invalid(file))),
    ),
  );

/**
 * Load a release: decode `release.json` and `errata.yaml` (absent = no errata)
 * and read every blob, failing `ReleaseInvalid` when one does not hash to its name.
 */
export const loadRelease = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const releasePath = path.join(dir, "release.json");
    const src = yield* fs
      .readFileString(releasePath)
      .pipe(Effect.mapError(io(releasePath, "read")));
    const file = yield* decodeReleaseFile(releasePath, src);
    const errataPath = path.join(dir, "errata.yaml");
    const errataSrc = yield* readOptional(errataPath);
    const errata = Option.isNone(errataSrc)
      ? []
      : (yield* parseYaml(errataPath, errataSrc.value).pipe(
          Effect.flatMap(Schema.decodeUnknown(ErrataFile)),
          Effect.mapError(invalid(errataPath)),
        )).errata;
    const blobDir = path.join(dir, "blobs");
    const names = (yield* fs.exists(blobDir).pipe(Effect.mapError(io(blobDir, "stat"))))
      ? yield* fs.readDirectory(blobDir).pipe(Effect.mapError(io(blobDir, "list")))
      : [];
    const blobs = new Map<string, string>();
    for (const name of names.sort()) {
      const p = path.join(blobDir, name);
      const bytes = yield* fs.readFile(p).pipe(Effect.mapError(io(p, "read")));
      const digest = sha256Hex(bytes);
      if (digest !== name) {
        return yield* Effect.fail(new ReleaseInvalid({ path: p, detail: `hashes to ${digest}` }));
      }
      blobs.set(digest, Buffer.from(bytes).toString("utf8"));
    }
    return { dir, file, errata, blobs } satisfies Release;
  });

/** The release's items for resolved challenges, and the blobs they name (none for release 0). */
export const resolveItems = (
  challenges: ReadonlyArray<ResolvedChallenge>,
  release: string,
): { items: Record<string, ReleaseItem>; blobs: Map<string, string> } => {
  const blobs = new Map<string, string>();
  if (release === "0") return { items: snapshotItems(challenges), blobs };
  const items: Record<string, ReleaseItem> = {};
  for (const c of challenges) {
    for (const i of c.items) {
      const prompt = promptContent(i.prompt);
      const scorer = scorerBlob(i.scorer);
      blobs.set(sha256Hex(prompt), prompt).set(sha256Hex(scorer), scorer);
      items[`${c.id}/${i.itemId}`] = {
        prompt: sha256Hex(prompt),
        scorer: sha256Hex(scorer),
        scope: i.scope,
        family: i.family,
      };
    }
  }
  return { items, blobs };
};

/**
 * Where a release's challenges differ from its `release.json`, one line per
 * problem, naming the item. A draft must match exactly; a release must be
 * covered by its errata (ids in sequence, none after `closed`). Empty means
 * in sync.
 */
export const challengeDrift = (
  release: Pick<Release, "file" | "errata">,
  challenges: ReadonlyArray<ResolvedChallenge>,
): string[] => {
  const { file, errata } = release;
  const current = resolveItems(challenges, file.release).items;
  if (file.release !== "draft")
    return [
      ...coverageGaps(file.items, current, errata),
      ...errataIdProblems(file.release, errata, file.closed),
    ];
  return [...new Set([...Object.keys(file.items), ...Object.keys(current)])]
    .filter((k) => stableStringify(file.items[k] ?? null) !== stableStringify(current[k] ?? null))
    .sort()
    .map(
      (k) =>
        `${k}: out of sync with release.json (${file.items[k] === undefined ? "not in it" : current[k] === undefined ? "only in it" : "digests differ"}; ./bench release sync draft)`,
    );
};

/** SHA-256 over the sorted `[key, prompt, scorer]` triples. */
export const commitment = (items: Readonly<Record<string, ReleaseItem>>): string =>
  sha256Hex(
    stableStringify(
      Object.entries(items)
        .map(([k, i]) => [k, i.prompt, i.scorer])
        .sort(([a], [b]) => ((a as string) < (b as string) ? -1 : 1)),
    ),
  );

/**
 * The scorer digest grading `item` at `version`: the latest erratum ≤ n that
 * records one for the item, else `release.json`'s. A draft (version null)
 * grades with `release.json`'s. Undefined for an item the release does not
 * know or a version of another release.
 */
export const scorerDigestAt = (
  release: Pick<Release, "file" | "errata">,
  version: string | null,
  item: string,
): string | undefined => {
  const v = version === null ? undefined : parseEvalVersion(version);
  if (version !== null && v?.release !== release.file.release) return undefined;
  let digest = release.file.items[item]?.scorer;
  for (const e of release.errata.slice(0, v?.n ?? 0)) digest = e.scorers?.[item] ?? digest;
  return digest;
};

/**
 * The messages digest a run of `item` sends under this release: the digest of
 * the chat messages built from the item's prompt blob and `systemPrompt` (for
 * turn k ≥ 2, the blob's gold history followed by the turn's prompt).
 * Undefined when the release has no such item or no blob for its prompt.
 */
export const releaseMessagesDigest = (
  release: Pick<Release, "file" | "blobs">,
  item: string,
  systemPrompt: string,
): string | undefined => {
  const digest = release.file.items[item]?.prompt;
  const blob = digest === undefined ? undefined : release.blobs.get(digest);
  if (blob === undefined) return undefined;
  const turn = /#(\d+)$/.exec(item)?.[1];
  if (turn === undefined || turn === "1")
    return digestOf(chatMessages({ systemPrompt, userPrompt: blob }));
  const conversation = JSON.parse(blob) as ChatMessage[];
  return digestOf(
    chatMessages({
      systemPrompt,
      userPrompt: conversation.at(-1)?.content ?? "",
      history: conversation.slice(0, -1),
    }),
  );
};

/** Whether the release holds a blob for `digest` (release 0: by legacy 12-hex key). */
const blobIndex = (release: Release): ((digest: string) => boolean) => {
  if (release.file.release !== "0") return (d) => release.blobs.has(d);
  const keys = new Set(
    [...release.blobs.values()].flatMap((b) => [shortSha256(b), computePromptHash(b, "")]),
  );
  return (d) => keys.has(d);
};

/** `release.json` with sorted keys, 2-space indent and a trailing newline. */
const writeReleaseFile = (dir: string, file: ReleaseFile) =>
  Effect.flatMap(FileSystem.FileSystem, (fs) => {
    const p = path.join(dir, "release.json");
    return fs
      .writeFileString(p, `${JSON.stringify(JSON.parse(stableStringify(file)), null, 2)}\n`)
      .pipe(Effect.mapError(io(p, "write")));
  });

/** Write the blobs `blobs/` lacks; never deletes. Returns how many were written. */
const writeBlobs = (dir: string, blobs: ReadonlyMap<string, string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const blobDir = path.join(dir, "blobs");
    yield* fs
      .makeDirectory(blobDir, { recursive: true })
      .pipe(Effect.mapError(io(blobDir, "mkdir")));
    let written = 0;
    for (const [digest, bytes] of blobs) {
      const p = path.join(blobDir, digest);
      if (yield* fs.exists(p).pipe(Effect.mapError(io(p, "stat")))) continue;
      yield* fs.writeFileString(p, bytes).pipe(Effect.mapError(io(p, "write")));
      written += 1;
    }
    return written;
  });

const loadChallengesOf = (dir: string) =>
  Effect.map(loadSelectedChallenges(path.join(dir, "challenges")), (s) =>
    s.challenges.map((c) => c.resolved),
  );

/**
 * Bring an uncommitted release (the draft) in line with its challenges:
 * rewrite `release.json`'s items and write any missing blobs.
 */
export const syncRelease = (dir: string) =>
  Effect.gen(function* () {
    const releasePath = path.join(dir, "release.json");
    const src = yield* readOptional(releasePath);
    const prior: ReleaseFile = Option.isNone(src)
      ? { release: path.basename(dir), items: {} }
      : yield* decodeReleaseFile(releasePath, src.value);
    if (prior.commitment !== undefined || prior.closed !== undefined || prior.release === "0") {
      return yield* Effect.fail(
        new ConfigError({
          path: releasePath,
          message: `release ${prior.release} is committed or closed; only a draft is synced`,
        }),
      );
    }
    const { items, blobs } = resolveItems(yield* loadChallengesOf(dir), prior.release);
    yield* writeReleaseFile(dir, { ...prior, items });
    return { items: Object.keys(items).length, blobsWritten: yield* writeBlobs(dir, blobs) };
  });

/**
 * Commit `<releasesDir>/<name>` from `from` (the draft): copy its challenges,
 * write `release.json` with the items, commitment and commit time, the blobs,
 * and an empty `errata.yaml`.
 */
export const commitRelease = (releasesDir: string, name: string, from: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const target = path.join(releasesDir, name);
    const existing = yield* fs
      .readDirectory(releasesDir)
      .pipe(Effect.mapError(io(releasesDir, "list")));
    const latest = existing
      .filter((r) => releaseArgProblem(r, undefined) === undefined)
      .sort(compareReleases)
      .at(-1);
    const problem =
      releaseArgProblem(name, latest) ??
      (existing.includes(name) ? `release ${name} already exists` : undefined);
    if (problem !== undefined) {
      return yield* Effect.fail(new ConfigError({ path: target, message: problem }));
    }
    const challengesDir = path.join(target, "challenges");
    yield* fs.makeDirectory(target, { recursive: true }).pipe(Effect.mapError(io(target, "mkdir")));
    yield* fs
      .copy(path.join(from, "challenges"), challengesDir)
      .pipe(Effect.mapError(io(challengesDir, "copy challenges")));
    const { items, blobs } = resolveItems(yield* loadChallengesOf(target), name);
    const digest = commitment(items);
    const committedAt = new Date(yield* Clock.currentTimeMillis).toISOString();
    yield* writeReleaseFile(target, { release: name, commitment: digest, committedAt, items });
    yield* writeBlobs(target, blobs);
    const errataPath = path.join(target, "errata.yaml");
    yield* fs
      .writeFileString(errataPath, "errata: []\n")
      .pipe(Effect.mapError(io(errataPath, "write")));
    return { commitment: digest, items: Object.keys(items).length };
  });

/**
 * Verify a release directory: every blob hashes to its name and every digest
 * `release.json` or an erratum names has a blob; the challenges re-resolve to
 * `release.json` (a draft: exactly; a release: up to its errata, with ids in
 * sequence and none after `closed`); a committed release's items hash to its
 * commitment. Returns what matched and every problem found.
 */
export const verifyRelease = (dir: string) =>
  Effect.gen(function* () {
    const ok: string[] = [];
    const problems: string[] = [];
    const loaded = yield* Effect.either(loadRelease(dir));
    if (Either.isLeft(loaded)) return { ok, problems: [loaded.left.message] };
    const release = loaded.right;
    const { file, errata } = release;
    const items = Object.entries(file.items);
    ok.push(`blobs: ${release.blobs.size} verified`);

    const has = blobIndex(release);
    const missing = [
      ...items.flatMap(([k, i]) => [i.prompt, i.scorer].map((d) => [k, d] as const)),
      ...errata.flatMap((e) => Object.entries(e.scorers ?? {})),
    ].filter(([, d]) => !has(d));
    problems.push(...missing.map(([k, d]) => `${k}: no blob for ${d}`));

    const resolved = yield* Effect.either(loadChallengesOf(dir));
    if (Either.isLeft(resolved)) {
      // Not every load error carries a message (YamlParseError has filePath + cause).
      problems.push(`challenges: ${resolved.left._tag} ${JSON.stringify(resolved.left)}`);
    } else {
      const drift = challengeDrift(release, resolved.right);
      problems.push(...drift);
      if (drift.length === 0)
        ok.push(
          file.release === "draft"
            ? `items: ${items.length} in sync with challenges/`
            : `items: ${items.length} covered at eval version ${evalVersion(file.release, errata)}`,
        );
    }

    if (file.release !== "0" && file.release !== "draft") {
      const digest = commitment(file.items);
      if (file.commitment === undefined) problems.push("release.json has no commitment");
      else if (file.commitment !== digest) {
        problems.push(`commitment: release.json has ${file.commitment}, items hash to ${digest}`);
      } else ok.push(`commitment: ${digest}`);
    }
    return { ok, problems };
  });
