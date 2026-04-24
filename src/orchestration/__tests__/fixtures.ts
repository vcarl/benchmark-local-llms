/**
 * Shared test fixtures and mock factories for the orchestration suite.
 *
 * The orchestration layer is integration glue; tests compose real B2 archive
 * I/O (over a tempdir-backed filesystem) with mocked versions of everything
 * else: C1's ChatCompletion, C2's server supervisors, C3's runSession
 * subsystem. All mocks live here so individual tests stay narrow.
 */
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { HttpClient, HttpClientResponse } from "@effect/platform";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { Deferred, Effect, Layer, Stream } from "effect";
import type { AdmiralClient } from "../../game/admiral/client.js";
import type { GameAdminClient, PlayerCredential } from "../../game/server/admin-client.js";
import {
  ChatCompletion,
  type ChatCompletionService,
  type CompletionParams,
  type CompletionResult,
} from "../../llm/chat-completion.js";
import type { ProcessHealthMonitor } from "../../llm/servers/process-health.js";
import type { ServerHandle } from "../../llm/servers/supervisor.js";
import type { AgentEvent, ExecutionResult } from "../../schema/execution.js";
import type { ModelConfig } from "../../schema/model.js";
import type { PromptCorpusEntry } from "../../schema/prompt.js";
import type { RunEnv } from "../../schema/run-manifest.js";
import type { ScenarioCorpusEntry } from "../../schema/scenario.js";
import type {
  AdmiralFactory,
  AdmiralHandle,
  GameSessionDeps,
  GameSessionFactory,
  LlmServerFactory,
  RunModelDeps,
} from "../run-model.js";

// ── Filesystem helpers ─────────────────────────────────────────────────────

export const makeTempDir = async (): Promise<string> => {
  return fsp.mkdtemp(path.join(os.tmpdir(), "c4-orch-"));
};

export const removeDir = async (dir: string): Promise<void> => {
  await fsp.rm(dir, { recursive: true, force: true });
};

export const readArchiveLines = async (p: string): Promise<string[]> => {
  const text = await fsp.readFile(p, "utf8");
  return text.split("\n").filter((l) => l.length > 0);
};

export const listFiles = async (dir: string): Promise<string[]> => {
  const entries = await fsp.readdir(dir);
  return entries.sort();
};

// ── Sample data ────────────────────────────────────────────────────────────

export const sampleEnv: RunEnv = {
  hostname: "test-host",
  platform: "darwin-arm64",
  runtimeVersion: "test",
  nodeVersion: "v22.0.0",
  benchmarkGitSha: "abcdef",
};

export const sampleModel = (overrides: Partial<ModelConfig> = {}): ModelConfig => ({
  artifact: "mlx-community/TestModel-4bit",
  runtime: "mlx",
  name: "Test Model",
  quant: "4bit",
  ...overrides,
});

export const samplePromptExact = (
  overrides: Partial<PromptCorpusEntry> = {},
): PromptCorpusEntry => ({
  name: "p1",
  category: "math",
  tier: 1,
  system: { key: "direct", text: "Be brief." },
  promptText: "2+2?",
  scorer: { type: "exact_match", expected: "4", extract: "(\\d+)" },
  promptHash: "hash-p1",
  ...overrides,
});

export const sampleScenario = (
  overrides: Partial<ScenarioCorpusEntry> = {},
): ScenarioCorpusEntry => ({
  name: "s1",
  fixture: "starter",
  players: [{ id: "alice", controlledBy: "llm" }],
  scorer: "generic",
  scorerParams: {},
  cutoffs: { wallClockSec: 900, totalTokens: 32000, toolCalls: 100 },
  tier: 1,
  scenarioMd: "# Test Scenario",
  scenarioHash: "hash-s1",
  ...overrides,
});

// ── ChatCompletion mock ────────────────────────────────────────────────────

export type ChatCompletionStub =
  | { readonly kind: "ok"; readonly result: CompletionResult }
  | { readonly kind: "fail"; readonly error: unknown };

export interface ChatCompletionMockLog {
  readonly calls: ReadonlyArray<CompletionParams>;
}

/**
 * Build a ChatCompletion layer backed by a stub-table. Keys are
 * `{promptName}:{temperature}`; on cache miss, the `fallback` is used.
 */
export const makeChatCompletionMock = (
  stubs: Record<string, ChatCompletionStub>,
  fallback: ChatCompletionStub = {
    kind: "ok",
    result: {
      output: "default-output",
      promptTokens: 10,
      generationTokens: 5,
      promptTps: 100,
      generationTps: 20,
    },
  },
): { layer: Layer.Layer<ChatCompletion>; log: ChatCompletionMockLog } => {
  const calls: CompletionParams[] = [];
  const key = (p: CompletionParams) => `${p.promptName}:${p.temperature}`;
  const service: ChatCompletionService = {
    complete: (params) => {
      calls.push(params);
      const stub = stubs[key(params)] ?? fallback;
      if (stub.kind === "ok") return Effect.succeed(stub.result);
      // The service interface declares a 4-way union error channel. Casting
      // via `as never` lets tests inject arbitrary shapes — runPrompt only
      // ever stringifies, so no runtime invariant is at risk.
      return Effect.fail(stub.error as never);
    },
  };
  return {
    layer: Layer.succeed(ChatCompletion, service),
    log: {
      get calls() {
        return calls;
      },
    },
  };
};

