import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect, Exit } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stableStringify } from "../config/hashing.js";
import type { LegacyManifest } from "../dataset/manifest.js";
import { freezeLegacy } from "./freeze.js";
import { computeConfigHash, computePromptHash, shortSha256 } from "./identity.js";
import { loadLegacyDataset } from "./pinned.js";
import { reconstructAttempt } from "./reconstruct.js";

const run = <A, E>(eff: Effect.Effect<A, E, NodeContext.NodeContext>) =>
  Effect.runPromiseExit(Effect.provide(eff, NodeContext.layer));
const ok = async <A, E>(eff: Effect.Effect<A, E, NodeContext.NodeContext>) =>
  Effect.runPromise(Effect.provide(eff, NodeContext.layer));
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const PROMPT = "What is 2+2?";
const PH = computePromptHash(PROMPT, "");
const SCORER = stableStringify({ type: "exact_match", expected: "4", extract: "(\\d+)" });
const SH = shortSha256(SCORER);
const SYSTEM = "Be concise.";
const CFG = computeConfigHash(
  { artifact: "a", runtime: "mlx", temperature: 0, maxTokens: 64 },
  SYSTEM,
);

const header = (over: Record<string, unknown>, env: Record<string, unknown> = {}) => ({
  schemaVersion: 2,
  attemptId: "att",
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
  env: {
    hostname: "h",
    platform: "p",
    runtimeVersion: "r",
    nodeVersion: "n",
    benchmarkGitSha: "g",
    ...env,
  },
  aggregate: { score: 1, passed: true },
  ...over,
});
const item = (over: Record<string, unknown> = {}) => ({
  itemId: "q",
  promptName: "q",
  promptHash: PH,
  itemHash: "ih",
  scorerHash: SH,
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
  ...over,
});
const jsonl = (...lines: unknown[]) => lines.map((l) => `${JSON.stringify(l)}\n`).join("");

let root: string;
const put = async (rel: string, content: string) => {
  const p = join(root, rel);
  await mkdir(join(p, ".."), { recursive: true });
  await writeFile(p, content);
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "freeze-"));
  await put(
    "challenges/ch.yaml",
    `id: ch\nversion: 1\npassThreshold: 1\nitems:\n  - name: q\n    category: math\n    tier: 1\n    prompt: What is 2+2?\n    scorer: exact_match\n    expected: "4"\n    extract: (\\\\d+)\n`,
  );
  // The dataset's own archive.
  await put(
    "arch/a1.jsonl",
    jsonl(
      header({ attemptId: "a1" }),
      item(),
      item({ itemId: "r", promptName: "r", promptHash: "nosuchprompt" }),
    ),
  );
  await put(`arch/content/prompts/${PH}.txt`, PROMPT);
  await put(`arch/content/scorers/${SH}.json`, SCORER);
  await put(`arch/content/system/${CFG}.txt`, SYSTEM);
  await put("arch/content/prompts/unreferenced00.txt", "x");
  await put(
    "arch/a2.jsonl",
    jsonl(
      header(
        {
          schemaVersion: 1,
          attemptId: "a2",
          configHash: "h2",
          finishedAt: null,
          interrupted: true,
        },
        { hardwareId: "hwX" },
      ),
    ),
  );
  await put("arch/smoke.jsonl", jsonl(header({ attemptId: "s", configId: "smoke-config" })));
  await put("arch/chains.jsonl", jsonl(header({ attemptId: "k", challengeId: "chains" })));
  await put("arch/junk.jsonl", "not json\n");
  await put("arch/notes.txt", "ignored");
  // A reused archive: only rows (configHash@hardware) the own archive has count.
  await put("reuse/r1.jsonl", jsonl(header({ attemptId: "r1", schemaVersion: 1 })));
  await put("reuse/r2.jsonl", jsonl(header({ attemptId: "r2", configHash: "other" })));
  await put("reuse/r3.jsonl", jsonl(header({ attemptId: "r3" }, { hardwareId: "hwY" })));
  await put("reuse/r4.jsonl", jsonl(header({ attemptId: "r4", configId: "smoke-config" })));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const freeze = () =>
  ok(
    freezeLegacy({
      archive: join(root, "arch"),
      reuse: join(root, "reuse"),
      challengesDir: join(root, "challenges"),
      legacyHardware: { id: "hwL" },
    }),
  );
