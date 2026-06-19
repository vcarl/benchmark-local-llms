/**
 * QA Tier-A5: schema-valid seed-archive generator.
 *
 * Builds one COMPLETED attempt archive (.jsonl) through the REAL schema
 * encoders, so the seed stays in sync with src/schema/attempt.ts (incl. the
 * required itemHash). Header is finalized (interrupted:false, finishedAt set,
 * aggregate filled); 2 ItemResult body lines follow.
 *
 * Run: node_modules/.bin/tsx .claude/skills/qa/seed-archive.ts [outPath]
 *   default outPath: ./qa-seed.jsonl in the cwd
 */
import { writeFileSync } from "node:fs";
import { Effect, Schema } from "effect";
import { AttemptManifest, ItemResult } from "../../../src/schema/attempt.js";

type ItemResult = typeof ItemResult.Type;

const outPath = process.argv[2] ?? "qa-seed.jsonl";

const ENCODED_AT = "2026-06-19T12:00:00.000Z";
const configHash = "a1b2c3d4e5f6";
const challengeHash = "0f1e2d3c4b5a";

const header: typeof AttemptManifest.Type = {
  schemaVersion: 1,
  attemptId: `att-${configHash}-${challengeHash}-1718798400000`,
  startedAt: ENCODED_AT,
  finishedAt: ENCODED_AT,
  interrupted: false,
  configId: "smoke-config",
  configHash,
  artifact: "Qwen/Qwen2.5-0.5B-Instruct-GGUF",
  runtime: "llamacpp",
  quant: "q4-k-m",
  temperature: 0.0,
  systemPrompt: "concise",
  maxTokens: 128,
  challengeId: "smoke",
  challengeVersion: 1,
  challengeHash,
  env: {
    hostname: "qa-seed",
    platform: "darwin",
    runtimeVersion: "llamacpp-seed",
    nodeVersion: process.version,
    benchmarkGitSha: "seedsha00000",
  },
  aggregate: { score: 1.0, passed: true },
};

const mkItem = (n: number, itemHash: string, score: number): ItemResult => ({
  itemId: `seed_item_${n}`,
  promptName: `seed_prompt_${n}`,
  promptHash: `aaaaaaaaaaa${n}`,
  itemHash,
  executedAt: ENCODED_AT,
  promptTokens: 12,
  generationTokens: 8,
  promptTps: 100.0,
  generationTps: 50.0,
  peakMemoryGb: 0.5,
  wallTimeSec: 0.42,
  output: `seed output ${n}`,
  reasoning: null,
  rawOutput: `seed output ${n}`,
  error: null,
  score,
});

const items: ReadonlyArray<ItemResult> = [
  mkItem(1, "111111111111", 1.0),
  mkItem(2, "222222222222", 1.0),
];

const program = Effect.gen(function* () {
  const encHeader = yield* Schema.encode(AttemptManifest)(header);
  const encItems = yield* Effect.forEach(items, (i) => Schema.encode(ItemResult)(i));
  const lines = [JSON.stringify(encHeader), ...encItems.map((e) => JSON.stringify(e))];
  return `${lines.join("\n")}\n`;
});

Effect.runPromise(program)
  .then((jsonl) => {
    writeFileSync(outPath, jsonl, "utf8");
    console.log(`wrote ${outPath}`);
    console.log("SEED OK");
    process.exit(0);
  })
  .catch((err) => {
    console.error("FAIL: seed encode/write");
    console.error(err);
    process.exit(1);
  });
