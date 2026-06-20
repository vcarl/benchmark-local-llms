import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CommandExecutor } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, Option, Schema } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scorerHash, writeBlob } from "../../../archive/content-store.js";
import type { ResolvedChallenge, ResolvedItem } from "../../../config/challenges.js";
import { loadChallenge } from "../../../config/challenges.js";
import {
  AttemptManifest,
  type ItemResult,
  ItemResult as ItemResultSchema,
} from "../../../schema/attempt.js";
import type { PromptCorpusEntry } from "../../../schema/prompt.js";
import type { ScorerConfig } from "../../../schema/scorer.js";
import { formatSummary, rescoreItems, rescoreItemsFromStore, scoreCommand } from "../score.js";

const exactMatch: ScorerConfig = { type: "exact_match", expected: "42", extract: "(\\d+)" };

const promptEntry = (name: string, promptHash: string): PromptCorpusEntry =>
  ({
    name,
    category: "math",
    tier: 1,
    system: { key: "none", text: "" },
    promptText: "what is 6*7?",
    scorer: exactMatch,
    promptHash,
  }) as unknown as PromptCorpusEntry;

const resolvedItem = (
  itemId: string,
  promptHash: string,
  scorer: ScorerConfig = exactMatch,
): ResolvedItem => ({
  itemId,
  promptHash,
  itemHash: `${promptHash}-ih`,
  scorer,
  prompt: promptEntry(itemId, promptHash),
});

const resolved = (items: ReadonlyArray<ResolvedItem>): ResolvedChallenge => ({
  id: "smoke",
  version: 1,
  passThreshold: 0.5,
  challengeHash: "chh",
  items,
});

const item = (overrides: Partial<ItemResult> = {}): ItemResult => ({
  itemId: "p1",
  promptName: "p1",
  promptHash: "ph1",
  itemHash: "ih1",
  executedAt: "2026-01-01T00:00:00Z",
  promptTokens: 1,
  generationTokens: 1,
  promptTps: 1,
  generationTps: 1,
  peakMemoryGb: 0,
  wallTimeSec: 1,
  output: "the answer is 42",
  reasoning: null,
  rawOutput: "the answer is 42",
  error: null,
  score: 0,
  ...overrides,
});

const run = <A, E>(eff: Effect.Effect<A, E, CommandExecutor.CommandExecutor>) =>
  Effect.runPromise(eff.pipe(Effect.provide(NodeContext.layer)));

describe("rescoreItems", () => {
  it("re-scores a matching item via scoreByConfig (output matches scorer → 1)", async () => {
    const items = [item({ promptHash: "ph1", score: 0 })];
    const res = await run(rescoreItems(items, resolved([resolvedItem("p1", "ph1")])));
    expect(res.updated[0]?.score).toBe(1);
    expect(res.rescored).toBe(1);
    expect(res.drift).toBe(0);
  });

  it("applies a scorer-only edit when promptHash matches but scorer changed (itemHash differs)", async () => {
    // stored item scored 1 previously; the edited scorer now expects '99' → re-score to 0.
    const newScorer: ScorerConfig = { type: "exact_match", expected: "99", extract: "(\\d+)" };
    const items = [item({ promptHash: "ph1", score: 1, output: "the answer is 42" })];
    const res = await run(rescoreItems(items, resolved([resolvedItem("p1", "ph1", newScorer)])));
    expect(res.updated[0]?.score).toBe(0);
    expect(res.rescored).toBe(1);
    expect(res.drift).toBe(0);
  });

  it("keeps the stored score and counts drift when promptHash drifted", async () => {
    const items = [item({ promptHash: "OLD", score: 1 })];
    const res = await run(rescoreItems(items, resolved([resolvedItem("p1", "NEW")])));
    expect(res.updated[0]?.score).toBe(1);
    expect(res.rescored).toBe(0);
    expect(res.drift).toBe(1);
  });

  it("keeps the stored score and counts drift when prompt is missing from the challenge", async () => {
    const items = [item({ itemId: "ghost", promptName: "ghost", score: 1 })];
    const res = await run(rescoreItems(items, resolved([resolvedItem("p1", "ph1")])));
    expect(res.updated[0]?.score).toBe(1);
    expect(res.rescored).toBe(0);
    expect(res.drift).toBe(1);
  });

  it("forces score 0 for an item that recorded an execution error", async () => {
    const items = [item({ promptHash: "ph1", error: "boom", score: 1 })];
    const res = await run(rescoreItems(items, resolved([resolvedItem("p1", "ph1")])));
    expect(res.updated[0]?.score).toBe(0);
    expect(res.rescored).toBe(1);
    expect(res.drift).toBe(0);
  });

  it("folds a scorer error to score 0 (and still counts as rescored)", async () => {
    // A game scorer in scoreByConfig fails → caught → score 0.
    const gameScorer = { type: "game", gameScorer: "nope", scorerParams: {} } as ScorerConfig;
    const items = [item({ promptHash: "ph1", score: 1 })];
    const res = await run(rescoreItems(items, resolved([resolvedItem("p1", "ph1", gameScorer)])));
    expect(res.updated[0]?.score).toBe(0);
    expect(res.rescored).toBe(1);
  });
});

