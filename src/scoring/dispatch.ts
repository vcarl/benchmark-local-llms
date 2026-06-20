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
import type { PromptScore } from "./score-result.js";

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
      return scoreCodeExec(output, cfg.testCode);
    case "custom":
      return scoreCustom(output, cfg.script, meta);
    case "game":
      return Effect.fail(new ScorerNotFound({ scorerName: cfg.gameScorer }));
  }
};
