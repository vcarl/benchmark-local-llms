/**
 * Resolve a cached MLX model's local snapshot path. Mirror of
 * `resolveLlamacppGguf` for the MLX path.
 *
 * `./bench run` is a pure-execution phase; downloading models is an explicit
 * out-of-tool step (`huggingface-cli download <artifact>`). Without this
 * pre-check, `mlx_lm.load()` silently calls `snapshot_download()` when given
 * a HF repo id, quietly violating the load/run separation. Passing mlx_lm a
 * local directory path skips the hub roundtrip entirely.
 *
 * A "cached" MLX model here means: a snapshot directory exists under
 * `~/.cache/huggingface/hub/models--<artifact>/snapshots/<sha>/` that
 * contains both a resolvable `config.json` and at least one resolvable
 * `.safetensors` file. (Files in HF cache are symlinks into `blobs/`; a
 * broken symlink — e.g. from an interrupted download — fails `existsSync`.)
 */
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { Effect } from "effect";
import { ServerSpawnError } from "../../errors/index.js";

const DEFAULT_CACHE_ROOT = path.join(homedir(), ".cache", "huggingface", "hub");

const cacheDirFor = (cacheRoot: string, artifact: string): string =>
  path.join(cacheRoot, `models--${artifact.replace(/\//g, "--")}`);

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

export const resolveMlxModel = (artifact: string): Effect.Effect<string, ServerSpawnError> =>
  Effect.sync(() => findMlxSnapshot(DEFAULT_CACHE_ROOT, artifact)).pipe(
    Effect.flatMap((found) =>
      found === undefined
        ? Effect.fail(
            new ServerSpawnError({
              runtime: "mlx",
              reason: `No cached MLX model for ${artifact}. Run \`huggingface-cli download ${artifact}\` or adjust models.yaml.`,
            }),
          )
        : Effect.succeed(found),
    ),
  );