describe("formatSummary", () => {
  it("renders configId × challengeId@version with aggregate + PASS + counts", () => {
    const line = formatSummary({
      configId: "smoke-config",
      challengeId: "smoke",
      version: 1,
      aggregate: { score: 0.75, passed: true },
      rescored: 2,
      total: 2,
      drift: 0,
      fallback: 0,
      dryRun: false,
    });
    expect(line).toContain("score: smoke-config × smoke@1");
    expect(line).toContain("aggregate 0.750 PASS");
    expect(line).toContain("[rescored 2/2, drift 0, fallback 0]");
    expect(line).not.toContain("dry");
  });

  it("marks a dry-run line clearly", () => {
    const line = formatSummary({
      configId: "c",
      challengeId: "ch",
      version: 3,
      aggregate: { score: 0.2, passed: false },
      rescored: 1,
      total: 5,
      drift: 4,
      fallback: 0,
      dryRun: true,
    });
    expect(line.toLowerCase()).toContain("dry");
    expect(line).toContain("aggregate 0.200 FAIL");
  });
});

// ── Command-handler boundary tests ───────────────────────────────────────────
//
// These exercise the real `scoreCommand.handler` (the same entry the CLI
// invokes after option parsing), mirroring how report.test.ts drives the real
// business logic. The seed archive is built through the actual schema encoders
// and matched to the real `smoke` challenge so a re-score genuinely changes a
// score on disk.

const REAL_CHALLENGES = "challenges";

/** The smoke item whose constraint scorer PASSING_OUTPUT satisfies. */
const SMOKE_CONSTRAINT_ITEM = "constraint_keywords_direct";

// A paragraph that satisfies the smoke challenge's constraint scorer (must
// contain 'rocket', 'orbit', 'gravity') → re-scores to 1.0.
const PASSING_OUTPUT =
  "The rocket climbed steadily until it reached a stable orbit, where gravity gently held it in place.";

const runHandler = (args: {
  archive: string;
  challenge?: string;
  dryRun?: boolean;
  corpus?: boolean;
}) =>
  Effect.runPromise(
    scoreCommand
      .handler({
        archive: args.archive,
        challengesDir: REAL_CHALLENGES,
        challenge: args.challenge === undefined ? Option.none() : Option.some(args.challenge),
        dryRun: args.dryRun ?? false,
        corpus: args.corpus ?? false,
        verbose: false,
      })
      .pipe(Effect.provide(NodeContext.layer)),
  );

/** Resolve the real `smoke` challenge to learn its constraint item's promptHash. */
const resolveSmoke = () =>
  Effect.runPromise(
    loadChallenge(`${REAL_CHALLENGES}/smoke.yaml`).pipe(Effect.provide(NodeContext.layer)),
  );

/** The smoke challenge's constraint_keywords_direct item (satisfied by PASSING_OUTPUT). */
const smokeConstraintItem = (smoke: ResolvedChallenge): ResolvedItem | undefined =>
  smoke.items.find((i) => i.itemId === SMOKE_CONSTRAINT_ITEM);

