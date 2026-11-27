/**
 * What the store already holds, for skip-if-present and resume.
 *
 * A run skips a whole cell (config × challenge) only when one sealed bundle
 * holds, with no harness failure, every execution key (config digest, hardwareId,
 * item, messages digest, sample) the cell asks for; nothing is pooled across
 * bundles. Resume adopts the open file of the same config, hardware, release
 * and challenge and continues it.
 */
import path from "node:path";
import { FileSystem } from "@effect/platform";
import { Effect } from "effect";
import { stableStringify } from "../config/hashing.js";
import { FileIOError } from "../errors/index.js";
import {
  type BundleHeader,
  type Execution,
  type OpenBundle,
  openDir,
  readBundle,
  readOpenBundle,
} from "./bundle.js";

export interface ExecutionKey {
  readonly configDigest: string;
  readonly hardwareId: string;
  readonly item: string;
  readonly messagesDigest: string;
  readonly sample: number;
}

export const executionKey = (k: ExecutionKey): string =>
  stableStringify([k.configDigest, k.hardwareId, k.item, k.messagesDigest, k.sample]);

/** One bundle's held executions, by {@link executionKey}. */
export type Held = ReadonlyMap<string, Execution>;

/**
 * Errors that are the model's own outcome (it ran out of tokens), not a
 * harness failure: an execution carrying one is held like any result.
 */
const MODEL_OUTCOME_ERRORS: ReadonlySet<string> = new Set([
  "context_exceeded",
  "thinking_truncated",
]);

/**
 * A bundle's held executions, keyed by {@link executionKey}: every execution
 * except a harness failure (any other `error`), which a rerun retries.
 */
export const heldOf = (header: BundleHeader, executions: ReadonlyArray<Execution>): Held => {
  const present = new Map<string, Execution>();
  for (const e of executions) {
    if (e.error !== null && !MODEL_OUTCOME_ERRORS.has(e.error)) continue;
    present.set(
      executionKey({
        configDigest: header.configDigest,
        hardwareId: header.env.hardwareId,
        item: e.item,
        messagesDigest: e.messagesDigest,
        sample: e.sample,
      }),
      e,
    );
  }
  return present;
};

const jsonlIn = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs
      .exists(dir)
      .pipe(Effect.mapError((cause) => new FileIOError({ path: dir, operation: "stat", cause })));
    if (!exists) return [];
    const names = yield* fs
      .readDirectory(dir)
      .pipe(Effect.mapError((cause) => new FileIOError({ path: dir, operation: "list", cause })));
    return names
      .filter((n) => n.endsWith(".jsonl") && !n.startsWith("."))
      .sort()
      .map((n) => path.join(dir, n));
  });

/**
 * Each sealed bundle's {@link heldOf}, one map per bundle. Each bundle is
 * verified as it is read; a bundle that fails verification fails the load.
 */
// ponytail: re-reads every sealed bundle per run; keep a persisted index when the store grows large.
export const loadPresent = (store: string) =>
  Effect.gen(function* () {
    const present: Held[] = [];
    for (const file of yield* jsonlIn(path.join(store, "bundles"))) {
      const b = yield* readBundle(file);
      present.push(heldOf(b.header, b.executions));
    }
    return present;
  });

/** The open bundle a run of this config × hardware × release × challenge continues, if any. */
export const findOpenBundle = (
  store: string,
  match: {
    readonly configDigest: string;
    readonly hardwareId: string;
    readonly release: string;
    readonly challenge: string;
  },
) =>
  Effect.gen(function* () {
    for (const file of yield* jsonlIn(openDir(store))) {
      const o: OpenBundle = yield* readOpenBundle(file);
      const h = o.header;
      if (
        h.configDigest === match.configDigest &&
        h.env.hardwareId === match.hardwareId &&
        h.release === match.release &&
        h.challenge === match.challenge
      ) {
        return o;
      }
    }
    return undefined;
  });
