import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Ajv } from "ajv";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stableStringify } from "../../config/hashing.js";
import { pinnedToDisk, putBlob } from "../../legacy/__tests__/blobs.js";
import { computeConfigHash, computePromptHash, scorerHash } from "../../legacy/identity.js";
import { exportEee } from "./build.js";
import evalSchema from "./schemas/eval.schema.json" with { type: "json" };
import instanceSchema from "./schemas/instance_level_eval.schema.json" with { type: "json" };

const ajv = new Ajv({ strict: false, allErrors: true });
const validateAgg = ajv.compile(evalSchema);
const validateInst = ajv.compile(instanceSchema);

const SCORER = { type: "exact_match", expected: "4", extract: "(\\d+)" };
const SCORER2 = { type: "constraint", constraints: [] };

const HISTORY = JSON.stringify([
  { role: "user", content: "T1?" },
  { role: "assistant", content: "A1" },
  { role: "user", content: "T2?" },
]);
const PH1 = computePromptHash("What is 2+2?", "");
const PH2 = computePromptHash("T1?", "");
const PH3 = computePromptHash(HISTORY, "");

const config = {
  schemaVersion: 3,
  attemptId: "att-cfg-chh-1",
  startedAt: "2026-11-01T10:00:00.000Z",
  finishedAt: "2026-11-01T10:05:00.000Z",
  interrupted: false,
  configId: "qwen-q4",
  artifact: "unsloth/Qwen3-32B-GGUF",
  runtime: "llamacpp",
  quant: "Q4_K_M",
  temperature: 0.6,
  topP: 0.95,
  minP: 0,
  systemPrompt: "direct",
  maxTokens: 512,
  chatTemplateSha: "abcabcabcabc",
  challengeId: "arith",
  challengeVersion: 2,
  challengeHash: "chh123456789",
  passThreshold: 0.8,
  invocationId: "inv-1",
  submitter: "carl",
  env: {
    platform: "darwin-arm64",
    runtimeVersion: "b9999",
    nodeVersion: "v22",
    benchmarkGitSha: "deadbee",
    hardwareId: "hw1234567890",
    hardware: { cpu: "M5", cpuCores: 18, memoryGb: 128, os: "macOS 27" },
  },
  aggregate: { score: 0.5, passed: false },
};
const CFG = computeConfigHash(config, "Be concise.");
const header = { ...config, configHash: CFG };

const line = (o: Record<string, unknown>) => ({
  itemId: "q1",
  promptName: "q1",
  promptHash: PH1,
  itemHash: "ih1",
  executedAt: "2026-11-01T10:01:00.000Z",
  promptTokens: 10,
  generationTokens: 20,
  promptTps: 100,
  generationTps: 50,
  peakMemoryGb: 20,
  wallTimeSec: 1.5,
  output: "4",
  reasoning: "think",
  rawOutput: "<think>think</think>4",
  error: null,
  score: 1,
  ...o,
});

let dir: string;
let out: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "eee-"));
  out = await mkdtemp(join(tmpdir(), "eee-out-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  await rm(out, { recursive: true, force: true });
});

const run = <A, E>(eff: Effect.Effect<A, E, NodeContext.NodeContext>) =>
  Effect.runPromise(Effect.provide(eff, NodeContext.layer));

const opts = { relationship: "third_party", collection: "llms-bench" } as const;

const setup = async () => {
  const sh = scorerHash(SCORER as never);
  const sh2 = scorerHash(SCORER2 as never);
  await run(
    Effect.gen(function* () {
      yield* putBlob(dir, "prompts", PH1, "What is 2+2?");
      yield* putBlob(dir, "prompts", PH2, "T1?");
      yield* putBlob(dir, "prompts", PH3, HISTORY);
      yield* putBlob(dir, "scorers", sh, stableStringify(SCORER));
      yield* putBlob(dir, "scorers", sh2, stableStringify(SCORER2));
      yield* putBlob(dir, "system", header, "Be concise.");
    }),
  );
  const lines = [
    line({
      scorerHash: sh,
      ttftMs: 120,
      decodeMs: 900,
      cachedPromptTokens: 4,
      timingSource: "server",
    }),
    line({
      scorerHash: sh,
      sample: 1,
      score: 0,
      output: "5",
      rawOutput: "5",
      failureKind: "wrong",
    }),
    line({
      itemId: "m#1",
      promptName: "m#1",
      parentItemId: "m",
      turn: 1,
      promptHash: PH2,
      scorerHash: sh2,
    }),
    line({
      itemId: "m#2",
      promptName: "m#2",
      parentItemId: "m",
      turn: 2,
      promptHash: PH3,
      scorerHash: sh2,
      score: 0.5,
      reasoning: null,
    }),
    line({ itemId: "gone", promptName: "gone", scorerHash: sh }),
  ];
  const h = { ...header, retiredItems: ["gone"] };
  const file = join(dir, "att-cfg-chh-1.jsonl");
  await writeFile(file, [h, ...lines].map((l) => JSON.stringify(l)).join("\n"));
  return file;
};

