import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { stableStringify } from "../../config/hashing.js";
import { type BundleHeader, type Execution, hardwareIdOf } from "../bundle.js";
import { digestOf } from "../digest.js";

export const makeStoreDir = (): Promise<string> =>
  fsp.mkdtemp(path.join(os.tmpdir(), "bench-store-"));

export const hardware = { cpu: "Test CPU", cpuCores: 8, memoryGb: 64, os: "TestOS 1" };

export const bundleConfig = {
  artifact: "org/model",
  weightsDigest: null,
  runtime: "mlx" as const,
  temperature: 0,
  maxTokens: 128,
  sampling: {},
  chatTemplateDigest: null,
  systemPrompt: "Be concise.",
};

export const header = (over: Partial<BundleHeader> = {}): BundleHeader => ({
  schemaVersion: 4,
  configId: "cfg",
  config: bundleConfig,
  configDigest: digestOf(bundleConfig),
  release: "draft",
  challenge: "math",
  run: {
    id: "run-1",
    contributor: "local",
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: null,
  },
  env: {
    platform: "test",
    runtimeVersion: "test",
    nodeVersion: "v0",
    harnessGitSha: "0".repeat(40),
    hardware,
    hardwareId: hardwareIdOf(hardware),
  },
  executions: null,
  ...over,
});

export const execution = (item: string, sample = 0, over: Partial<Execution> = {}): Execution => ({
  item: `math/${item}`,
  sample,
  seed: 7,
  messagesDigest: digestOf([{ role: "user", content: item }]),
  executedAt: "2026-01-01T00:00:01.000Z",
  output: "4",
  reasoning: null,
  rawOutput: "4",
  error: null,
  stopReason: "stop",
  measured: {
    promptTokens: 10,
    generationTokens: 2,
    promptTps: 100,
    generationTps: 20,
    peakMemoryGb: 1,
    wallTimeSec: 0.5,
  },
  ...over,
});

/** Canonical bundle bytes for arbitrary (possibly inconsistent) line objects. */
export const bundleText = (lines: ReadonlyArray<unknown>): string =>
  lines.map((l) => `${stableStringify(l)}\n`).join("");
