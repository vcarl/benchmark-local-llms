/**
 * `weightsDigest`: the SHA-256 of the weights the server loads. For llama.cpp
 * that is the GGUF file (the digest of its sorted `[shard, sha256]` pairs when
 * split); for mlx/omlx the digest of the sorted `[shard, sha256]` pairs of the
 * model directory's `*.safetensors`. `null` when the weights cannot be located.
 *
 * Files are hashed by streaming and cached in `<store>/weights.json` keyed by
 * absolute path, valid while size and mtime match, so each artifact is hashed
 * once.
 *
 * `weightsSource`: the Hugging Face repo and revision those files sit in
 * (`…/models--<org>--<name>/snapshots/<revision>/`) and when the hub published
 * that revision, for the bundle's `env` (docs/EVAL-TIMING.md).
 */

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import * as fsp from "node:fs/promises";
import path from "node:path";
import { HttpClient, HttpClientResponse } from "@effect/platform";
import { Duration, Effect, Option, Schema } from "effect";
import { FileIOError } from "../errors/index.js";
import { resolveLlamacppGguf } from "../llm/servers/resolve-gguf.js";
import { resolveMlxModel } from "../llm/servers/resolve-mlx.js";
import type { Runtime } from "../schema/enums.js";
import type { WeightsSource } from "./bundle.js";
import { digestOf } from "./digest.js";

interface HashedFile {
  readonly size: number;
  readonly mtimeMs: number;
  readonly sha256: string;
}

const SPLIT = /^(.*)-\d{5}-of-(\d{5})\.gguf$/;

/** The files llama.cpp loads for `file`: itself, or every shard of a split GGUF in its directory. */
export const ggufShards = (file: string, siblings: ReadonlyArray<string>): string[] => {
  const m = SPLIT.exec(path.basename(file));
  if (m === null) return [file];
  const [, stem, total] = m;
  return siblings
    .filter((n) => SPLIT.exec(n)?.[1] === stem && n.endsWith(`-of-${total}.gguf`))
    .sort()
    .map((n) => path.join(path.dirname(file), n));
};

const ioErr = (p: string, operation: string) => (cause: unknown) =>
  new FileIOError({ path: p, operation, cause });

const hashFile = (file: string) =>
  Effect.tryPromise({
    try: async () => {
      const h = createHash("sha256");
      for await (const chunk of createReadStream(file)) h.update(chunk as Buffer);
      return h.digest("hex");
    },
    catch: ioErr(file, "hash"),
  });

const locate = (model: { artifact: string; runtime: Runtime; quant?: string | undefined }) =>
  Effect.gen(function* () {
    if (model.runtime === "llamacpp") {
      if (model.quant === undefined) return undefined;
      const file = yield* Effect.option(resolveLlamacppGguf(model.artifact, model.quant));
      if (Option.isNone(file)) return undefined;
      const siblings = yield* Effect.tryPromise({
        try: () => fsp.readdir(path.dirname(file.value)),
        catch: ioErr(file.value, "list"),
      });
      return ggufShards(file.value, siblings);
    }
    const dir = yield* Effect.option(resolveMlxModel(model.artifact));
    if (Option.isNone(dir)) return undefined;
    const names = yield* Effect.tryPromise({
      try: () => fsp.readdir(dir.value),
      catch: ioErr(dir.value, "list"),
    });
    return names
      .filter((n) => n.endsWith(".safetensors"))
      .sort()
      .map((n) => path.join(dir.value, n));
  });

export const weightsDigest = (
  store: string,
  model: { artifact: string; runtime: Runtime; quant?: string | undefined },
) =>
  Effect.gen(function* () {
    const files = yield* locate(model);
    if (files === undefined || files.length === 0) return null;

    const cachePath = path.join(store, "weights.json");
    const cache: Record<string, HashedFile> = yield* Effect.tryPromise({
      try: () => fsp.readFile(cachePath, "utf8").then((t) => JSON.parse(t)),
      catch: ioErr(cachePath, "read"),
    }).pipe(Effect.orElseSucceed(() => ({})));

    let dirty = false;
    const pairs: Array<[string, string]> = [];
    for (const file of files) {
      const abs = path.resolve(file);
      const st = yield* Effect.tryPromise({ try: () => fsp.stat(abs), catch: ioErr(abs, "stat") });
      const hit = cache[abs];
      let sha = hit?.sha256;
      if (hit === undefined || hit.size !== st.size || hit.mtimeMs !== st.mtime.getTime()) {
        sha = yield* hashFile(abs);
        cache[abs] = { size: st.size, mtimeMs: st.mtime.getTime(), sha256: sha };
        dirty = true;
      }
      pairs.push([path.basename(file), sha as string]);
    }
    if (dirty) {
      yield* Effect.tryPromise({
        try: async () => {
          await fsp.mkdir(store, { recursive: true });
          await fsp.writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
        },
        catch: ioErr(cachePath, "write"),
      });
    }
    const [only] = pairs;
    return model.runtime === "llamacpp" && pairs.length === 1 && only !== undefined
      ? only[1]
      : digestOf(pairs);
  });

/** The hub repo and revision of a file in the Hugging Face cache; null outside it. */
export const hfRevisionOf = (file: string): { repo: string; revision: string } | null => {
  // Hub repo ids never contain `--`, so the first `--` separates org from name.
  const m = /\/models--([\w.-]+?)--([\w.-]+)\/snapshots\/([0-9a-f]{40})\//.exec(file);
  return m === null ? null : { repo: `${m[1]}/${m[2]}`, revision: m[3] as string };
};

const HubRevision = Schema.Struct({ sha: Schema.String, lastModified: Schema.String });

/**
 * When the hub published `revision` of `repo`: the `lastModified` of
 * `GET /api/models/<repo>/revision/<sha>`, which is that revision's commit
 * time (`createdAt` there is the repo's). The request carries only the public
 * repo id and revision. Any failure (offline, 5 s timeout, non-2xx, another
 * sha in the reply) is null.
 */
export const revisionPublishedAt = (repo: string, revision: string) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const res = yield* client
      .get(`https://huggingface.co/api/models/${repo}/revision/${revision}`)
      .pipe(Effect.flatMap(HttpClientResponse.filterStatusOk));
    const body = yield* HttpClientResponse.schemaBodyJson(HubRevision)(res);
    const at = new Date(body.lastModified);
    return body.sha === revision && !Number.isNaN(at.getTime()) ? at.toISOString() : null;
  }).pipe(
    Effect.timeout(Duration.seconds(5)),
    Effect.orElseSucceed(() => null),
  );

/** The located weights' hub revision and its publication time; null when they are not in the hub cache. */
export const weightsSource = (model: {
  artifact: string;
  runtime: Runtime;
  quant?: string | undefined;
}): Effect.Effect<WeightsSource | null, never, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const files = yield* locate(model).pipe(Effect.orElseSucceed(() => undefined));
    const source = files?.[0] === undefined ? null : hfRevisionOf(files[0]);
    if (source === null) return null;
    return { ...source, publishedAt: yield* revisionPublishedAt(source.repo, source.revision) };
  });
