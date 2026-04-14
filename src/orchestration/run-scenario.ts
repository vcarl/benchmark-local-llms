/**
 * Per-scenario orchestration wrapper. Thin adapter over C3's {@link runSession}
 * — the heavy lifting (gameserver spawn, Admiral profile lifecycle, SSE
 * consumption, watchdog) already happens there. This module's job is:
 *
 *   1. Decide what `llmBaseUrl` to pass (depends on the active LLM runtime
 *      port — 18080 for llamacpp, 18081 for mlx — matching §5.3 / §9.1).
 *   2. Shape the inputs for `runSession`.
 *
 * The per-scenario `gameServer(...)` and `runSession(...)` composition lives
 * here rather than in `run-model.ts` so we can hold the scenario-scope shape
 * in one place (gameserver is acquired inside a fresh `Scope` per scenario;
 * the scenario result is the handoff).
 */
import type { HttpClient } from "@effect/platform";
import type { Effect, Stream } from "effect";
import type { SseConnectionError, SseIdleTimeout, SseParseError } from "../errors/index.js";
import type { AdmiralClient } from "../game/admiral/client.js";
import type { GameAdminClient } from "../game/server/admin-client.js";
import { runSession } from "../game/session/run-session.js";
import type { AgentEvent, ExecutionResult } from "../schema/execution.js";
import type { ModelConfig } from "../schema/model.js";
import type { ScenarioCorpusEntry } from "../schema/scenario.js";

export interface RunScenarioInput {
  readonly runId: string;
  readonly model: ModelConfig;
  readonly scenario: ScenarioCorpusEntry;
  readonly temperature: number;
  readonly admiralBaseUrl: string;
  readonly gameServerBaseUrl: string;
  readonly llmBaseUrl: string;
  readonly sseIdleSec?: number;
  /**
   * Test override — if set, canned events are fed to the watchdog instead
   * of opening a real SSE connection to Admiral. Production wiring leaves
   * this undefined.
   */
  readonly sseOverride?: Stream.Stream<
    AgentEvent,
    SseConnectionError | SseParseError | SseIdleTimeout
  >;
}

export interface RunScenarioDeps {
  readonly admiral: AdmiralClient;
  readonly admin: GameAdminClient;
}

/**
 * Execute one scenario and return a fully-populated ExecutionResult. C3's
 * `runSession` handles all error paths internally (folding API/SSE failures
 * into `terminationReason: "error"`). This wrapper is a shape adapter, not
 * a retry or fallback layer.
 */
export const runScenario = (
  input: RunScenarioInput,
  deps: RunScenarioDeps,
): Effect.Effect<ExecutionResult, never, HttpClient.HttpClient | import("effect/Scope").Scope> =>
  runSession(
    {
      scenario: input.scenario,
      model: input.model,
      runId: input.runId,
      temperature: input.temperature,
      admiralBaseUrl: input.admiralBaseUrl,
      gameServerBaseUrl: input.gameServerBaseUrl,
      llmBaseUrl: input.llmBaseUrl,
      ...(input.sseIdleSec !== undefined ? { sseIdleSec: input.sseIdleSec } : {}),
      ...(input.sseOverride !== undefined ? { sseOverride: input.sseOverride } : {}),
    },
    deps,
  );