/** Encode a schema-valid attempt archive (1 manifest line + N item lines). */
const encodeArchive = (manifest: typeof AttemptManifest.Type, items: ReadonlyArray<ItemResult>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const encHeader = yield* Schema.encode(AttemptManifest)(manifest);
      const encItems = yield* Effect.forEach(items, (i) => Schema.encode(ItemResultSchema)(i));
      return `${[JSON.stringify(encHeader), ...encItems.map((e) => JSON.stringify(e))].join("\n")}\n`;
    }),
  );

const baseManifest = (
  overrides: Partial<typeof AttemptManifest.Type> = {},
): typeof AttemptManifest.Type => ({
  schemaVersion: 1,
  attemptId: "att-test-1",
  startedAt: "2026-01-01T00:00:00.000Z",
  finishedAt: "2026-01-01T00:01:00.000Z",
  interrupted: false,
  configId: "smoke-config",
  configHash: "cfghash",
  artifact: "test/model",
  runtime: "llamacpp",
  quant: "q4",
  temperature: 0,
  systemPrompt: "concise",
  maxTokens: 128,
  challengeId: "smoke",
  challengeVersion: 1,
  challengeHash: "chh",
  env: {
    hostname: "h",
    platform: "p",
    runtimeVersion: "1",
    nodeVersion: "1",
    benchmarkGitSha: "s",
  },
  aggregate: { score: 0, passed: false },
  ...overrides,
});

/** Write a minimal v2 attempt archive with content store into dir. Returns file path. */
const writeV2AttemptWithStore = async (
  dir: string,
  opts: {
    scorer: ScorerConfig;
    output: string;
    score: number;
    passThreshold?: number;
  },
) => {
  const sh = scorerHash(opts.scorer);
  const promptHash = "ph-store";
  const configHash = "cfg-store";
  const attemptId = "att-store";
  await Effect.runPromise(
    Effect.gen(function* () {
      yield* writeBlob(dir, "prompts", promptHash, "what is 2+2?");
      yield* writeBlob(dir, "scorers", sh, JSON.stringify(opts.scorer));
      yield* writeBlob(dir, "system", configHash, "Be concise.");
    }).pipe(Effect.provide(NodeContext.layer)),
  );
  const header = {
    schemaVersion: 2,
    attemptId,
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:01:00.000Z",
    interrupted: false,
    configId: "store-config",
    configHash,
    artifact: "test/model",
    runtime: "llamacpp",
    quant: "q4",
    temperature: 0,
    systemPrompt: "default",
    maxTokens: 128,
    challengeId: "store-ch",
    challengeVersion: 1,
    challengeHash: "schh",
    passThreshold: opts.passThreshold ?? 1,
    env: {
      hostname: "h",
      platform: "p",
      runtimeVersion: "1",
      nodeVersion: "1",
      benchmarkGitSha: "s",
    },
    aggregate: { score: 0, passed: false },
  };
  const itemJson = {
    itemId: "i1",
    promptName: "i1",
    promptHash,
    itemHash: "ih-store",
    scorerHash: sh,
    executedAt: "2026-01-01T00:00:00.000Z",
    promptTokens: 1,
    generationTokens: 1,
    promptTps: 1,
    generationTps: 1,
    peakMemoryGb: 0,
    wallTimeSec: 0,
    output: opts.output,
    reasoning: null,
    rawOutput: opts.output,
    error: null,
    score: opts.score,
  };
  const file = path.join(dir, `${attemptId}.jsonl`);
  writeFileSync(file, `${JSON.stringify(header)}\n${JSON.stringify(itemJson)}\n`, "utf-8");
  return file;
};

describe("rescoreItemsFromStore", () => {
  it("re-scores an item from stored scorer config", async () => {
    const scorer: ScorerConfig = { type: "exact_match", expected: "4", extract: "(\\d+)" };
    const sh = scorerHash(scorer);
    const archived = item({
      itemId: "i1",
      promptName: "i1",
      promptHash: "ph-x",
      itemHash: "ih-x",
      scorerHash: sh,
      output: "the answer is 4",
      score: 0,
    });
    const reconItems = [{ item: archived, scorer }];
    const res = await run(rescoreItemsFromStore([archived], reconItems));
    expect(res.updated[0]?.score).toBe(1);
    expect(res.rescored).toBe(1);
    expect(res.drift).toBe(0);
  });
});

