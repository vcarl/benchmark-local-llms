/**
 * Resolve a cached MLX model's local snapshot path. Mirror of
 * `resolveLlamacppGguf` for the MLX path.
 *
 * `./bench run` is a pure-execution phase; downloading models is an explicit
 * out-of-tool step (`hf download <artifact>`). Without this
 * pre-check, `mlx_lm.load()` silently calls `snapshot_download()` when given
 * a HF repo id, quietly violating the load/run separation. Passing mlx_lm a
 * local directory path skips the hub roundtrip entirely.
 *
 * A "cached" MLX model here means: a snapshot directory exists under
 * `~/.cache/huggingface/hub/models--<artifact>/snapshots/<sha>/` that
 * contains both a resolvable `config.json` and at least one resolvable
 * `.safetensors` file. (Files in HF cache are symlinks into `blobs/`; a
 * broken symlink — e.g. from an interrupted download — fails `existsSync`.)
 *
 * An artifact may instead be a path — absolute, `~`-relative, or `./`-relative
 * — naming a model directory directly. That covers weights that never came
 * from the hub: locally converted, re-quantized, or hand-assembled checkpoints
 * (e.g. a base model with merged MTP heads). The same two files are required,
 * checked in the directory itself rather than in a snapshot. Such a config is
 * machine-specific by construction: the path is what lands in the archive's
 * `artifact` field, and it will not resolve on another machine.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { Effect } from "effect";
import { ServerSpawnError } from "../../errors/index.js";

const DEFAULT_CACHE_ROOT = path.join(homedir(), ".cache", "huggingface", "hub");

const cacheDirFor = (cacheRoot: string, artifact: string): string =>
  path.join(cacheRoot, `models--${artifact.replace(/\//g, "--")}`);

/**
 * True when `artifact` names a filesystem path rather than a HuggingFace repo
 * id. Repo ids are `org/name` with no leading `/`, `~/`, or `./`, so the three
 * prefixes are unambiguous.
 */
export const isPathArtifact = (artifact: string): boolean =>
  artifact.startsWith("/") || artifact.startsWith("~/") || artifact.startsWith("./");

/** Expand a leading `~/` against the current user's home directory. */
const expandHome = (p: string): string =>
  p.startsWith("~/") ? path.join(homedir(), p.slice(2)) : p;

/**
 * Validate a directly-named model directory. Returns its absolute path, or
 * undefined when it is missing or lacks the files a loader needs.
 */
export const findModelDir = (artifact: string): string | undefined => {
  const dir = path.resolve(expandHome(artifact));
  // `throwIfNoEntry: false` reports a missing path as `undefined`, keeping
  // this a pure predicate rather than a raising call.
  const stat = statSync(dir, { throwIfNoEntry: false });
  if (stat === undefined || !stat.isDirectory()) return undefined;
  const entries = readdirSync(dir);
  if (!entries.includes("config.json") || !existsSync(path.join(dir, "config.json"))) {
    return undefined;
  }
  const hasWeight = entries.some(
    (e) => e.endsWith(".safetensors") && existsSync(path.join(dir, e)),
  );
  return hasWeight ? dir : undefined;
};

/**
 * Pure, testable snapshot finder. Returns the absolute path of a snapshot
 * dir containing the required files, or undefined.
 */
export const findMlxSnapshot = (cacheRoot: string, artifact: string): string | undefined => {
  const snapshotsRoot = path.join(cacheDirFor(cacheRoot, artifact), "snapshots");
  if (!existsSync(snapshotsRoot)) return undefined;
  const snapshots = readdirSync(snapshotsRoot, { withFileTypes: true }).filter((e) =>
    e.isDirectory(),
  );
  // Prefer the alphabetically-latest sha — if a repo has been re-downloaded
  // the newer snapshot wins, and the blobs of older snapshots may have been
  // pruned by hf's garbage collector.
  snapshots.sort((a, b) => b.name.localeCompare(a.name));
  for (const snap of snapshots) {
    const dir = path.join(snapshotsRoot, snap.name);
    const entries = readdirSync(dir);
    const configPath = path.join(dir, "config.json");
    if (!entries.includes("config.json") || !existsSync(configPath)) continue;
    const hasWeight = entries.some(
      (e) => e.endsWith(".safetensors") && existsSync(path.join(dir, e)),
    );
    if (hasWeight) return dir;
  }
  return undefined;
};

export interface ResolveMlxOptions {
  /**
   * Runtime tag stamped onto the `ServerSpawnError` when nothing is cached.
   * `omlx` consumes the same MLX safetensors artifacts as `mlx`, so it reuses
   * this resolver and passes its own tag to keep the error accurate.
   */
  readonly runtime?: "mlx" | "omlx";
  /** HF hub cache root. Defaults to `~/.cache/huggingface/hub`. */
  readonly cacheRoot?: string;
}

export const resolveMlxModel = (
  artifact: string,
  options: ResolveMlxOptions = {},
): Effect.Effect<string, ServerSpawnError> =>
  Effect.sync(() =>
    isPathArtifact(artifact)
      ? findModelDir(artifact)
      : findMlxSnapshot(options.cacheRoot ?? DEFAULT_CACHE_ROOT, artifact),
  ).pipe(
    Effect.flatMap((found) =>
      found === undefined
        ? Effect.fail(
            new ServerSpawnError({
              runtime: options.runtime ?? "mlx",
              reason: isPathArtifact(artifact)
                ? `No usable MLX model directory at ${artifact}. It must exist and hold a config.json plus at least one .safetensors file.`
                : `No cached MLX model for ${artifact}. Run \`hf download ${artifact}\` or adjust configs.yaml.`,
            }),
          )
        : Effect.succeed(found),
    ),
  );
