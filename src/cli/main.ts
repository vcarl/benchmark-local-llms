/**
 * CLI entry point (§8). Wires the subcommand definitions (run, report,
 * score, list-models, list-prompts, migrate) into a single `llm-bench`
 * program and hands off to `NodeRuntime.runMain`.
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
import { listModelsCommand, listPromptsCommand } from "./commands/list.js";
import { migrateCommand } from "./commands/migrate.js";
import { reportCommand } from "./commands/report.js";
import { runCommand } from "./commands/run.js";
import { scoreCommand } from "./commands/score.js";

const root = Command.make("llm-bench").pipe(
  Command.withDescription("Benchmark local LLM runtimes and emit reports"),
  Command.withSubcommands([
    runCommand,
    reportCommand,
    scoreCommand,
    listModelsCommand,
    listPromptsCommand,
    migrateCommand,
  ]),
);

const cli = Command.run(root, {
  name: "llm-bench",
  version: "0.0.0",
});

export const program = (argv: ReadonlyArray<string>): Effect.Effect<void, unknown, never> =>
  cli(argv).pipe(Effect.provide(NodeContext.layer)) as Effect.Effect<void, unknown, never>;

// Entry: @effect/cli's `Command.run` expects process.argv-style input
// (node bin + script path + args) and strips the first two internally.
NodeRuntime.runMain(program(process.argv));