describe("scoreCommand.handler (boundary)", () => {
  let dir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let logged: string[];

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "score-cmd-"));
    logged = [];
    logSpy = vi.spyOn(console, "log").mockImplementation((line?: unknown) => {
      logged.push(String(line));
    });
  });
  afterEach(() => {
    logSpy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  it("--dry-run leaves the archive byte-for-byte identical while reporting the would-change", async () => {
    const smoke = await resolveSmoke();
    const promptItem = smokeConstraintItem(smoke);
    expect(promptItem).toBeDefined();
    if (promptItem === undefined) return;

    // Stored score 0; output actually passes → a real re-score would flip 0 → 1.
    const archiveItem = item({
      itemId: promptItem.itemId,
      promptName: promptItem.itemId,
      promptHash: promptItem.promptHash,
      itemHash: promptItem.itemHash,
      output: PASSING_OUTPUT,
      rawOutput: PASSING_OUTPUT,
      score: 0,
    });
    const contents = await encodeArchive(baseManifest(), [archiveItem]);
    const file = path.join(dir, "att.jsonl");
    writeFileSync(file, contents, "utf-8");
    const before = readFileSync(file);

    await runHandler({ archive: file, dryRun: true });

    const after = readFileSync(file);
    expect(after.equals(before)).toBe(true); // byte-for-byte identical
    const out = logged.join("\n");
    expect(out).toContain("dry-run, no write");
    // It reports the would-change (0 → 1) without having written it.
    expect(out).toContain(`${promptItem.itemId}: 0 → 1`);
  });

  it("falls back gracefully (exit 0, file untouched) when the challenge is unresolvable", async () => {
    const archiveItem = item({ output: PASSING_OUTPUT, rawOutput: PASSING_OUTPUT, score: 0 });
    const contents = await encodeArchive(baseManifest(), [archiveItem]);
    const file = path.join(dir, "att.jsonl");
    writeFileSync(file, contents, "utf-8");
    const before = readFileSync(file);

    // Point at a challenge file that does not exist → whole-archive fallback.
    await expect(
      runHandler({ archive: file, challenge: path.join(dir, "does-not-exist.yaml") }),
    ).resolves.toBeUndefined();

    const after = readFileSync(file);
    expect(after.equals(before)).toBe(true);
    expect(logged.join("\n")).toContain("challenge unresolvable");
  });

  it("surfaces a clear command-boundary error for a non-attempt (legacy/garbage) file", async () => {
    const file = path.join(dir, "legacy.jsonl");
    writeFileSync(file, '{"not":"an attempt manifest"}\ngarbage not even json\n', "utf-8");

    await expect(runHandler({ archive: file })).rejects.toThrow(
      "not an attempt archive (score no longer reads the legacy format)",
    );
    // The raw loader reason must NOT leak through.
    await expect(runHandler({ archive: file })).rejects.not.toThrow(
      /AttemptLoadIssue|is not JSON|is not an AttemptManifest/,
    );
  });

  it("prints drift/skip warnings in NORMAL (non-dry-run) mode, then writes", async () => {
    const smoke = await resolveSmoke();
    const promptItem = smokeConstraintItem(smoke);
    expect(promptItem).toBeDefined();
    if (promptItem === undefined) return;

    const realItem = item({
      itemId: promptItem.itemId,
      promptName: promptItem.itemId,
      promptHash: promptItem.promptHash,
      itemHash: promptItem.itemHash,
      output: PASSING_OUTPUT,
      rawOutput: PASSING_OUTPUT,
      score: 0,
    });
    // A drifted ghost item not present in the challenge → kept, warned, counts as drift.
    const ghost = item({ itemId: "ghost", promptName: "ghost", score: 1 });
    const contents = await encodeArchive(baseManifest(), [realItem, ghost]);
    const file = path.join(dir, "att.jsonl");
    writeFileSync(file, contents, "utf-8");

    await runHandler({ archive: file, dryRun: false });

    const out = logged.join("\n");
    // Drift/skip warning is surfaced even in a real write.
    expect(out).toContain("warn ghost: not in challenge");
    // Summary still reflects the drift count.
    expect(out).toContain("drift 1");
    // The file was actually rewritten (re-score applied 0 → 1 for the real item).
    const written = readFileSync(file, "utf-8");
    expect(written).toContain('"score":1');
  });

  it("v2 default re-scores from the store with no corpus dir", async () => {
    // Scorer: exact_match expects "4"; output "4" → score 1; but stored score is 0.
    const scorer: ScorerConfig = { type: "exact_match", expected: "4", extract: "(\\d+)" };
    const file = await writeV2AttemptWithStore(dir, {
      scorer,
      output: "4",
      score: 0,
      passThreshold: 1,
    });

    // NO prompts/challenges dir matching this archive exists — if the handler tried
    // to load a corpus it would fail because challengeId is "store-ch" (no yaml).
    await runHandler({ archive: file, corpus: false });

    const out = logged.join("\n");
    expect(out).toContain("PASS"); // aggregate passed (score 1 >= passThreshold 1)
    const written = readFileSync(file, "utf-8");
    expect(written).toContain('"score":1'); // item re-scored to 1 from store
    expect(written).toContain('"passed":true'); // manifest aggregate updated
  });

  it("--corpus applies the current corpus scorer (v2 archive + corpus flag)", async () => {
    const smoke = await resolveSmoke();
    const promptItem = smokeConstraintItem(smoke);
    expect(promptItem).toBeDefined();
    if (promptItem === undefined) return;

    // Build a v2 archive where:
    //   stored scorer: exact_match expects "4" → output "4" → stored score 1
    //   smoke corpus scorer: constraint keywords (rocket/orbit/gravity) → "4" → score 0
    // With --corpus=true the handler uses the REAL smoke corpus scorer → score 0.
    const storedScorer: ScorerConfig = { type: "exact_match", expected: "4", extract: "(\\d+)" };
    const sh = scorerHash(storedScorer);
    const configHash = "cfg-corpus-test";
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* writeBlob(dir, "prompts", promptItem.promptHash, promptItem.prompt.promptText);
        yield* writeBlob(dir, "scorers", sh, JSON.stringify(storedScorer));
        yield* writeBlob(dir, "system", configHash, "Be concise.");
      }).pipe(Effect.provide(NodeContext.layer)),
    );
    const header = {
      schemaVersion: 2,
      attemptId: "att-corpus",
      startedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:01:00.000Z",
      interrupted: false,
      configId: "corpus-config",
      configHash,
      artifact: "test/model",
      runtime: "llamacpp",
      quant: "q4",
      temperature: 0,
      systemPrompt: "default",
      maxTokens: 128,
      challengeId: "smoke",
      challengeVersion: 1,
      challengeHash: "chh",
      passThreshold: 1,
      env: {
        hostname: "h",
        platform: "p",
        runtimeVersion: "1",
        nodeVersion: "1",
        benchmarkGitSha: "s",
      },
      aggregate: { score: 1, passed: true },
    };
    const itemJson = {
      itemId: promptItem.itemId,
      promptName: promptItem.itemId,
      promptHash: promptItem.promptHash,
      itemHash: promptItem.itemHash,
      scorerHash: sh,
      executedAt: "2026-01-01T00:00:00.000Z",
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
    };
    const file = path.join(dir, "att-corpus.jsonl");
    writeFileSync(file, `${JSON.stringify(header)}\n${JSON.stringify(itemJson)}\n`, "utf-8");

    // --corpus=true → uses the REAL smoke corpus scorer (constraint keywords)
    // Output "4" does NOT contain rocket/orbit/gravity → score 0, FAIL.
    await runHandler({ archive: file, corpus: true });

    const out = logged.join("\n");
    expect(out).toContain("FAIL"); // smoke scorer didn't match "4"
    const written = readFileSync(file, "utf-8");
    expect(written).toContain('"score":0'); // item re-scored to 0 via corpus
    expect(written).toContain('"passed":false');
  });
});
