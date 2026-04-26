/**
 * run-session integration tests. Both Admiral and gameserver admin clients
 * are mocked here, and the SSE stream is supplied via `sseOverride` so we
 * can drive it deterministically with `Stream.fromIterable` (events with
 * controlled timestamps and counts).
 */
import { Effect, Stream } from "effect";
import { describe, expect, it } from "vitest";
import { httpClientLayer } from "../../llm/servers/test-mocks.js";
import type { AgentEvent } from "../../schema/execution.js";
import type { ModelConfig } from "../../schema/model.js";
import type { ScenarioCorpusEntry } from "../../schema/scenario.js";
import type { AdmiralClient } from "../admiral/client.js";
import type { GameAdminClient, PlayerCredential } from "../server/admin-client.js";
import { runSession } from "./run-session.js";

const event = (
  e: AgentEvent["event"],
  data: Record<string, unknown> = {},
  tick = 0,
): AgentEvent => ({ event: e, tick, ts: "2026-01-01T00:00:00Z", data });

const baseScenario: ScenarioCorpusEntry = {
  name: "test-scenario",
  fixture: "default",
  players: [
    { id: "alice", controlledBy: "llm" },
    { id: "rival", controlledBy: "npc" },
  ],
  scorer: "generic",
  scorerParams: {},
  cutoffs: { wallClockSec: 60, totalTokens: 10000, toolCalls: 100 },
  tier: 1,
  scenarioMd: "## Do the thing",
  scenarioHash: "abc123",
};

const baseModel: ModelConfig = {
  artifact: "qwen3-coder",
  runtime: "llamacpp",
  name: "Qwen3-Coder",
  quant: "Q4",
};

const okAdmiral = (): AdmiralClient => ({
  configureProvider: () => Effect.void,
  createProfile: () => Effect.succeed("p-1"),
  connectProfile: () => Effect.void,
  disconnectProfile: () => Effect.void,
  deleteProfile: () => Effect.void,
});

const okAdmin = (
  creds: PlayerCredential = { username: "alice", password: "p", player_id: "alice" },
  finalStats: Record<string, unknown> = { credits: 100, stats: { systems_explored: 4 } },
): GameAdminClient => ({
  reset: () => Effect.succeed([creds]),
  resolveCredential: () => Effect.succeed(creds),
  getPlayerStats: () => Effect.succeed(finalStats),
});

describe("runSession", () => {
  it("completes when the SSE stream ends naturally and packs an ExecutionResult", async () => {
    const events = Stream.fromIterable([
      event("tool_call", { tool: "scan" }),
      event("turn_end", { totalTokensIn: 50, totalTokensOut: 20 }),
      event("tool_call", { tool: "fly_to" }),
    ]);

    const result = await Effect.runPromise(
      Effect.scoped(
        runSession(
          {
            scenario: baseScenario,
            model: baseModel,
            archiveId: "a-1",
            runId: "r-1",
            temperature: 0.3,
            admiralBaseUrl: "http://admiral",
            gameServerBaseUrl: "http://gs",
            llmBaseUrl: "http://llm",
            sseOverride: events,
          },
          { admiral: okAdmiral(), admin: okAdmin() },
        ),
      ).pipe(Effect.provide(httpClientLayer)),
    );

    expect(result.terminationReason).toBe("completed");
    expect(result.toolCallCount).toBe(2);
    expect(result.generationTokens).toBe(70);
    expect(result.scenarioName).toBe("test-scenario");
    expect(result.scenarioHash).toBe("abc123");
    expect(result.events?.length).toBe(3);
    expect(result.finalPlayerStats).toEqual({
      credits: 100,
      stats: { systems_explored: 4 },
    });
    expect(result.error).toBeNull();
  });

  it("trips on tool_calls cutoff and reports termination reason", async () => {
    const scenario: ScenarioCorpusEntry = {
      ...baseScenario,
      cutoffs: { wallClockSec: 60, totalTokens: 10000, toolCalls: 1 },
    };
    const events = Stream.fromIterable([
      event("tool_call", { tool: "a" }),
      event("tool_call", { tool: "b" }), // crosses cutoff (>1)
      event("tool_call", { tool: "c" }), // never observed
    ]);
    const result = await Effect.runPromise(
      Effect.scoped(
        runSession(
          {
            scenario,
            model: baseModel,
            archiveId: "a-1",
            runId: "r-1",
            temperature: 0.3,
            admiralBaseUrl: "http://admiral",
            gameServerBaseUrl: "http://gs",
            llmBaseUrl: "http://llm",
            sseOverride: events,
          },
          { admiral: okAdmiral(), admin: okAdmin() },
        ),
      ).pipe(Effect.provide(httpClientLayer)),
    );
    expect(result.terminationReason).toBe("tool_calls");
    // Watchdog stops as soon as the cutoff trips: 2 events consumed
    expect(result.toolCallCount).toBe(2);
  });

  it("folds AdmiralApiError into terminationReason='error' result", async () => {
    const { AdmiralApiError } = await import("../../errors/index.js");
    const failingAdmiral: AdmiralClient = {
      ...okAdmiral(),
      createProfile: () =>
        Effect.fail(new AdmiralApiError({ endpoint: "/api/profiles", status: 500, body: "boom" })),
    };

    const result = await Effect.runPromise(
      Effect.scoped(
        runSession(
          {
            scenario: baseScenario,
            model: baseModel,
            archiveId: "a-1",
            runId: "r-1",
            temperature: 0.3,
            admiralBaseUrl: "http://admiral",
            gameServerBaseUrl: "http://gs",
            llmBaseUrl: "http://llm",
            sseOverride: Stream.empty,
          },
          { admiral: failingAdmiral, admin: okAdmin() },
        ),
      ).pipe(Effect.provide(httpClientLayer)),
    );
    expect(result.terminationReason).toBe("error");
    expect(result.error).toContain("AdmiralApiError");
  });

  it("folds GameCredentialMismatch into terminationReason='error'", async () => {
    const { GameCredentialMismatch } = await import("../../errors/index.js");
    const wrongAdmin: GameAdminClient = {
      ...okAdmin(),
      resolveCredential: () =>
        Effect.fail(new GameCredentialMismatch({ expectedId: "alice", availableIds: ["bob"] })),
    };

    const result = await Effect.runPromise(
      Effect.scoped(
        runSession(
          {
            scenario: baseScenario,
            model: baseModel,
            archiveId: "a-1",
            runId: "r-1",
            temperature: 0.3,
            admiralBaseUrl: "http://admiral",
            gameServerBaseUrl: "http://gs",
            llmBaseUrl: "http://llm",
            sseOverride: Stream.empty,
          },
          { admiral: okAdmiral(), admin: wrongAdmin },
        ),
      ).pipe(Effect.provide(httpClientLayer)),
    );
    expect(result.terminationReason).toBe("error");
    expect(result.error).toContain("GameCredentialMismatch");
  });
});
