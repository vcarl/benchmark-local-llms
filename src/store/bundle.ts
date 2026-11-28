/**
 * Bundles (schemaVersion 4): one config executing one challenge's items on one
 * machine in one run. Line 1 is the header, each further line one execution;
 * every line is `stableStringify(obj) + "\n"`.
 *
 * Lifecycle: `createOpenBundle` writes the header to
 * `<store>/open/<runId>-<configId>-<challenge>.jsonl`, `appendExecution` adds
 * lines, and `sealBundle` fills `finishedAt` + `executions`, re-serializes
 * canonically, and renames the bytes to `<store>/bundles/<digest>.jsonl`.
 * `readBundle` is the verifying reader: it re-derives every digest and fails
 * with a typed `BundleInvalid` naming the check.
 */
import path from "node:path";
import { FileSystem } from "@effect/platform";
import { Effect, Either, Schema } from "effect";
import { stableStringify } from "../config/hashing.js";
import { type BundleCheck, BundleConflict, BundleInvalid, FileIOError } from "../errors/index.js";
import { ItemTimingFields } from "../schema/attempt.js";
import { Runtime } from "../schema/enums.js";
import { HardwareProfile } from "../schema/run-manifest.js";
import { digestOf, sha256Hex } from "./digest.js";

// ── Schemas ────────────────────────────────────────────────────────────────

const Sampling = Schema.Struct({
  topP: Schema.optional(Schema.Number),
  topK: Schema.optional(Schema.Number),
  minP: Schema.optional(Schema.Number),
  presencePenalty: Schema.optional(Schema.Number),
  presenceContextSize: Schema.optional(Schema.Number),
  repetitionPenalty: Schema.optional(Schema.Number),
  repetitionContextSize: Schema.optional(Schema.Number),
});

/** The config digest's preimage: everything that shapes what the model generates. */
export const BundleConfig = Schema.Struct({
  artifact: Schema.String,
  weightsDigest: Schema.NullOr(Schema.String),
  runtime: Runtime,
  quant: Schema.optional(Schema.String),
  temperature: Schema.Number,
  maxTokens: Schema.Number,
  sampling: Sampling,
  chatTemplateKwargs: Schema.optional(
    Schema.Record({
      key: Schema.String,
      value: Schema.Union(Schema.String, Schema.Number, Schema.Boolean),
    }),
  ),
  chatTemplateDigest: Schema.NullOr(Schema.String),
  systemPrompt: Schema.String,
});
export type BundleConfig = typeof BundleConfig.Type;

/**
 * The Hugging Face revision a config's weights were loaded from, and when the
 * hub published it (that revision's commit time, ISO); `publishedAt` is null
 * when the lookup failed (offline, timeout, unknown repo).
 */
export const WeightsSource = Schema.Struct({
  repo: Schema.String,
  revision: Schema.String,
  publishedAt: Schema.NullOr(Schema.String),
});
export type WeightsSource = typeof WeightsSource.Type;

export const BundleEnv = Schema.Struct({
  platform: Schema.String,
  runtimeVersion: Schema.String,
  nodeVersion: Schema.String,
  harnessGitSha: Schema.String,
  hardware: HardwareProfile,
  hardwareId: Schema.String,
  ctxSize: Schema.optional(Schema.Number),
  extraArgs: Schema.optional(Schema.Array(Schema.String)),
  serverFlags: Schema.optional(Schema.Array(Schema.String)),
  chatTemplate: Schema.optional(Schema.String),
  /** Absent when the weights are not in the Hugging Face cache (a local path, or no weights located). */
  weightsSource: Schema.optional(WeightsSource),
});
export type BundleEnv = typeof BundleEnv.Type;

export const BundleHeader = Schema.Struct({
  schemaVersion: Schema.Literal(4),
  configId: Schema.String,
  config: BundleConfig,
  configDigest: Schema.String,
  release: Schema.String,
  challenge: Schema.String,
  run: Schema.Struct({
    id: Schema.String,
    contributor: Schema.String,
    startedAt: Schema.String,
    finishedAt: Schema.NullOr(Schema.String),
  }),
  env: BundleEnv,
  /** Line count after the header; null while the bundle is open. */
  executions: Schema.NullOr(Schema.Number),
  /**
   * A bundle converted from a legacy attempt (`./bench legacy convert`): the
   * attempt file (`<archive>/<name>`) and the SHA-256 of its bytes. Absent on
   * a bundle `./bench run` wrote.
   */
  source: Schema.optional(Schema.Struct({ file: Schema.String, sha256: Schema.String })),
});
export type BundleHeader = typeof BundleHeader.Type;

