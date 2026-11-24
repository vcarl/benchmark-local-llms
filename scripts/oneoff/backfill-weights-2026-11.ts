/**
 * One-time, pre-release backfill (2026-11-25). Bundles run before the weights
 * digest existed (2026-11-21) record `weightsDigest: null`, so a run under the
 * current config (which pins the weights) never reuses them. For each config
 * named on the command line, and each draft challenge, this takes the newest
 * sealed null-weights bundle that holds every current item (same config
 * otherwise, this machine, current prompts: the `run` skip rule) and writes a
 * copy whose header adds today's `weightsDigest`, with `source` naming the
 * original bundle. Executions, run id and timestamps are unchanged.
 *
 * Qualification (else the script stops; nothing is written for that config):
 * every draft challenge is covered, except `configId:challenge` pairs passed in
 * --allow-missing, and every weights file (symlink and target) was last
 * modified before the earliest copied run started, so those bytes were on disk
 * during the run.
 *
 * Dry run unless --write. Prints one JSON ledger entry per config to stdout.
 * Usage: tsx scripts/oneoff/backfill-weights-2026-11.ts [--write] [--allow-missing id:challenge,...] <configId>...
 */
import { existsSync, lstatSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect, Layer, Option } from "effect";
import { loadSelectedChallenges } from "../../src/config/challenges.js";
import { loadConfigurations } from "../../src/config/configurations.js";
import { stableStringify } from "../../src/config/hashing.js";
import { loadSystemPrompts, SystemPromptRegistry } from "../../src/config/system-prompts.js";
import { chatMessages } from "../../src/llm/chat-completion.js";
import { resolveLlamacppGguf } from "../../src/llm/servers/resolve-gguf.js";
import { resolveMlxModel } from "../../src/llm/servers/resolve-mlx.js";
import { bundleConfig } from "../../src/orchestration/run-challenge.js";
import { defaultRunEnv } from "../../src/orchestration/run-loop.js";
import { type BundleHeader, readBundle, type VerifiedBundle } from "../../src/store/bundle.js";
import { digestOf, sha256Hex } from "../../src/store/digest.js";
import { executionKey, heldOf } from "../../src/store/store-index.js";
import { ggufShards, weightsDigest } from "../../src/store/weights.js";

const STORE = "store";
const argv = process.argv.slice(2);
const write = argv.includes("--write");
const am = argv.indexOf("--allow-missing");
const allowMissing = new Set(am >= 0 ? (argv[am + 1] ?? "").split(",") : []);
const ids = argv.filter((a, i) => !a.startsWith("--") && !(am >= 0 && i === am + 1));

const weightFiles = (c: { artifact: string; runtime: string; quant?: string | undefined }) =>
  Effect.gen(function* () {
    if (c.runtime === "llamacpp") {
      if (c.quant === undefined) return [];
      const f = yield* Effect.option(resolveLlamacppGguf(c.artifact, c.quant));
      return Option.isNone(f) ? [] : ggufShards(f.value, readdirSync(path.dirname(f.value)));
    }
    const d = yield* Effect.option(resolveMlxModel(c.artifact));
    return Option.isNone(d)
      ? []
      : readdirSync(d.value)
          .filter((n) => n.endsWith(".safetensors"))
          .sort()
          .map((n) => path.join(d.value, n));
  });

type Old = { b: VerifiedBundle; held: ReturnType<typeof heldOf>; digest: string };

