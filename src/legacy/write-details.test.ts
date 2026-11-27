import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stableStringify } from "../config/hashing.js";
import { pinnedToDisk, putBlob } from "./__tests__/blobs.js";
import { computeConfigHash, computePromptHash, scorerHash } from "./identity.js";
import { writeDetails } from "./write-details.js";

const SCORER = { type: "exact_match", expected: "4", extract: "(\\d+)" };
const PH = computePromptHash("What is 2+2?", "");
const CFG = computeConfigHash(
  { artifact: "a", runtime: "mlx", temperature: 0, maxTokens: 64 },
  "Be concise.",
);

const v2Header = {
  schemaVersion: 2,
  attemptId: "att-x",
  startedAt: "t",
  finishedAt: "t",
  interrupted: false,
  configId: "c",
  configHash: CFG,
  artifact: "a",
  runtime: "mlx",
  temperature: 0,
  systemPrompt: "default",
  maxTokens: 64,
  challengeId: "ch",
  challengeVersion: 1,
  challengeHash: "chh",
  passThreshold: 0.8,
  env: {
    hostname: "h",
    platform: "p",
    runtimeVersion: "r",
    nodeVersion: "n",
    benchmarkGitSha: "g",
  },
  aggregate: { score: 1, passed: true },
};

const v1Header = { ...v2Header, schemaVersion: 1, attemptId: "att-v1" };

