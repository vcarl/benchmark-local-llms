/**
 * QA Tier-A: self-sufficient seed-archive generator.
 *
 * Builds one COMPLETED attempt archive (.jsonl) through the REAL schema
 * encoders, plus the content store its items reference, so the seed stays in
 * sync with src/schema/attempt.ts and src/archive/content-store.ts.
 *
 * What it writes under dirname(outPath):
 *   <outPath>                              the .jsonl (header + 2 ItemResult lines)
 *   content/system/<configHash>.txt        the system-prompt text
 *   content/prompts/<promptHash>.txt        one per item (2 distinct prompts)
 *   content/scorers/<scorerHash>.json       the shared scorer config
 *
 * Header is finalized (interrupted:false, finishedAt set, aggregate filled) and
 * carries the content store (schemaVersion 2), so the seed is reconstructible:
 * it exercises `report` detail emission, `bench export`, and store re-scoring
 * with no corpus or challenge YAML on disk.
 *
 * The scorer is `contains "seed output"`, which every item's output satisfies,
 * so re-scoring from the store reproduces each stored score of 1.
 *
 * Run: node_modules/.bin/tsx .claude/skills/qa/seed-archive.ts [outPath]
 *   default outPath: ./qa-seed.jsonl in the cwd
 */
import { dirname } from "node:path";
import { writeFileSync } from "node:fs";
import { NodeContext } from "@effect/platform-node";
import { Effect, Schema } from "effect";
import { scorerHash, writeBlob } from "../../../src/archive/content-store.js";
import { stableStringify } from "../../../src/config/hashing.js";
import { AttemptManifest, ItemResult } from "../../../src/schema/attempt.js";
import type { ScorerConfig } from "../../../src/schema/scorer.js";

type ItemResult = typeof ItemResult.Type;

const outPath = process.argv[2] ?? "qa-seed.jsonl";
const archiveDir = dirname(outPath);

const ENCODED_AT = "2026-06-19T12:00:00.000Z";
const configHash = "a1b2c3d4e5f6";
const challengeHash = "0f1e2d3c4b5a";
const systemPromptText = "You are concise.";

// Shared scorer every item's output satisfies → store re-score reproduces 1.
const scorer: ScorerConfig = {
  type: "constraint",
  constraints: [{ check: "contains", name: "has_seed", value: "seed output" }],
};
const SCORER_HASH = scorerHash(scorer);

const header: typeof AttemptManifest.Type = {
  schemaVersion: 2,
  attemptId: `att-${configHash}-${challengeHash}-1718798400000`,
  startedAt: ENCODED_AT,
  finishedAt: ENCODED_AT,
  interrupted: false,
  configId: "smoke-config",
  configHash,
  artifact: "Qwen/Qwen2.5-0.5B-Instruct-GGUF",
  runtime: "llamacpp",
  quant: "Q4_K_M",
  temperature: 0.0,
  systemPrompt: "concise",
  maxTokens: 128,
  challengeId: "smoke",
  challengeVersion: 1,
  challengeHash,
  passThreshold: 0.5,
  env: {
    hostname: "qa-seed",
    platform: "darwin",
    runtimeVersion: "llamacpp-seed",
    nodeVersion: process.version,
    benchmarkGitSha: "seedsha00000",
  },
  aggregate: { score: 1.0, passed: true },
};

const mkItem = (n: number, promptHash: string): ItemResult => ({
  itemId: `seed_item_${n}`,
  promptName: `seed_prompt_${n}`,
  promptHash,
  itemHash: `${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}`,
  scorerHash: SCORER_HASH,
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
  score: 1.0,
});

const items: ReadonlyArray<{ item: ItemResult; promptText: string }> = [
  { item: mkItem(1, "aaaaaaaaaaa1"), promptText: "Prompt one: emit seed output 1." },
  { item: mkItem(2, "aaaaaaaaaaa2"), promptText: "Prompt two: emit seed output 2." },
];

const program = Effect.gen(function* () {
  // Encode + write the .jsonl through the real encoders.
  const encHeader = yield* Schema.encode(AttemptManifest)(header);
  const encItems = yield* Effect.forEach(items, ({ item }) => Schema.encode(ItemResult)(item));
  const lines = [JSON.stringify(encHeader), ...encItems.map((e) => JSON.stringify(e))];
  writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");

  // Write the content store the .jsonl references (idempotent, content-addressed).
  yield* writeBlob(archiveDir, "system", configHash, systemPromptText);
  yield* writeBlob(archiveDir, "scorers", SCORER_HASH, stableStringify(scorer));
  yield* Effect.forEach(items, ({ item, promptText }) =>
    writeBlob(archiveDir, "prompts", item.promptHash, promptText),
  );
});

Effect.runPromise(program.pipe(Effect.provide(NodeContext.layer)))
  .then(() => {
    console.log(`wrote ${outPath} + content store under ${archiveDir}/content/`);
    console.log("SEED OK");
    process.exit(0);
  })
  .catch((err) => {
    console.error("FAIL: seed encode/write");
    console.error(err);
    process.exit(1);
  });
