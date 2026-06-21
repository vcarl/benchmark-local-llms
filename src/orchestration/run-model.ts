/**
 * Type definitions for the per-model run orchestration layer.
 *
 * The `runModel` function was removed (old per-model run stack, dead since
 * the matrix-runner reframe). These type exports remain live: `RunModelDeps`
 * and its factory types are used by `src/cli/deps.ts` and `src/cli/commands/run.ts`.
 */
import type { CommandExecutor, HttpClient } from "@effect/platform";
import type { Effect, Scope, Stream } from "effect";
import type { SseConnectionError, SseIdleTimeout, SseParseError } from "../errors/index.js";
import type { AdmiralClient } from "../game/admiral/client.js";
import type { ServerHandle } from "../llm/servers/supervisor.js";
import type { Runtime } from "../schema/enums.js";
import type { AgentEvent } from "../schema/execution.js";
import type { ModelConfig } from "../schema/model.js";
import type { PromptCorpusEntry } from "../schema/prompt.js";
import type { RunManifest, RunStats } from "../schema/run-manifest.js";
import type { ScenarioCorpusEntry } from "../schema/scenario.js";
import type { RunScenarioDeps } from "./run-scenario.js";
import type { ModelAggregate } from "./summary.js";

// ── Dependency seams ───────────────────────────────────────────────────────

/**
 * Acquire an LLM server within the caller's scope. Production wires
 * `llamacppServer` / `mlxServer` here; tests replace with a no-op fake.
 *
 * The factory's error channel is left `unknown` so callers can wire any
 * supervisor type — `runModel` collapses spawn failures into `FileIOError`
 * at the boundary.
 */
export type LlmServerFactory = (
  model: ModelConfig,
) => Effect.Effect<
  ServerHandle,
  unknown,
  CommandExecutor.CommandExecutor | HttpClient.HttpClient | Scope.Scope
>;

/** Admiral acquisition result — baseUrl plus a ready-to-use client. */
export interface AdmiralHandle {
  readonly baseUrl: string;
  readonly client: AdmiralClient;
}

export type AdmiralFactory = () => Effect.Effect<
  AdmiralHandle,
  unknown,
  CommandExecutor.CommandExecutor | HttpClient.HttpClient | Scope.Scope
>;

/** Per-scenario gameserver acquisition. */
export interface GameSessionDeps extends RunScenarioDeps {
  readonly gameServerBaseUrl: string;
  /**
   * Test override — if set, the scenario's SSE stream is supplied directly
   * instead of opening a real connection. Production factories leave this
   * undefined; test factories fill it with canned events.
   */
  readonly sseOverride?: Stream.Stream<
    AgentEvent,
    SseConnectionError | SseParseError | SseIdleTimeout
  >;
}

export type GameSessionFactory = (
  scenario: ScenarioCorpusEntry,
  admiral: AdmiralHandle,
) => Effect.Effect<
  GameSessionDeps,
  unknown,
  CommandExecutor.CommandExecutor | HttpClient.HttpClient | Scope.Scope
>;

// ── Public inputs ──────────────────────────────────────────────────────────

export interface RunModelInput {
  readonly manifest: RunManifest;
  readonly archivePath: string;
  readonly prompts: ReadonlyArray<PromptCorpusEntry>;
  readonly scenarios: ReadonlyArray<ScenarioCorpusEntry>;
  readonly temperature: number;
  readonly archiveDir: string;
  readonly fresh: boolean;
  readonly maxTokens: number;
  readonly noSave: boolean;
  readonly idleTimeoutSec?: number;
  readonly scenariosOnly?: boolean;
  readonly requestTimeoutSec?: number;
}

export interface RunModelDeps {
  readonly llmServer: LlmServerFactory;
  readonly admiral: AdmiralFactory;
  readonly gameSession: GameSessionFactory;
  /**
   * Probe the installed version string for a runtime (e.g.
   * "llama.cpp b9692 (…)", "mlx-lm 0.31.2"). Never fails — degrades to
   * "unknown". The run loop calls this once per distinct runtime and stamps
   * the result into each model's manifest `env.runtimeVersion`.
   */
  readonly runtimeVersion: (
    runtime: Runtime,
  ) => Effect.Effect<string, never, CommandExecutor.CommandExecutor>;
}

export interface RunModelOutcome {
  readonly manifest: RunManifest;
  readonly stats: RunStats;
  readonly interrupted: boolean;
  readonly aggregate: ModelAggregate;
  readonly archivePath: string;
}