export const Execution = Schema.Struct({
  /** `<challengeId>/<itemId>`; a turn's itemId carries `#k`. */
  item: Schema.String,
  sample: Schema.Number,
  seed: Schema.NullOr(Schema.Number),
  messagesDigest: Schema.String,
  executedAt: Schema.String,
  output: Schema.String,
  reasoning: Schema.NullOr(Schema.String),
  rawOutput: Schema.String,
  error: Schema.NullOr(Schema.String),
  stopReason: Schema.NullOr(Schema.String),
  /** A converted execution's line in the header's `source` attempt file (1 = its header). */
  sourceLine: Schema.optional(Schema.Number),
  measured: Schema.Struct({
    promptTokens: Schema.Number,
    generationTokens: Schema.Number,
    promptTps: Schema.Number,
    generationTps: Schema.Number,
    peakMemoryGb: Schema.Number,
    wallTimeSec: Schema.Number,
    ...ItemTimingFields,
  }),
});
export type Execution = typeof Execution.Type;

export interface OpenBundle {
  readonly path: string;
  readonly header: BundleHeader;
  readonly executions: ReadonlyArray<Execution>;
}

export interface VerifiedBundle extends OpenBundle {
  readonly digest: string;
}

// ── Pure helpers ───────────────────────────────────────────────────────────

/** `hardwareId`: digest of the hardware profile with `os` left out. */
export const hardwareIdOf = (hardware: HardwareProfile): string => {
  const { os: _os, ...spec } = hardware;
  return digestOf(spec);
};

const canonicalLine = (value: unknown): string => `${stableStringify(value)}\n`;

export const bundlePath = (store: string, digest: string): string =>
  path.join(store, "bundles", `${digest}.jsonl`);

export const openDir = (store: string): string => path.join(store, "open");

/** The release a challenges directory belongs to: `<name>` for `.../releases/<name>/challenges`, else `"draft"`. */
export const releaseOfChallengesDir = (dir: string): string => {
  const parts = path
    .normalize(dir)
    .split(path.sep)
    .filter((p) => p !== "");
  const n = parts.length;
  return n >= 3 && parts[n - 1] === "challenges" && parts[n - 3] === "releases"
    ? (parts[n - 2] as string)
    : "draft";
};

// ── I/O ────────────────────────────────────────────────────────────────────

const io =
  (p: string, operation: string) =>
  (cause: unknown): FileIOError =>
    new FileIOError({ path: p, operation, cause });

const invalid = (p: string, check: BundleCheck, detail: string) =>
  Effect.fail(new BundleInvalid({ path: p, check, detail }));

const decode = <A, I>(schema: Schema.Schema<A, I>, value: unknown, p: string, line: number) => {
  const r = Schema.decodeUnknownEither(schema)(value, { onExcessProperty: "error" });
  return Either.isRight(r)
    ? Effect.succeed(r.right)
    : invalid(p, "schema", `line ${line}: ${String(r.left.message).slice(0, 300)}`);
};

const parseLine = (p: string, raw: string, line: number) =>
  Effect.try({
    try: () => JSON.parse(raw) as unknown,
    catch: () => new BundleInvalid({ path: p, check: "json", detail: `line ${line}` }),
  });

/** Parse + decode header and execution lines (no digest checks). */
const decodeLines = (p: string, lines: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const [first, ...rest] = lines;
    if (first === undefined) return yield* invalid(p, "schema", "empty file: no header");
    const header = yield* decode(BundleHeader, yield* parseLine(p, first, 1), p, 1);
    const executions: Execution[] = [];
    for (const [i, raw] of rest.entries()) {
      executions.push(yield* decode(Execution, yield* parseLine(p, raw, i + 2), p, i + 2));
    }
    return { path: p, header, executions };
  });

/** Create `<store>/open/<runId>-<configId>-<challenge>.jsonl` holding `header`. Never clobbers. */
export const createOpenBundle = (store: string, header: BundleHeader) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = openDir(store);
    const file = path.join(dir, `${header.run.id}-${header.configId}-${header.challenge}.jsonl`);
    yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.mapError(io(dir, "mkdir")));
    yield* fs
      .writeFileString(file, canonicalLine(header), { flag: "wx" })
      .pipe(Effect.mapError(io(file, "create open bundle")));
    return file;
  });

export const appendExecution = (openPath: string, execution: Execution) =>
  Effect.flatMap(FileSystem.FileSystem, (fs) =>
    fs
      .writeFileString(openPath, canonicalLine(execution), { flag: "a" })
      .pipe(Effect.mapError(io(openPath, "append execution"))),
  );

