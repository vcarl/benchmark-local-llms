/**
 * CLI entry point (§8). Wires the subcommand definitions (report, audit,
 * run, verify, score, release, legacy, dataset, export-eee, list-models,
 * list-prompts) into a
 * single `llm-bench` program and
 * hands off to `NodeRuntime.runMain`.
 *
 * This is the one module where the Effect runtime touches `process.argv`
 * and `process.exit` — everything downstream is pure Effect. No try/catch
 * here: `NodeRuntime.runMain` already encapsulates the sync/async boundary,
 * signal trapping, and exit codes, so the `scripts/lint-strict.sh` allowlist
 * entry for `src/cli/main.ts` is not actually exercised. We leave the
 * allowlist untouched.
 *
 * Keeping this file lean — it does no data wrangling of its own, just the
 * command composition and the entry call.
 */
import { Command } from "@effect/cli";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";
import { auditCommand } from "./commands/audit.js";
import { datasetCommand } from "./commands/dataset.js";
import { exportEeeCommand } from "./commands/export-eee.js";
import { legacyCommand } from "./commands/legacy.js";
import { listModelsCommand, listPromptsCommand } from "./commands/list.js";
import { releaseCommand } from "./commands/release.js";
import { reportCommand } from "./commands/report.js";
import { runCommand } from "./commands/run.js";
import { scoreCommand } from "./commands/score.js";
import { verifyCommand } from "./commands/verify.js";
import { installSubprocessSafetyNet } from "./subprocess-registry.js";

const root = Command.make("llm-bench").pipe(
  Command.withDescription("Benchmark local LLM runtimes and emit reports"),
  Command.withSubcommands([
    reportCommand,
    auditCommand,
    exportEeeCommand,
    listModelsCommand,
    listPromptsCommand,
    runCommand,
    verifyCommand,
    scoreCommand,
    releaseCommand,
    legacyCommand,
    datasetCommand,
  ]),
);

const cli = Command.run(root, {
  name: "llm-bench",
  version: "0.0.0",
});

export const program = (argv: ReadonlyArray<string>): Effect.Effect<void, unknown, never> =>
  cli(argv).pipe(Effect.provide(NodeContext.layer)) as Effect.Effect<void, unknown, never>;

// Safety net for subprocess lifecycle: catches SIGHUP, uncaughtException,
// and any `exit` path that bypasses Effect's scoped finalizer. Must run
// before anything spawns a subprocess.
installSubprocessSafetyNet();

// Entry: @effect/cli's `Command.run` expects process.argv-style input
// (node bin + script path + args) and strips the first two internally.
NodeRuntime.runMain(program(process.argv));
