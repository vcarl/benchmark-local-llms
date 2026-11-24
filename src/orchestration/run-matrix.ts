/**
 * Matrix runner — the outer loop over a matched set of configurations and
 * challenges. Lifts server lifetime from per-challenge to per-configuration:
 * each model boots ONCE (inside an Effect.scoped that also tears it down) and
 * is reused across all of that configuration's challenges.
 *
 * Strictly sequential: one local model in memory at a time. Different runtimes
 * bind different fixed ports, so config-by-config iteration keeps exactly one
 * server up at a time. Failure isolation: a boot (or weights digest) failure
 * SKIPs the whole row; a per-cell store error marks that cell ERROR and the
 * row continues.
 */
import type { CommandExecutor, FileSystem, HttpClient, Path } from "@effect/platform";
import { Effect } from "effect";
import type { ResolvedChallenge, ResolvedItem } from "../config/challenges.js";
import type { ResolvedConfiguration } from "../config/configurations.js";
import type { ChatCompletion } from "../llm/chat-completion.js";
import type { Runtime } from "../schema/enums.js";
import type { Held } from "../store/store-index.js";
import { weightsDigest } from "../store/weights.js";
import { modelFromConfig, type RunEnv, runChallengeWithServer } from "./run-challenge.js";
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
  readonly store: string;
  readonly release: string;
  readonly runId: string;
  readonly contributor: string;
  readonly env: RunEnv;
  /** See `RunChallengeInput.present`. */
  readonly present: ReadonlyArray<Held>;
  readonly deps: RunModelDeps;
  readonly noSkip?: boolean;
  /** Samples per item of a challenge (see `RunChallengeInput.samplesOf`); default 1. */
  readonly samplesOf?: (challengeId: string, item: ResolvedItem) => number;
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
    // One probe per distinct runtime per sweep.
    const versions = new Map<Runtime, string>();

    for (const config of input.configs) {
      configIndex += 1;
      const here = configIndex;

      const row = yield* Effect.scoped(
        Effect.gen(function* () {
          const weights = yield* weightsDigest(input.store, config);
          const server = yield* input.deps.llmServer(modelFromConfig(config));
          let runtimeVersion = versions.get(config.runtime);
          if (runtimeVersion === undefined) {
            runtimeVersion = yield* input.deps.runtimeVersion(config.runtime);
            versions.set(config.runtime, runtimeVersion);
          }
          const env = { ...input.env, runtimeVersion };
          const rowCells: MatrixCell[] = [];
          for (const ch of input.challenges) {
            const result = yield* runChallengeWithServer(
              {
                config,
                challenge: ch.resolved,
                store: input.store,
                release: input.release,
                runId: input.runId,
                contributor: input.contributor,
                env,
                weightsDigest: weights,
                present: input.present,
                ...(input.noSkip === undefined ? {} : { noSkip: input.noSkip }),
                ...(input.samplesOf === undefined
                  ? {}
                  : {
                      samplesOf: (item: ResolvedItem) =>
                        input.samplesOf?.(ch.resolved.id, item) ?? 1,
                    }),
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
