import type { CommandExecutor } from "@effect/platform";
import { Effect } from "effect";
import {
  type CodeExecFailed,
  type CodeExecTimeout,
  ScorerNotFound,
  type ScorerSpawnFailed,
} from "../errors/index.js";
import type { ScorerConfig } from "../schema/scorer.js";
import { scoreCodeExec } from "./code-exec.js";
import { scoreConstraints } from "./constraint.js";
import { scoreCustom } from "./custom.js";
import { scoreExactMatch } from "./exact-match.js";
import { scoreOrderedMatch } from "./ordered-match.js";
import type { PromptScore } from "./score-result.js";
import { scoreSetMatch } from "./set-match.js";

/**
 * {@link scoreByConfig} with scorer failures (timeout, crash, spawn failure,
 * unknown scorer) folded into a zero score tagged `failure: "scorer_error"`,
 * so one broken scorer records a classified 0 rather than crashing the run.
 */
export const scoreOrFold = (
  output: string,
  cfg: ScorerConfig,
  meta: Record<string, unknown> = {},
): Effect.Effect<PromptScore, never, CommandExecutor.CommandExecutor> =>
  scoreByConfig(output, cfg, meta).pipe(
    Effect.catchAll((e) =>
      Effect.succeed<PromptScore>({
        kind: "prompt",
        score: 0,
        details: `scorer error: ${JSON.stringify(e).slice(0, 200)}`,
        failure: "scorer_error",
      }),
    ),
  );

/** Dispatch a prompt-style scorer config to its scorer. Game scorers are handled separately. */
export const scoreByConfig = (
  output: string,
  cfg: ScorerConfig,
  meta: Record<string, unknown> = {},
): Effect.Effect<
  PromptScore,
  ScorerNotFound | CodeExecTimeout | CodeExecFailed | ScorerSpawnFailed,
  CommandExecutor.CommandExecutor
> => {
  switch (cfg.type) {
    case "exact_match":
      return scoreExactMatch(output, cfg);
    case "constraint":
      return scoreConstraints(output, cfg);
    case "code_exec":
      return scoreCodeExec(output, cfg.testCode, { submission: cfg.submission });
    case "set_match":
      return scoreSetMatch(output, cfg);
    case "ordered_match":
      return scoreOrderedMatch(output, cfg);
    case "custom":
      return scoreCustom(output, cfg.source, meta);
    case "game":
      return Effect.fail(new ScorerNotFound({ scorerName: cfg.gameScorer }));
  }
};