describe("exportEee", () => {
  it("writes a schema-valid aggregate + samples and maps fields", async () => {
    const file = await setup();
    const res = await run(exportEee(file, out, opts, pinnedToDisk));

    expect(res.aggregatePath).toMatch(/data\/llms-bench\/unsloth\/[^/]+\/[0-9a-f-]{36}\.json$/);
    const agg = JSON.parse(await readFile(res.aggregatePath, "utf8"));
    const rows = (await readFile(res.samplesPath, "utf8"))
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));

    expect(validateAgg(agg), JSON.stringify(validateAgg.errors)).toBe(true);
    for (const r of rows) expect(validateInst(r), JSON.stringify(validateInst.errors)).toBe(true);

    // quant-distinguishing model id; system prompt only in generation_config
    expect(agg.model_info.id).toBe("unsloth/Qwen3-32B-GGUF@Q4_K_M");
    expect(agg.model_info.inference_engine).toEqual({ name: "llamacpp", version: "b9999" });
    expect(agg.model_info.additional_details).toMatchObject({
      quant: "Q4_K_M",
      config_hash: CFG,
      chat_template_sha: "abcabcabcabc",
      deployment_type: "self_deployed",
    });
    const gc = agg.evaluation_results[0].generation_config;
    expect(gc.generation_args).toEqual({ temperature: 0.6, top_p: 0.95, max_tokens: 512 });
    expect(gc.additional_details.system_prompt_text).toBe("Be concise.");
    expect(gc.additional_details.system_prompt_key).toBe("direct");
    expect(gc.additional_details.min_p).toBe("0");
    expect(agg.source_metadata.additional_details).toMatchObject({
      hardware_id: "hw1234567890",
      attempt_id: "att-cfg-chh-1",
    });
    expect(agg.source_metadata.source_organization_name).toBe("carl");
    expect(agg.evaluation_id).toBe(
      createHash("sha256")
        .update(await readFile(file))
        .digest("hex"),
    );

    // score; the retired item is excluded
    expect(agg.evaluation_results[0].score_details.score).toBe(0.5);
    expect(rows).toHaveLength(4);
    expect(agg.detailed_evaluation_results.total_rows).toBe(4);
    expect(agg.detailed_evaluation_results.file_path).toBe(
      res.samplesPath.slice(res.samplesPath.indexOf("data/")),
    );

    // single turn
    const [s0, s1, t1, t2] = rows;
    expect(s0.sample_id).toBe("q1");
    expect(s0.interaction_type).toBe("single_turn");
    expect(s0.input).toMatchObject({ raw: "What is 2+2?", reference: ["4"] });
    expect(s0.output).toEqual({ raw: ["<think>think</think>4"], reasoning_trace: ["think"] });
    expect(s0.evaluation).toMatchObject({ score: 1, is_correct: true });
    expect(s0.token_usage).toEqual({
      input_tokens: 10,
      output_tokens: 20,
      total_tokens: 30,
      input_tokens_cache_read: 4,
    });
    expect(s0.performance).toMatchObject({
      latency_ms: 1500,
      time_to_first_token_ms: 120,
      generation_time_ms: 900,
    });
    // Unmeasured timing stays out rather than reading as zero.
    expect(s1.token_usage).not.toHaveProperty("input_tokens_cache_read");
    expect(s1.performance).not.toHaveProperty("time_to_first_token_ms");
    expect(s0.answer_attribution[0]).toMatchObject({
      extracted_value: "4",
      extraction_method: "regex",
    });
    expect(s0.metadata).toMatchObject({ prompt_hash: PH1, item_hash: "ih1" });
    // repeated sample
    expect(s1.sample_id).toBe("q1::s1");
    expect(s1.evaluation.is_correct).toBe(false);
    expect(s1.metadata.failure_kind).toBe("wrong");
    // multi turn
    expect(t1.interaction_type).toBe("multi_turn");
    expect(t1.output).toBeNull();
    expect(t1.metadata.history).toBeUndefined();
    expect(t2.input.raw).toBe("T2?");
    expect(t2.messages.map((m: { role: string }) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(t2.metadata.history).toBe("gold");
    expect(t2.evaluation).toMatchObject({ score: 0.5, is_correct: false });
  });

  it("the vendored schemas reject a malformed record", () => {
    expect(validateAgg({ schema_version: "0.3.0" })).toBe(false);
    expect(validateInst({ schema_version: "0.3.0", extra: 1 })).toBe(false);
  });

  it("is deterministic and checksums the samples file", async () => {
    const file = await setup();
    const a = await run(exportEee(file, out, opts, pinnedToDisk));
    const b = await run(exportEee(file, out, opts, pinnedToDisk));
    expect(a.aggregatePath).toBe(b.aggregatePath);
    const agg = JSON.parse(await readFile(a.aggregatePath, "utf8"));
    const sum = createHash("sha256")
      .update(await readFile(a.samplesPath))
      .digest("hex");
    expect(agg.detailed_evaluation_results.checksum).toBe(sum);
  });
});
