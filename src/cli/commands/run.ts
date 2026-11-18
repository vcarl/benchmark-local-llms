/**
 * `run` subcommand — sweep matched configurations against matched challenges.
 *
 * Selects configurations (by id glob) and challenges (by file-stem glob) and
 * runs the full cross product via `runMatrix`: one model boot per configuration,
 * reused across that configuration's challenges. Prints a live per-cell line as
 * each cell resolves and an end-of-run grid, then regenerates the webapp report
 * unless `--no-report`. Lives under `src/cli/`, so `console.*` and `Date.now()`
 * are allowed here.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Command, Options } from "@effect/cli";
import { NodeHttpClient } from "@effect/platform-node";
import { Effect, Layer, Option } from "effect";
import { loadSelectedChallenges } from "../../config/challenges.js";
import { loadConfigurations } from "../../config/configurations.js";
import { itemMatcher, selectConfigs } from "../../config/select.js";
import { loadSystemPrompts, SystemPromptRegistry } from "../../config/system-prompts.js";
import { ChatCompletionLive } from "../../llm/chat-completion.js";
import { defaultRunEnv } from "../../orchestration/run-loop.js";
import { type MatrixChallenge, runMatrix } from "../../orchestration/run-matrix.js";
import type { RunModelDeps } from "../../orchestration/run-model.js";
import { runReport } from "../../report/index.js";
import { makeRunDeps } from "../deps.js";
import { makeLoggerLayer } from "../logger.js";
import { formatCellLine, formatMatrixGrid } from "../matrix-format.js";
import { DEFAULT_SYSTEM_PROMPTS_PATH } from "../paths.js";
import { logAuditBlock } from "./report.js";

const printLine = (line: string): Effect.Effect<void> =>
  Effect.sync(() => {
    console.log(line);
  });

export interface SweepArgs {
  readonly configsPattern: string | undefined;
  readonly challengesPattern: string | undefined;
  readonly challengesDir: string;
  readonly configsFile: string;
  readonly systemPromptsFile: string;
  readonly archiveDir: string;
  readonly output: string;
  readonly noCache: boolean;
  readonly noReport: boolean;
  /** Samples per item (default 1); with `items`, only matching items get more than one. */
  readonly samples?: number;
  /** `challengeId/itemName` globs selecting the items `samples` applies to. */
  readonly items?: ReadonlyArray<string> | undefined;
}

