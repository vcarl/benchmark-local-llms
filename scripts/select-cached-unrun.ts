/**
 * Print the `./bench run --configs '{…}'` command for every config whose model
 * is cached locally but that does NOT yet have full archive coverage across the
 * selected challenges.
 *
 *   "cached"        — the runner's own resolver finds the model in the HF cache
 *                     (resolveLlamacppGguf / resolveMlxModel — same check boot uses).
 *   "full coverage" — every selected challenge already has a FINALIZED attempt
 *                     (att-<configHash>-<challengeHash>-*.jsonl with interrupted:false)
 *                     in the archive dir.
 *
 * A config is selected to run iff (cached && !fullCoverage).
 *
 * Run: node_modules/.bin/tsx scripts/select-cached-unrun.ts [configsFile] [challengesDir] [challengesGlob]
 *   ARCHIVE_DIR env overrides the archive dir (default: benchmark-archive).
 */
import { NodeContext } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { listChallengeFiles, loadChallenge } from "../src/config/challenges.js";
import { loadConfigurations } from "../src/config/configurations.js";
import { selectChallengeStems, selectConfigs } from "../src/config/select.js";
import { loadSystemPrompts, SystemPromptRegistry } from "../src/config/system-prompts.js";
import { DEFAULT_SYSTEM_PROMPTS_PATH } from "../src/cli/paths.js";
import { resolveLlamacppGguf } from "../src/llm/servers/resolve-gguf.js";
import { resolveMlxModel } from "../src/llm/servers/resolve-mlx.js";

const configsFile = process.argv[2] ?? "configs.yaml";
const challengesDir = process.argv[3] ?? "challenges";
const challengesGlob = process.argv[4]; // optional; default = all in dir
const archiveDir = process.env.ARCHIVE_DIR ?? "benchmark-archive";

/** configHash|challengeHash pairs that already have a finalized attempt on disk. */
const finalizedPairs = (): Set<string> => {
  const out = new Set<string>();
  if (!existsSync(archiveDir)) return out;
  for (const f of readdirSync(archiveDir)) {
    const m = /^att-([0-9a-f]{12})-([0-9a-f]{12})-\d+\.jsonl$/.exec(f);
    if (m === null) continue;
    try {
      const firstLine = readFileSync(path.join(archiveDir, f), "utf8").split("\n", 1)[0] ?? "";
      const header = JSON.parse(firstLine) as { interrupted?: unknown; finishedAt?: unknown };
      if (header.interrupted === false && typeof header.finishedAt === "string") {
        out.add(`${m[1]}|${m[2]}`);
      }
    } catch {
      // unreadable / partial line → not a finalized attempt
    }
  }
  return out;
};

const isCached = (cfg: { artifact: string; runtime: string; quant?: string | undefined }) =>
  (cfg.runtime === "mlx"
    ? resolveMlxModel(cfg.artifact)
    : resolveLlamacppGguf(cfg.artifact, cfg.quant ?? "")
  ).pipe(
    Effect.as(true),
    Effect.catchAll(() => Effect.succeed(false)),
  );

const program = Effect.gen(function* () {
  const systemPrompts = yield* loadSystemPrompts(DEFAULT_SYSTEM_PROMPTS_PATH);
  const registryLayer = Layer.succeed(SystemPromptRegistry, systemPrompts);
  const allConfigs = yield* loadConfigurations(configsFile).pipe(Effect.provide(registryLayer));
  // Honor the same active gate the runner applies for a bare `./bench run`:
  // `active: false` configs are excluded unless explicitly globbed.
  const configs = selectConfigs(allConfigs);
  const inactive = allConfigs.filter((c) => !configs.includes(c)).map((c) => c.id);

  const files = yield* listChallengeFiles(challengesDir);
  const stems = selectChallengeStems(
    files.map((f) => f.stem),
    challengesGlob,
  );
  const chosen = files.filter((f) => stems.includes(f.stem));
  const challenges = yield* Effect.forEach(chosen, (f) =>
    loadChallenge(f.path).pipe(
      Effect.map((r) => ({ stem: f.stem, challengeHash: r.challengeHash })),
    ),
  );

  const done = finalizedPairs();
  const rows = yield* Effect.forEach(configs, (cfg) =>
    isCached(cfg).pipe(
      Effect.map((cached) => {
        const missing = challenges.filter((ch) => !done.has(`${cfg.configHash}|${ch.challengeHash}`));
        return { id: cfg.id, runtime: cfg.runtime, cached, missing: missing.map((m) => m.stem) };
      }),
    ),
  );

  return { challenges: challenges.map((c) => c.stem), rows, inactive };
});

Effect.runPromise(program.pipe(Effect.provide(NodeContext.layer)))
  .then(({ challenges, rows, inactive }) => {
    console.log(`challenges in scope (${challenges.length}): ${challenges.join(", ")}`);
    console.log(`archive dir: ${archiveDir}`);
    if (inactive.length > 0) {
      console.log(`inactive (active: false, excluded unless globbed): ${inactive.join(", ")}`);
    }
    console.log("");
    const pad = Math.max(...rows.map((r) => r.id.length), 4);
    console.log(`${"CONFIG".padEnd(pad)}  CACHED  COVERAGE   → RUN?`);
    for (const r of rows) {
      const cov = `${challenges.length - r.missing.length}/${challenges.length}`;
      const run = r.cached && r.missing.length > 0;
      const why = !r.cached ? "not cached" : r.missing.length === 0 ? "fully covered" : `missing ${r.missing.length}`;
      console.log(`${r.id.padEnd(pad)}  ${r.cached ? "yes " : "NO  "}   ${cov.padEnd(8)}   ${run ? "RUN" : "skip"}  (${why})`);
    }
    const toRun = rows.filter((r) => r.cached && r.missing.length > 0).map((r) => r.id);
    console.log("");
    if (toRun.length === 0) {
      console.log("Nothing to run: every cached config already has full coverage.");
      return;
    }
    const sel = toRun.length === 1 ? toRun[0] : `{${toRun.join(",")}}`;
    const chArg = challengesGlob ? ` --challenges '${challengesGlob}'` : "";
    console.log(`# ${toRun.length} config(s) to run:`);
    console.log(`./bench run --configs '${sel}'${chArg}`);
  })
  .catch((err) => {
    console.error("select-cached-unrun failed:");
    console.error(err);
    process.exit(1);
  });
