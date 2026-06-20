/**
 * `submit` subcommand — run one configuration against one challenge.
 *
 * Loads configs.yaml + the given challenge YAML, resolves the config by id,
 * and calls `runChallenge` to execute the attempt end-to-end. Prints a
 * one-line aggregate summary on stdout.
 *
 * This is the proof-of-life wiring for Phase 1; the live model run is the
 * next task. The command lives under `src/cli/`, so `Date.now()`,
 * `console.*`, and `try`/`throw` are all allowed here.
 */
import { Command, Options } from "@effect/cli";
import { FetchHttpClient } from "@effect/platform";
import { Effect, Layer, Option } from "effect";
import { loadChallenge } from "../../config/challenges.js";
import { loadConfigurations } from "../../config/configurations.js";
import { loadPromptCorpus } from "../../config/prompt-corpus.js";
import { loadSystemPrompts, SystemPromptRegistry } from "../../config/system-prompts.js";
import { ChatCompletionLive } from "../../llm/chat-completion.js";
import { resumeChallenge, runChallenge } from "../../orchestration/run-challenge.js";
import { defaultRunEnv } from "../../orchestration/run-loop.js";
import { makeRunDeps } from "../deps.js";
import { makeLoggerLayer } from "../logger.js";
import { systemPromptsPath } from "../paths.js";

const printLine = (line: string): Effect.Effect<void> =>
  Effect.sync(() => {
    console.log(line);
  });

const configOpt = Options.text("config").pipe(
  Options.withDescription("Configuration id from configs.yaml"),
);

const challengeOpt = Options.file("challenge").pipe(
  Options.withDescription("Path to a challenge YAML"),
);

const promptsDirOpt = Options.directory("prompts-dir").pipe(
  Options.withDefault("prompts"),
  Options.withDescription("Directory containing prompt YAML files"),
);

const configsFileOpt = Options.file("configs-file").pipe(
  Options.withDefault("configs.yaml"),
  Options.withDescription("Path to configs YAML file"),
);

const archiveDirOpt = Options.directory("archive-dir").pipe(
  Options.withDefault("benchmark-archive"),
  Options.withDescription("Directory for archive output"),
);

const verboseOpt = Options.boolean("verbose").pipe(
  Options.withAlias("v"),
  Options.withDefault(false),
  Options.withDescription("Enable debug-level log output (intra-call detail)"),
);

const noCacheOpt = Options.boolean("no-cache").pipe(
  Options.withDefault(false),
  Options.withDescription("Bypass the cross-run item cache; always execute every item"),
);

const resumeOpt = Options.text("resume").pipe(
  Options.optional,
  Options.withDescription(
    "Resume an interrupted attempt by its attemptId (re-uses --config/--challenge to re-resolve)",
  ),
);

export const submitCommand = Command.make(
  "submit",
  {
    config: configOpt,
    challenge: challengeOpt,
    promptsDir: promptsDirOpt,
    configsFile: configsFileOpt,
    archiveDir: archiveDirOpt,
    verbose: verboseOpt,
    noCache: noCacheOpt,
    resume: resumeOpt,
  },
  ({ config, challenge, promptsDir, configsFile, archiveDir, verbose, noCache, resume }) =>
    Effect.gen(function* () {
      const systemPrompts = yield* loadSystemPrompts(systemPromptsPath(promptsDir));

      const registryLayer = Layer.succeed(SystemPromptRegistry, systemPrompts);

      const corpus = yield* loadPromptCorpus(promptsDir).pipe(Effect.provide(registryLayer));

      const configs = yield* loadConfigurations(configsFile).pipe(Effect.provide(registryLayer));

      const cfg = configs.find((c) => c.id === config);
      if (cfg === undefined) {
        return yield* Effect.dieMessage(`Unknown config id '${config}'`);
      }

      const resolved = yield* loadChallenge(challenge, corpus);

      const env = defaultRunEnv();
      const deps = makeRunDeps({});

      const manifest = yield* Option.match(resume, {
        onNone: () =>
          Effect.gen(function* () {
            const attemptId = `att-${cfg.configHash}-${resolved.challengeHash}-${Date.now()}`;
            return yield* runChallenge({
              config: cfg,
              challenge: resolved,
              attemptId,
              archiveDir,
              archivePath: `${archiveDir}/${attemptId}.jsonl`,
              env,
              deps,
              noCache,
            });
          }),
        onSome: (attemptId) =>
          resumeChallenge({
            config: cfg,
            challenge: resolved,
            attemptId,
            archiveDir,
            archivePath: `${archiveDir}/${attemptId}.jsonl`,
            env,
            deps,
            noCache,
          }),
      });

      yield* printLine(
        `submit: ${cfg.id} × ${resolved.id}@${resolved.version} → score ${manifest.aggregate.score.toFixed(2)} ${manifest.aggregate.passed ? "PASS" : "FAIL"}`,
      );
    }).pipe(
      Effect.provide(ChatCompletionLive),
      Effect.provide(FetchHttpClient.layer),
      Effect.provide(makeLoggerLayer(verbose)),
    ),
).pipe(Command.withDescription("Submit one configuration to one challenge"));
