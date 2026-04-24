/**
 * Resolve a llama.cpp model's local .gguf path in the HuggingFace cache.
 * Port of `runner.py::resolve_llamacpp_gguf`.
 *
 * Input: HuggingFace artifact string (e.g. "Qwen/Qwen3.5-9B-GGUF") + quant
 * label (e.g. "Q8_0"). Output: absolute path to the first matching .gguf
 * file in `~/.cache/huggingface/hub/models--<artifact>/`, or a typed failure.
 *
 * The quant regex requires the quant to be preceded by `-` or `.` and
 * followed by `.gguf` or `-<digit>` (for multi-shard archives); this mirrors
 * the prototype so migrated archives stay consistent with fresh runs. For
 * multi-shard models we return the first shard — llama-server auto-discovers
 * the rest.
 */
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { Effect } from "effect";
import { ServerSpawnError } from "../../errors/index.js";

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// HuggingFace cache layout: `snapshots/<sha>/*` are symlinks into `blobs/`,
// so a plain `Dirent.isFile()` check returns false on the .gguf entries.
// Treat symlinks as candidates and validate via `existsSync` (which follows
// symlinks and returns false on broken ones).
const walkGgufs = (root: string): ReadonlyArray<string> => {
  const out: string[] = [];
  const visit = (dir: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full);
      } else if (entry.name.endsWith(".gguf") && (entry.isFile() || entry.isSymbolicLink())) {
        if (existsSync(full)) out.push(full);
      }
    }
  };
  if (existsSync(root)) visit(root);
  return out;
};

export const resolveLlamacppGguf = (
  artifact: string,
  quant: string,
): Effect.Effect<string, ServerSpawnError> =>
  Effect.sync((): string | undefined => {
    const cacheDirName = `models--${artifact.replace(/\//g, "--")}`;
    const modelCache = path.join(homedir(), ".cache", "huggingface", "hub", cacheDirName);
    const quantRe = new RegExp(`(?:[-.])${escapeRegex(quant)}(?:\\.gguf|-\\d)`, "i");
    const candidates = walkGgufs(modelCache).filter((p) => quantRe.test(path.basename(p)));
    candidates.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
    return candidates[0];
  }).pipe(
    Effect.flatMap(
      (found): Effect.Effect<string, ServerSpawnError> =>
        found === undefined
          ? Effect.fail(
              new ServerSpawnError({
                runtime: "llamacpp",
                reason: `No cached .gguf for ${artifact} (quant=${quant}). Run \`huggingface-cli download ${artifact}\` or adjust models.yaml.`,
              }),
            )
          : Effect.succeed(found),
    ),
  );