describe("writeDetails", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "details-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes one detail file per v2 attempt with the joined per-item shape", async () => {
    const sh = scorerHash(SCORER as never);
    const item = {
      itemId: "i",
      promptName: "i",
      promptHash: PH,
      itemHash: "ih",
      scorerHash: sh,
      executedAt: "t",
      promptTokens: 1,
      generationTokens: 1,
      promptTps: 1,
      generationTps: 1,
      peakMemoryGb: 0,
      wallTimeSec: 0.4,
      ttftMs: 150,
      prefillMs: 150,
      decodeMs: 200,
      timingSource: "client",
      cachedPromptTokens: 0,
      output: "4",
      reasoning: null,
      rawOutput: "4",
      error: null,
      score: 1,
    };
    const file = join(dir, "att-x.jsonl");
    const out = join(dir, "out");
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const { writeFile } = yield* Effect.promise(() => import("node:fs/promises"));
          yield* putBlob(dir, "prompts", PH, "What is 2+2?");
          yield* putBlob(dir, "scorers", sh, stableStringify(SCORER));
          yield* putBlob(dir, "system", v2Header, "Be concise.");
          yield* Effect.promise(() =>
            writeFile(file, `${JSON.stringify(v2Header)}\n${JSON.stringify(item)}\n`),
          );
          return yield* writeDetails(out, [{ attemptId: "att-x", sourcePath: file }], pinnedToDisk);
        }),
        NodeContext.layer,
      ),
    );
    expect(result).toEqual({ written: 1, skipped: 0 });
    const detail = JSON.parse(await readFile(join(out, "att-x.json"), "utf8"));
    expect(detail.attempt_id).toBe("att-x");
    expect(detail.config_hash).toBe(CFG);
    expect(detail.challenge_id).toBe("ch");
    expect(detail.system_prompt_text).toBe("Be concise.");
    const pack = JSON.parse(await readFile(join(dir, "prompts", `${detail.prompts}.json`), "utf8"));
    expect(pack[detail.items[0].item_id]).toBe("What is 2+2?");
    expect(detail.items[0].prompt_text).toBeUndefined();
    expect(detail.items[0].output).toBe("4");
    expect(detail.items[0].score).toBe(1);
    expect(detail.items[0].scorer.type).toBe("exact_match");
    expect(detail.items[0].timing).toEqual({
      wall_sec: 0.4,
      prompt_tokens: 1,
      generation_tokens: 1,
      ttft_ms: 150,
      prefill_ms: 150,
      decode_ms: 200,
      source: "client",
      cached_prompt_tokens: 0,
    });
  });

  it("leaves retired items out of the detail file", async () => {
    const sh = scorerHash(SCORER as never);
    const line = (promptName: string) => ({
      itemId: promptName,
      promptName,
      promptHash: PH,
      itemHash: "ih",
      scorerHash: sh,
      executedAt: "t",
      promptTokens: 1,
      generationTokens: 1,
      promptTps: 1,
      generationTps: 1,
      peakMemoryGb: 0,
      wallTimeSec: 0,
      output: "4",
      reasoning: null,
      rawOutput: "4",
      error: null,
      score: 1,
    });
    const header = { ...v2Header, retiredItems: ["gone"] };
    const file = join(dir, "att-x.jsonl");
    const out = join(dir, "out");
    await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const { writeFile } = yield* Effect.promise(() => import("node:fs/promises"));
          yield* putBlob(dir, "prompts", PH, "What is 2+2?");
          yield* putBlob(dir, "scorers", sh, stableStringify(SCORER));
          yield* putBlob(dir, "system", v2Header, "Be concise.");
          const body = [header, line("kept"), line("gone")]
            .map((l) => JSON.stringify(l))
            .join("\n");
          yield* Effect.promise(() => writeFile(file, `${body}\n`));
          return yield* writeDetails(out, [{ attemptId: "att-x", sourcePath: file }], pinnedToDisk);
        }),
        NodeContext.layer,
      ),
    );
    const detail = JSON.parse(await readFile(join(out, "att-x.json"), "utf8"));
    expect(detail.items.map((i: { item_id: string }) => i.item_id)).toEqual(["kept"]);
  });

  it("shows one entry per resampled item, its first sample, with the sample pass count", async () => {
    const sh = scorerHash(SCORER as never);
    const line = (promptName: string, score: number, extra: Record<string, unknown> = {}) => ({
      itemId: promptName,
      promptName,
      promptHash: PH,
      itemHash: "ih",
      scorerHash: sh,
      executedAt: "t",
      promptTokens: 1,
      generationTokens: 1,
      promptTps: 1,
      generationTps: 1,
      peakMemoryGb: 0,
      wallTimeSec: 0,
      output: String(score),
      reasoning: null,
      rawOutput: "4",
      error: null,
      score,
      ...extra,
    });
    const file = join(dir, "att-x.jsonl");
    const out = join(dir, "out");
    await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const { writeFile } = yield* Effect.promise(() => import("node:fs/promises"));
          yield* putBlob(dir, "prompts", PH, "What is 2+2?");
          yield* putBlob(dir, "scorers", sh, stableStringify(SCORER));
          yield* putBlob(dir, "system", v2Header, "Be concise.");
          const body = [
            v2Header,
            line("a", 1),
            line("a", 0, { sample: 1 }),
            line("a", 1, { sample: 2 }),
            line("b", 1),
          ]
            .map((l) => JSON.stringify(l))
            .join("\n");
          yield* Effect.promise(() => writeFile(file, `${body}\n`));
          return yield* writeDetails(out, [{ attemptId: "att-x", sourcePath: file }], pinnedToDisk);
        }),
        NodeContext.layer,
      ),
    );
    const detail = JSON.parse(await readFile(join(out, "att-x.json"), "utf8"));
    expect(detail.items.map((i: { item_id: string }) => i.item_id)).toEqual(["a", "b"]);
    expect(detail.items[0].samples).toEqual([2, 3]);
    expect(detail.items[1].samples).toBeUndefined();
    // A line written before timing capture carries only wall time and tokens.
    expect(detail.items[1].timing).toEqual({ wall_sec: 0, prompt_tokens: 1, generation_tokens: 1 });
  });

  it("marks turn units with parent, turn and whether the model's own previous turn passed", async () => {
    const sh = scorerHash(SCORER as never);
    const row = (itemId: string, extra: Record<string, unknown>, score: number) => ({
      itemId,
      promptName: itemId,
      promptHash: PH,
      itemHash: "ih",
      scorerHash: sh,
      executedAt: "t",
      promptTokens: 1,
      generationTokens: 1,
      promptTps: 1,
      generationTps: 1,
      peakMemoryGb: 0,
      wallTimeSec: 0,
      output: "4",
      reasoning: null,
      rawOutput: "4",
      error: null,
      score,
      ...extra,
    });
    const rows = [
      row("single", {}, 1),
      row("ch#1", { parentItemId: "ch", turn: 1 }, 0),
      row("ch#2", { parentItemId: "ch", turn: 2 }, 1),
      row("ch#3", { parentItemId: "ch", turn: 3 }, 1),
    ];
    const file = join(dir, "att-x.jsonl");
    const out = join(dir, "out");
    await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const { writeFile } = yield* Effect.promise(() => import("node:fs/promises"));
          yield* putBlob(dir, "prompts", PH, "What is 2+2?");
          yield* putBlob(dir, "scorers", sh, stableStringify(SCORER));
          yield* putBlob(dir, "system", v2Header, "Be concise.");
          yield* Effect.promise(() =>
            writeFile(file, [v2Header, ...rows].map((r) => JSON.stringify(r)).join("\n")),
          );
          return yield* writeDetails(out, [{ attemptId: "att-x", sourcePath: file }], pinnedToDisk);
        }),
        NodeContext.layer,
      ),
    );
    const detail = JSON.parse(await readFile(join(out, "att-x.json"), "utf8"));
    const pick = (i: Record<string, unknown>) => [
      i["item_id"],
      i["parent_item_id"],
      i["turn"],
      i["prior_turn_passed"],
    ];
    expect(detail.items.map(pick)).toEqual([
      ["single", undefined, undefined, null],
      ["ch#1", "ch", 1, null],
      ["ch#2", "ch", 2, false],
      ["ch#3", "ch", 3, true],
    ]);
  });

  it("skips a v1 attempt gracefully (no file, counted as skipped)", async () => {
    const file = join(dir, "att-v1.jsonl");
    const out = join(dir, "out");
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const { writeFile } = yield* Effect.promise(() => import("node:fs/promises"));
          yield* Effect.promise(() => writeFile(file, `${JSON.stringify(v1Header)}\n`));
          return yield* writeDetails(
            out,
            [{ attemptId: "att-v1", sourcePath: file }],
            pinnedToDisk,
          );
        }),
        NodeContext.layer,
      ),
    );
    expect(result).toEqual({ written: 0, skipped: 1 });
  });
});