const main = Effect.gen(function* () {
  const sp = yield* loadSystemPrompts("system-prompts.yaml");
  const all = yield* loadConfigurations("configs.yaml").pipe(
    Effect.provide(Layer.succeed(SystemPromptRegistry, sp)),
  );
  const { challenges } = yield* loadSelectedChallenges("releases/draft/challenges", undefined);
  const env = yield* defaultRunEnv();
  const old: Old[] = [];
  for (const n of readdirSync(path.join(STORE, "bundles")).filter((n) => /^[0-9a-f]{64}\.jsonl$/.test(n))) {
    const b = yield* readBundle(path.join(STORE, "bundles", n));
    if (b.header.config.weightsDigest !== null) continue;
    old.push({ b, held: heldOf(b.header, b.executions), digest: n.slice(0, 64) });
  }

  for (const id of ids) {
    const c = all.find((x) => x.id === id);
    if (!c) throw new Error(`${id}: not in configs.yaml`);
    const nullDigest = digestOf(bundleConfig(c, null));
    const picks: Array<{ challenge: string; from: Old }> = [];
    const missing: string[] = [];
    for (const ch of challenges) {
      const keys = ch.resolved.items.map((item) =>
        executionKey({
          configDigest: nullDigest,
          hardwareId: env.hardwareId,
          item: `${ch.resolved.id}/${item.itemId}`,
          messagesDigest: digestOf(
            chatMessages({
              systemPrompt: c.systemPromptText,
              userPrompt: item.prompt.promptText,
              ...(item.prompt.history === undefined ? {} : { history: item.prompt.history }),
            }),
          ),
          sample: 0,
        }),
      );
      // Newest by run.startedAt, tie: lower digest (the report's cell rule).
      const cov = old
        .filter((o) => keys.every((k) => o.held.has(k)))
        .sort(
          (a, b) =>
            b.b.header.run.startedAt.localeCompare(a.b.header.run.startedAt) ||
            a.digest.localeCompare(b.digest),
        )[0];
      if (cov) picks.push({ challenge: ch.resolved.id, from: cov });
      else missing.push(ch.resolved.id);
    }
    const unexcused = missing.filter((m) => !allowMissing.has(`${id}:${m}`));
    if (unexcused.length > 0)
      throw new Error(`${id}: no complete null-weights bundle for ${unexcused.join(",")}`);

    const files = yield* weightFiles(c);
    if (files.length === 0) throw new Error(`${id}: weights not found`);
    const weights = files.map((f) => ({
      file: path.basename(f),
      mtime: new Date(Math.max(statSync(f).mtimeMs, lstatSync(f).mtimeMs)).toISOString(),
    }));
    const newestWeights = weights.map((m) => m.mtime).sort().at(-1) as string;
    const earliestRun = picks.map((p) => p.from.b.header.run.startedAt).sort()[0] as string;
    if (!(newestWeights < earliestRun))
      throw new Error(`${id}: weights ${newestWeights} not before run ${earliestRun}`);

    const wd = yield* weightsDigest(STORE, c);
    if (wd === null) throw new Error(`${id}: weights digest null`);

    const bundles: Array<{ challenge: string; from: string; to: string }> = [];
    for (const p of picks) {
      const h = p.from.b.header;
      const config = { ...h.config, weightsDigest: wd };
      const header: BundleHeader = {
        ...h,
        config,
        configDigest: digestOf(config),
        source: { file: `bundles/${p.from.digest}.jsonl`, sha256: p.from.digest },
      };
      const text = [header, ...p.from.b.executions].map((o) => `${stableStringify(o)}\n`).join("");
      const to = sha256Hex(text);
      if (write) {
        const target = path.join(STORE, "bundles", `${to}.jsonl`);
        if (!existsSync(target)) {
          const tmp = path.join(STORE, "bundles", `.${to}.tmp`);
          writeFileSync(tmp, text);
          renameSync(tmp, target);
        }
        yield* readBundle(target); // the verifying reader must accept it
      }
      bundles.push({ challenge: p.challenge, from: p.from.digest, to });
    }
    console.log(
      JSON.stringify({ configId: id, weightsDigest: wd, weights, newestWeights, earliestRun, notCovered: missing, bundles }),
    );
  }
});

Effect.runPromise(main.pipe(Effect.provide(NodeContext.layer))).catch((e) => {
  console.error(String(e));
  process.exit(1);
});