// ── HttpClient stub (no-op — satisfies the type; never used in mocks) ─────

export const inertHttpClientLayer: Layer.Layer<HttpClient.HttpClient> = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((req) =>
    Effect.succeed(HttpClientResponse.fromWeb(req, new Response("", { status: 404 }))),
  ),
);

// ── Fake server handle ─────────────────────────────────────────────────────

const fakeMonitor = (): Effect.Effect<ProcessHealthMonitor> =>
  Effect.gen(function* () {
    const exited = yield* Deferred.make<never, import("../../errors/index.js").ServerSpawnError>();
    return { exited, isAlive: Effect.succeed(true) };
  });

export const fakeServerHandle = (port = 18080): Effect.Effect<ServerHandle> =>
  Effect.gen(function* () {
    const monitor = yield* fakeMonitor();
    return {
      runtime: "mlx" as const,
      port,
      pid: 1234,
      monitor,
    };
  });

// ── Fake factories ─────────────────────────────────────────────────────────

export const fakeLlmServerFactory: LlmServerFactory = (_m) => fakeServerHandle(18081);

export const fakeAdmiralClient: AdmiralClient = {
  configureProvider: () => Effect.void,
  createProfile: () => Effect.succeed("profile-1"),
  connectProfile: () => Effect.void,
  disconnectProfile: () => Effect.void,
  deleteProfile: () => Effect.void,
};

export const fakeAdmin = (
  finalStats: Record<string, unknown> = { stats: { credits_earned: 42 } },
): GameAdminClient => {
  const cred: PlayerCredential = {
    username: "alice",
    password: "p",
    player_id: "alice",
  };
  return {
    reset: () => Effect.succeed([cred]),
    resolveCredential: () => Effect.succeed(cred),
    getPlayerStats: () => Effect.succeed(finalStats),
  };
};

export const fakeAdmiralFactory: AdmiralFactory = () =>
  Effect.succeed<AdmiralHandle>({
    baseUrl: "http://127.0.0.1:3031",
    client: fakeAdmiralClient,
  });

/**
 * Build a gameSession factory that returns canned SSE events for every
 * scenario acquisition. Each call produces the same event stream unless
 * overridden per-scenario by `perScenarioEvents`.
 *
 * Since `runSession` accepts an `sseOverride`, this factory doesn't actually
 * need to spawn a gameserver. We hand over the admin + a fake base URL; the
 * override events are stored in a shared ref and the runModel code hands
 * them to runSession via the scenario-scope factory.
 */
export interface FakeGameSessionOptions {
  readonly finalStats?: Record<string, unknown>;
  /** Events to stream for the *next* scenario acquisition. Defaults to empty. */
  readonly events?: ReadonlyArray<AgentEvent>;
  /** Per-scenario overrides keyed by scenario name. */
  readonly perScenario?: Record<string, ReadonlyArray<AgentEvent>>;
}

export const fakeGameSessionFactory =
  (opts: FakeGameSessionOptions = {}): GameSessionFactory =>
  (scenario, _admiral) =>
    Effect.succeed<GameSessionDeps>({
      admiral: fakeAdmiralClient,
      admin: fakeAdmin(opts.finalStats ?? { stats: {} }),
      gameServerBaseUrl: "http://127.0.0.1:44444",
      sseOverride: Stream.fromIterable(opts.perScenario?.[scenario.name] ?? opts.events ?? []),
    });

export const fakeDeps = (overrides: Partial<RunModelDeps> = {}): RunModelDeps => ({
  llmServer: fakeLlmServerFactory,
  admiral: fakeAdmiralFactory,
  gameSession: fakeGameSessionFactory(),
  ...overrides,
});

// ── Sample events + execution result helpers ──────────────────────────────

export const agentEvent = (
  type: AgentEvent["event"],
  data: Record<string, unknown> = {},
): AgentEvent => ({
  event: type,
  tick: 0,
  ts: "2026-01-01T00:00:00Z",
  data,
});

export const sampleExistingResult = (
  overrides: Partial<ExecutionResult> = {},
): ExecutionResult => ({
  runId: "prior-run",
  executedAt: "2026-04-01T00:00:00Z",
  promptName: "p1",
  temperature: 0.7,
  model: "Test Model",
  runtime: "mlx",
  quant: "4bit",
  promptTokens: 1,
  generationTokens: 1,
  promptTps: 1,
  generationTps: 1,
  peakMemoryGb: 0,
  wallTimeSec: 1,
  output: "prior-output",
  error: null,
  promptHash: "hash-p1",
  scenarioHash: null,
  scenarioName: null,
  terminationReason: null,
  toolCallCount: null,
  finalPlayerStats: null,
  events: null,
  ...overrides,
});

// ── Re-export platform layers commonly combined by tests ───────────────────

export const platformLayer = Layer.merge(NodeFileSystem.layer, NodePath.layer);

// Re-export Stream for convenient test use
export { Stream };