/** Read an open bundle. A partial trailing line (a crash mid-append) is ignored. */
export const readOpenBundle = (openPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* fs
      .readFileString(openPath)
      .pipe(Effect.mapError(io(openPath, "read open bundle")));
    return yield* decodeLines(openPath, text.split("\n").slice(0, -1));
  });

/**
 * Seal an open bundle: fill `finishedAt` and `executions`, re-serialize every
 * line canonically, and store the bytes as `bundles/<digest>.jsonl` (temp
 * write + rename), then remove the open file. A re-executed item×sample keeps
 * only its last line. An identical file already stored is a no-op; a
 * different one is a `BundleConflict`, never an overwrite.
 */
export const sealBundle = (store: string, openPath: string, finishedAt: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const open = yield* readOpenBundle(openPath);
    const latest = new Map<string, Execution>();
    for (const e of open.executions) {
      const key = stableStringify([e.item, e.sample]);
      latest.delete(key);
      latest.set(key, e);
    }
    const executions = [...latest.values()];
    const header: BundleHeader = {
      ...open.header,
      run: { ...open.header.run, finishedAt },
      executions: executions.length,
    };
    const text = [header, ...executions].map(canonicalLine).join("");
    const digest = sha256Hex(text);
    const target = bundlePath(store, digest);

    const exists = yield* fs.exists(target).pipe(Effect.mapError(io(target, "stat")));
    if (exists) {
      const stored = yield* fs.readFileString(target).pipe(Effect.mapError(io(target, "read")));
      if (stored !== text) return yield* Effect.fail(new BundleConflict({ path: target }));
    } else {
      const dir = path.dirname(target);
      const tmp = path.join(dir, `.${digest}.tmp`);
      yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.mapError(io(dir, "mkdir")));
      yield* fs.writeFileString(tmp, text).pipe(Effect.mapError(io(tmp, "write")));
      yield* fs.rename(tmp, target).pipe(Effect.mapError(io(target, "rename")));
    }
    yield* fs.remove(openPath).pipe(Effect.mapError(io(openPath, "remove open bundle")));
    return digest;
  });

const DIGEST_NAME = /^([0-9a-f]{64})\.jsonl$/;

/**
 * Read and verify a sealed bundle: the file is canonical JSONL, header and
 * executions decode exactly (no extra fields), `configDigest` and `hardwareId`
 * re-derive, `executions` equals the line count, no item×sample repeats, and a
 * file named `<64 hex>.jsonl` hashes to its name. Any failure is a
 * `BundleInvalid` naming the check. `digest` is the file's computed digest.
 */
export const readBundle = (file: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const bytes = yield* fs.readFile(file).pipe(Effect.mapError(io(file, "read bundle")));
    const text = Buffer.from(bytes).toString("utf8");
    if (!text.endsWith("\n")) return yield* invalid(file, "canonical", "no trailing newline");
    const lines = text.slice(0, -1).split("\n");
    const bundle = yield* decodeLines(file, lines);
    const { header, executions } = bundle;

    const objects: ReadonlyArray<unknown> = [header, ...executions];
    const bad = objects.findIndex((o, i) => stableStringify(o) !== lines[i]);
    if (bad >= 0) return yield* invalid(file, "canonical", `line ${bad + 1}`);
    if (!Buffer.from(objects.map(canonicalLine).join(""), "utf8").equals(bytes)) {
      return yield* invalid(file, "canonical", "bytes are not canonical UTF-8");
    }
    const configDigest = digestOf(header.config);
    if (configDigest !== header.configDigest) {
      return yield* invalid(file, "configDigest", `config hashes to ${configDigest}`);
    }
    const hardwareId = hardwareIdOf(header.env.hardware);
    if (hardwareId !== header.env.hardwareId) {
      return yield* invalid(file, "hardwareId", `hardware hashes to ${hardwareId}`);
    }
    if (header.executions !== executions.length) {
      return yield* invalid(
        file,
        "executions",
        `header says ${header.executions}, file holds ${executions.length}`,
      );
    }
    const seen = new Set<string>();
    for (const e of executions) {
      const key = `${e.item}#sample${e.sample}`;
      if (seen.has(key)) return yield* invalid(file, "duplicate", key);
      seen.add(key);
    }
    const digest = sha256Hex(bytes);
    const named = DIGEST_NAME.exec(path.basename(file))?.[1];
    if (named !== undefined && named !== digest) {
      return yield* invalid(file, "name", `bytes hash to ${digest}`);
    }
    return { ...bundle, digest } satisfies VerifiedBundle;
  });