const manifestOf = async (): Promise<LegacyManifest> => ({
  name: "d",
  title: "D",
  release: "0",
  evalVersion: "0.1",
  ranked: false,
  legacy: await freeze(),
});
const fileSha = async (rel: string) => sha(await readFile(join(root, rel), "utf8"));

describe("freezeLegacy", () => {
  it("lists exactly the attempts the report's rows read, pinned by sha256", async () => {
    const block = await freeze();
    expect(block.hardware).toEqual({ id: "hwL" });
    expect(Object.keys(block.archives)).toEqual(["arch", "reuse"]);
    expect(block.archives["arch"]?.attempts).toEqual({
      "a1.jsonl": await fileSha("arch/a1.jsonl"),
      "a2.jsonl": await fileSha("arch/a2.jsonl"),
    });
    expect(block.archives["reuse"]?.attempts).toEqual({
      "r1.jsonl": await fileSha("reuse/r1.jsonl"),
    });
  });

  it("pins the existing blobs that listed schemaVersion ≥ 2 attempts reference", async () => {
    const block = await freeze();
    expect(block.archives["arch"]?.blobs).toEqual({
      [`prompts/${PH}.txt`]: sha(PROMPT),
      [`scorers/${SH}.json`]: sha(SCORER),
      [`system/${CFG}.txt`]: sha(SYSTEM),
    });
    expect(block.archives["reuse"]?.blobs).toEqual({});
  });
});

describe("loadLegacyDataset", () => {
  it("loads the listed attempts, own archive first", async () => {
    const { attempts } = await ok(loadLegacyDataset(await manifestOf(), root));
    expect(attempts.map((a) => a.manifest.attemptId)).toEqual(["a1", "a2", "r1"]);
    expect(attempts[0]?.sourcePath).toBe(join(root, "arch", "a1.jsonl"));
  });

  it("rejects a tampered attempt file before parsing it", async () => {
    const m = await manifestOf();
    await put("arch/a2.jsonl", "tampered\n");
    const exit = await run(loadLegacyDataset(m, root));
    expect(exit).toEqual(
      Exit.fail(
        expect.objectContaining({
          _tag: "LegacyDigestMismatch",
          path: join(root, "arch", "a2.jsonl"),
        }),
      ),
    );
  });

  it("rejects a missing listed attempt file", async () => {
    const m = await manifestOf();
    await rm(join(root, "reuse", "r1.jsonl"));
    const exit = await run(loadLegacyDataset(m, root));
    expect(exit).toEqual(
      Exit.fail(expect.objectContaining({ _tag: "LegacyDigestMismatch", actual: null })),
    );
  });

  it("reconstructs through pinned blobs; a tampered blob fails typed", async () => {
    const m = await manifestOf();
    const { attempts, readBlob } = await ok(loadLegacyDataset(m, root));
    const a1 = attempts[0];
    if (a1 === undefined) throw new Error("no a1");
    // Item r's prompt blob does not exist: NotReconstructible, as without pins.
    const first = await run(reconstructAttempt({ ...a1, items: a1.items.slice(0, 1) }, readBlob));
    expect(Exit.isSuccess(first)).toBe(true);
    await put(`arch/content/system/${CFG}.txt`, "Be verbose.");
    const exit = await run(reconstructAttempt(a1, readBlob));
    expect(exit).toEqual(
      Exit.fail(expect.objectContaining({ _tag: "LegacyDigestMismatch", expected: sha(SYSTEM) })),
    );
  });

  it("treats an unlisted blob as absent", async () => {
    const m = await manifestOf();
    const arch = m.legacy.archives["arch"];
    if (arch === undefined) throw new Error("no arch");
    const { [`system/${CFG}.txt`]: _, ...blobs } = arch.blobs;
    const unpinned = {
      ...m,
      legacy: { ...m.legacy, archives: { ...m.legacy.archives, arch: { ...arch, blobs } } },
    };
    const { attempts, readBlob } = await ok(loadLegacyDataset(unpinned, root));
    const a1 = attempts[0];
    if (a1 === undefined) throw new Error("no a1");
    const exit = await run(reconstructAttempt({ ...a1, items: a1.items.slice(0, 1) }, readBlob));
    expect(exit).toEqual(Exit.fail(expect.objectContaining({ _tag: "NotReconstructible" })));
  });
});
