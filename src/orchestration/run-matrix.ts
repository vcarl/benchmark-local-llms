/**
 * Matrix runner — the outer loop over a matched set of configurations and
 * challenges. Lifts server lifetime from per-attempt to per-configuration:
 * each model boots ONCE (inside an Effect.scoped that also tears it down) and
 * is reused across all of that configuration's challenges.
 *
 * Strictly sequential: one local model in memory at a time. Different runtimes
 * bind different fixed ports, so config-by-config iteration keeps exactly one
 * server up at a time. Failure isolation: a boot failure SKIPs the whole row;
 * a per-cell IO error marks that cell ERROR and the row continues.
 */
import type { CommandExecutor, FileSystem, HttpClient, Path } from "@effect/platform";
import { Clock, Effect } from "effect";
import type { ResolvedChallenge } from "../config/challenges.js";
import type { ResolvedConfiguration } from "../config/configurations.js";
import type { ChatCompletion } from "../llm/chat-completion.js";
import type { RunEnv } from "../schema/run-manifest.js";
import { modelFromConfig, runChallengeWithServer } from "./run-challenge.js";
import type { RunModelDeps } from "./run-model.js";

export type MatrixCellStatus = "PASS" | "FAIL" | "ERROR" | "SKIPPED";

export interface MatrixCell {
  readonly configId: string;
  readonly challengeStem: string;
  readonly challengeId: string;
  readonly version?: number;
  readonly status: MatrixCellStatus;
  readonly score?: number;
  readonly reason?: string;
}

export interface MatrixChallenge {
  readonly stem: string;
  readonly resolved: ResolvedChallenge;
}

export interface RunMatrixInput {
  readonly configs: ReadonlyArray<ResolvedConfiguration>;
  readonly challenges: ReadonlyArray<MatrixChallenge>;
  readonly archiveDir: string;
  readonly env: RunEnv;
  readonly deps: RunModelDeps;
  readonly noCache?: boolean;
  readonly onCell?: (
    cell: MatrixCell,
    configIndex: number,
    configTotal: number,
  ) => Effect.Effect<void>;
}

export const runMatrix = (
  input: RunMatrixInput,
): Effect.Effect<
  ReadonlyArray<MatrixCell>,
  never,
  | FileSystem.FileSystem
  | Path.Path
  | CommandExecutor.CommandExecutor
  | HttpClient.HttpClient
  | ChatCompletion
> =>
  Effect.gen(function* () {
    const cells: MatrixCell[] = [];
    const total = input.configs.length;
    let configIndex = 0;

    for (const config of input.configs) {
      configIndex += 1;
      const here = configIndex;

      const row = yield* Effect.scoped(
        Effect.gen(function* () {
          const server = yield* input.deps.llmServer(modelFromConfig(config));
          const rowCells: MatrixCell[] = [];
          for (const ch of input.challenges) {
            const now = yield* Clock.currentTimeMillis;
            const attemptId = `att-${config.configHash}-${ch.resolved.challengeHash}-${now}`;
            const result = yield* runChallengeWithServer(
              {
                config,
                challenge: ch.resolved,
                attemptId,
                archiveDir: input.archiveDir,
                archivePath: `${input.archiveDir}/${attemptId}.jsonl`,
                env: input.env,
                deps: input.deps,
                ...(input.noCache !== undefined ? { noCache: input.noCache } : {}),
              },
              server,
            ).pipe(Effect.either);

            const cell: MatrixCell =
              result._tag === "Right"
                ? {
                    configId: config.id,
                    challengeStem: ch.stem,
                    challengeId: ch.resolved.id,
                    version: ch.resolved.version,
                    status: result.right.aggregate.passed ? "PASS" : "FAIL",
                    score: result.right.aggregate.score,
                  }
                : {
                    configId: config.id,
                    challengeStem: ch.stem,
                    challengeId: ch.resolved.id,
                    status: "ERROR",
                    reason: String(result.left),
                  };

            if (input.onCell !== undefined) yield* input.onCell(cell, here, total);
            rowCells.push(cell);
          }
          return rowCells;
        }),
      ).pipe(
        Effect.catchAll((bootErr) =>
          Effect.gen(function* () {
            const skipped = input.challenges.map(
              (ch): MatrixCell => ({
                configId: config.id,
                challengeStem: ch.stem,
                challengeId: ch.resolved.id,
                status: "SKIPPED",
                reason: String(bootErr),
              }),
            );
            if (input.onCell !== undefined) {
              for (const c of skipped) yield* input.onCell(c, here, total);
            }
            return skipped;
          }),
        ),
      );

      cells.push(...row);
    }

    return cells;
  });