/** `--items` value: a file of patterns (one per line, `#` comments) or a comma list. */
export const parseItemsArg = (value: string): string[] =>
  (existsSync(value) ? readFileSync(value, "utf8").split("\n") : value.split(","))
    .map((l) => l.replace(/#.*/, "").trim())
    .filter((l) => l.length > 0);

/** Core sweep: select → load → runMatrix (live lines) → grid → report. Returns the grid. */
export const runSweep = (args: SweepArgs, deps: RunModelDeps) =>
  Effect.gen(function* () {
    const systemPrompts = yield* loadSystemPrompts(args.systemPromptsFile);
    const registryLayer = Layer.succeed(SystemPromptRegistry, systemPrompts);
    const allConfigs = yield* loadConfigurations(args.configsFile).pipe(
      Effect.provide(registryLayer),
    );

    const configs = selectConfigs(allConfigs, args.configsPattern);
    if (configs.length === 0) {
      return yield* Effect.dieMessage(
        args.configsPattern === undefined
          ? "no active configurations (all marked active: false); pass --configs"
          : `no configurations matched '${args.configsPattern}'`,
      );
    }

    const selected = yield* loadSelectedChallenges(args.challengesDir, args.challengesPattern);
    const stems = selected.stems;
    if (stems.length === 0) {
      return yield* Effect.dieMessage(
        args.challengesPattern === undefined
          ? `no challenge YAMLs found in '${args.challengesDir}'`
          : `no challenges matched '${args.challengesPattern}'`,
      );
    }
    const challenges: MatrixChallenge[] = [...selected.challenges];

    const samples = args.samples ?? 1;
    if (!Number.isInteger(samples) || samples < 1) {
      return yield* Effect.dieMessage(`--samples must be a positive integer (got ${samples})`);
    }
    const items = args.items;
    const unmatched = (items ?? []).filter((p) => {
      const m = itemMatcher([p]);
      return !challenges.some((c) => c.resolved.items.some((i) => m(c.resolved.id, i)));
    });
    if (unmatched.length > 0) {
      return yield* Effect.dieMessage(
        `--items matched no item in the selected challenges: ${unmatched.join(", ")}`,
      );
    }
    const selectedItem = items === undefined ? () => true : itemMatcher(items);

    const env = yield* defaultRunEnv();
    const cells = yield* runMatrix({
      configs,
      challenges,
      archiveDir: args.archiveDir,
      env,
      deps,
      noCache: args.noCache,
      samplesOf: (challengeId, item) => (selectedItem(challengeId, item) ? samples : 1),
      onCell: (cell, i, total) => printLine(formatCellLine(cell, i, total)),
    });

    const grid = formatMatrixGrid(
      cells,
      configs.map((c) => c.id),
      stems,
    );
    yield* printLine("");
    yield* printLine(grid);

    if (!args.noReport) {
      const outputPath = path.join(args.output, "data.js");
      const summary = yield* runReport({ archiveDir: args.archiveDir, outputPath });
      yield* logAuditBlock(summary);
    }
    return grid;
  });

const configsOpt = Options.text("configs").pipe(
  Options.optional,
  Options.withDescription("Glob over config ids (brace alternation ok). Default: all active."),
);
const challengesOpt = Options.text("challenges").pipe(
  Options.optional,
  Options.withDescription("Glob over challenge file stems. Default: all in --challenges-dir."),
);
const challengesDirOpt = Options.directory("challenges-dir").pipe(
  Options.withDefault("challenges"),
  Options.withDescription("Directory of challenge YAMLs"),
);
const systemPromptsFileOpt = Options.file("system-prompts-file").pipe(
  Options.withDefault(DEFAULT_SYSTEM_PROMPTS_PATH),
  Options.withDescription("Path to system-prompts YAML"),
);
const configsFileOpt = Options.file("configs-file").pipe(
  Options.withDefault("configs.yaml"),
  Options.withDescription("Path to configs YAML"),
);
const archiveDirOpt = Options.directory("archive-dir").pipe(
  Options.withDefault("benchmark-archive"),
  Options.withDescription("Directory for archive output"),
);
const outputOpt = Options.directory("output").pipe(
  Options.withDefault("./webapp/src/data"),
  Options.withDescription("Output dir for the post-sweep report's data.js"),
);
const verboseOpt = Options.boolean("verbose").pipe(
  Options.withAlias("v"),
  Options.withDefault(false),
  Options.withDescription("Enable debug-level log output"),
);
const noCacheOpt = Options.boolean("no-cache").pipe(
  Options.withDefault(false),
  Options.withDescription("Bypass the cross-attempt item cache"),
);
const samplesOpt = Options.integer("samples").pipe(
  Options.withDefault(1),
  Options.withDescription(
    "Generations per item (cached samples are reused; sample 0 is the single-run result)",
  ),
);
const itemsOpt = Options.text("items").pipe(
  Options.optional,
  Options.withDescription(
    "Items --samples applies to: a file of challengeId/itemName globs (one per line) or a comma list; others run once",
  ),
);
const noReportOpt = Options.boolean("no-report").pipe(
  Options.withDefault(false),
  Options.withDescription("Skip the end-of-sweep report regeneration"),
);

export const runCommand = Command.make(
  "run",
  {
    configs: configsOpt,
    challenges: challengesOpt,
    challengesDir: challengesDirOpt,
    systemPromptsFile: systemPromptsFileOpt,
    configsFile: configsFileOpt,
    archiveDir: archiveDirOpt,
    output: outputOpt,
    verbose: verboseOpt,
    noCache: noCacheOpt,
    noReport: noReportOpt,
    samples: samplesOpt,
    items: itemsOpt,
  },
  (o) =>
    runSweep(
      {
        configsPattern: Option.getOrUndefined(o.configs),
        challengesPattern: Option.getOrUndefined(o.challenges),
        challengesDir: o.challengesDir,
        configsFile: o.configsFile,
        systemPromptsFile: o.systemPromptsFile,
        archiveDir: o.archiveDir,
        output: o.output,
        noCache: o.noCache,
        noReport: o.noReport,
        samples: o.samples,
        items: Option.getOrUndefined(Option.map(o.items, parseItemsArg)),
      },
      makeRunDeps({}),
    ).pipe(
      Effect.asVoid,
      Effect.provide(ChatCompletionLive),
      // node:http, not global fetch: fetch/undici caps time-to-headers at 300s,
      // and a non-streaming server (mlx_lm) sends none until generation finishes,
      // so long completions died mid-flight as transport errors. node:http has no
      // such cap, leaving DEFAULT_PROMPT_TIMEOUT_SEC as the single authority.
      Effect.provide(NodeHttpClient.layer),
      Effect.provide(makeLoggerLayer(o.verbose)),
    ),
).pipe(Command.withDescription("Run matched configurations against matched challenges (sweep)"));
