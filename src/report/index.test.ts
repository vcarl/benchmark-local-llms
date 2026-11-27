import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect, Exit } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scoreDataset } from "../cli/commands/score.js";
import { loadChallenge } from "../config/challenges.js";
import { stableStringify } from "../config/hashing.js";
import { writeManifest } from "../dataset/manifest.js";
import { freezeLegacy } from "../legacy/freeze.js";
import {
  computeConfigHash,
  computePromptHash,
  legacyItemIdentity,
  shortSha256,
} from "../legacy/identity.js";
import { resolveItems } from "../release/release.js";
import { SCORING_RULES, scorerBlob } from "../scoring/rules.js";
import { type IndexEntry, orderIndex, type ReportOptions, runReport } from "./index.js";

const run = <A, E>(eff: Effect.Effect<A, E, NodeContext.NodeContext>) =>
  Effect.runPromise(Effect.provide(eff, NodeContext.layer));
const exit = <A, E>(eff: Effect.Effect<A, E, NodeContext.NodeContext>) =>
  Effect.runPromiseExit(Effect.provide(eff, NodeContext.layer));
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

const PROMPT = "What is 2+2?";
const PH = computePromptHash(PROMPT, "");
const SCORER = stableStringify({ type: "exact_match", expected: "4", extract: "(\\d+)" });
const SH = shortSha256(SCORER);
const SYSTEM = "Be concise.";
const CFG = computeConfigHash(
  { artifact: "a", runtime: "mlx", temperature: 0, maxTokens: 64 },
  SYSTEM,
);

const attempt = (id: string, startedAt: string, itemHash: string) =>
  [
    {
      schemaVersion: 2,
      attemptId: id,
      startedAt,
      finishedAt: startedAt,
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
      },
      aggregate: { score: 1, passed: true },
    },
    {
      itemId: "q",
      promptName: "q",
      promptHash: PH,
      itemHash,
      scorerHash: SH,
      executedAt: startedAt,
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
    },
  ]
    .map((l) => `${JSON.stringify(l)}\n`)
    .join("");

const erratum = (id: string) => `  - id: "${id}"
    date: 2026-01-01
    kind: prompt-ambiguity
    items: [ch/q]
    description: d${id}
    notes: internal
    scorerChange: false
    scoresChanged: { lines: 0, configs: 0 }
    releaseStatus: none
`;

let root: string;
let opts: ReportOptions;
const put = async (rel: string, content: string) => {
  const p = join(root, rel);
  await mkdir(join(p, ".."), { recursive: true });
  await writeFile(p, content);
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "report-"));
  await put(
    "releases/0/challenges/ch.yaml",
    `id: ch\nversion: 1\npassThreshold: 1\nitems:\n  - name: q\n    category: math\n    tier: 1\n    family: fam\n    prompt: What is 2+2?\n    scorer: exact_match\n    expected: "4"\n    extract: (\\d+)\n`,
  );
  await put("releases/0/errata.yaml", `errata:\n${erratum("0.1")}${erratum("0.2")}`);
  const ch = await run(loadChallenge(join(root, "releases/0/challenges/ch.yaml")));
  await put(
    "releases/0/release.json",
    `${JSON.stringify({ release: "0", closed: "0.2", items: resolveItems([ch], "0").items })}\n`,
  );
  await put(
    "arch/a1.jsonl",
    attempt("a1", "2026-01-02T00:00:00.000Z", legacyItemIdentity(ch).items[0]?.itemHash ?? ""),
  );
  await put(`arch/content/prompts/${PH}.txt`, PROMPT);
  await put(`arch/content/scorers/${SH}.json`, SCORER);
  await put(`arch/content/system/${CFG}.txt`, SYSTEM);
  const legacy = await run(
    freezeLegacy({
      archive: join(root, "arch"),
      challengesDir: join(root, "releases/0/challenges"),
      legacyHardware: { id: "hw" },
    }),
  );
  await mkdir(join(root, "datasets"));
  await run(
    writeManifest(join(root, "datasets/alpha.yaml"), {
      name: "alpha",
      title: "Alpha challenge set",
      release: "0",
      evalVersion: "0.1",
      ranked: false,
      legacy,
    }),
  );
  opts = {
    datasetsDir: join(root, "datasets"),
    store: join(root, "store"),
    releasesDir: join(root, "releases"),
    legacyRoot: root,
    output: join(root, "out"),
    configsPath: join(root, "configs.yaml"),
    itemDatesPath: join(root, "item-dates.json"),
    modelDatesPath: join(root, "model-dates.yaml"),
    harnessGitSha: "f".repeat(40),
  };
});
afterEach(() => rm(root, { recursive: true, force: true }));

const files = async (dir: string): Promise<Record<string, string>> => {
  const out: Record<string, string> = {};
  for (const e of await readdir(dir, { recursive: true, withFileTypes: true }))
    if (e.isFile()) {
      const p = join(e.parentPath, e.name);
      out[p.slice(dir.length)] = await readFile(p, "utf8");
    }
  return out;
};

describe("runReport (legacy manifest)", () => {
  it("prunes detail files no indexed snapshot references", async () => {
    await put("out/details/orphan.json", "{}");
    const summary = await run(runReport(opts));
    expect(summary.detailsPruned).toBe(1);
    expect((await readdir(join(opts.output, "details"))).sort()).toEqual(["a1.json"]);
  });

  it("writes the snapshot under the digest of its bytes, its details and the index", async () => {
    const itemDates = `${JSON.stringify({ asOf: "2026-02-01T00:00:00Z", source: "s", items: { [sha(PROMPT)]: { publishedAt: "2026-01-01T12:00:00Z", evidence: "e" } } })}\n`;
    const modelDates = 'a:\n  released: "2025-12"\n  releasedSource: https://example.test\n';
    await put("item-dates.json", itemDates);
    await put("model-dates.yaml", modelDates);
    const summary = await run(runReport(opts));
    const entry = summary.snapshots[0]?.entry as IndexEntry;
    const bytes = await readFile(join(opts.output, `${entry.digest}.json`));
    expect(sha(bytes)).toBe(entry.digest);
    const snap = JSON.parse(bytes.toString());
    expect(bytes.toString()).toBe(stableStringify(snap));
    expect(snap.schemaVersion).toBe(4);
    expect(snap.dataset).toMatchObject({
      label: "alpha",
      release: "0",
      version: "0.1",
      ranked: false,
      legacy: true,
    });
    // Errata up to the eval version, public fields only.
    expect(snap.dataset.errata.map((e: { id: string }) => e.id)).toEqual(["0.1"]);
    expect(snap.dataset.errata[0].notes).toBeUndefined();
    expect(snap.inputs).toEqual({
      manifest: sha(await readFile(join(root, "datasets/alpha.yaml"))),
      release: sha(await readFile(join(root, "releases/0/release.json"))),
      configs: null,
      itemDates: sha(itemDates),
      modelDates: sha(modelDates),
      runners: [],
      // A closed release's line graded by its item's current scorer keeps its stored (Rules 1) score.
      scoringRules: [1],
      harnessGitSha: "f".repeat(40),
      harnessDirty: false,
    });
    expect(snap.rows[0].cells.ch.sourceAttempts).toEqual(["a1"]);
    // Timing sits beside the rows: the item public 2026-01-01, model "a" released 2025-12.
    expect(snap.timing.rows[snap.rows[0].rowId].ch).toEqual({
      unpublished: 0,
      predates: 1,
      "cutoff-claimed": 0,
      exposable: 0,
      unknown: 0,
    });
    expect(snap.timing.items["ch/q"]).toEqual({
      publishedAt: "2026-01-01T12:00:00Z",
      evidence: "e",
    });
    expect(snap.timing.models.a).toEqual({
      released: "2025-12",
      releasedSource: "https://example.test",
    });
    expect(snap.rows[0].hardwareId).toBe("hw");
    const detail = JSON.parse(await readFile(join(opts.output, "details/a1.json"), "utf8"));
    expect(detail.items[0]).toMatchObject({ family: "fam" });
    const pack = JSON.parse(
      await readFile(join(opts.output, `prompts/${detail.prompts}.json`), "utf8"),
    );
    expect(Object.values(pack)).toEqual([PROMPT]);
    expect(JSON.parse(await readFile(join(opts.output, "index.json"), "utf8"))).toEqual({
      snapshots: [
        {
          dataset: "alpha",
          title: "Alpha challenge set",
          release: "0",
          evalVersion: "0.1",
          ranked: false,
          legacy: true,
          digest: entry.digest,
          rows: 1,
          challenges: 1,
          span: "2026-01-02 – 2026-01-02",
        },
      ],
    });
  });

  it("rebuilds byte-identically", async () => {
    await run(runReport(opts));
    const first = await files(opts.output);
    await run(runReport({ ...opts, output: join(root, "out2") }));
    expect(await files(join(root, "out2"))).toEqual(first);
    const again = await run(runReport(opts));
    expect(again.snapshots.map((s) => s.written)).toEqual([false]);
    expect(await files(opts.output)).toEqual(first);
  });

  it("never rewrites a snapshot file: other bytes under its digest fail the build", async () => {
    const { snapshots } = await run(runReport(opts));
    const file = join(opts.output, `${snapshots[0]?.entry.digest}.json`);
    await writeFile(file, "{}");
    const r = await exit(runReport(opts));
    expect(Exit.isFailure(r) && String(r.cause)).toMatch(/SnapshotInvalid.*different bytes/s);
    expect(await readFile(file, "utf8")).toBe("{}");
  });

  it("keeps earlier index entries whose snapshot file is still present", async () => {
    const old = (digest: string, over: Partial<IndexEntry> = {}): IndexEntry => ({
      dataset: "alpha",
      title: "Alpha challenge set",
      release: "0",
      evalVersion: "0.1",
      ranked: false,
      legacy: true,
      digest,
      rows: 1,
      challenges: 1,
      span: null,
      ...over,
    });
    const kept = sha('{"rows":[]}');
    await put(`out/${kept}.json`, '{"rows":[]}');
    await put(`out/${"e".repeat(64)}.json`, "edited");
    await put(
      "out/index.json",
      JSON.stringify({
        snapshots: [
          old("gone"),
          old(kept, { evalVersion: "0.2" }),
          old("e".repeat(64), { evalVersion: "0.2" }),
        ],
      }),
    );
    const summary = await run(runReport(opts));
    expect(summary.kept).toBe(1);
    const index = JSON.parse(await readFile(join(opts.output, "index.json"), "utf8"));
    // An entry whose file's bytes no longer hash to its digest is dropped.
    expect(index.snapshots.map((e: IndexEntry) => e.digest)).toEqual([
      kept,
      summary.snapshots[0]?.entry.digest,
    ]);
  });

  describe("one snapshot per dataset and eval version", () => {
    const prior = (digest: string, evalVersion: string | null): IndexEntry => ({
      dataset: "alpha",
      title: "Alpha challenge set",
      release: "0",
      evalVersion,
      ranked: false,
      legacy: true,
      digest,
      rows: 1,
      challenges: 1,
      span: null,
    });
    // A seeded file is a minimal snapshot, so its digest is `sha(snap(label))`.
    const snap = (label: string) => JSON.stringify({ rows: [], label });
    const seed = async (labels: Record<string, IndexEntry>) => {
      const entries = Object.values(labels);
      for (const [label, e] of Object.entries(labels))
        await put(`out/${e.digest}.json`, snap(label));
      await put("out/index.json", JSON.stringify({ snapshots: entries }));
    };
    const listed = async () =>
      JSON.parse(await readFile(join(opts.output, "index.json"), "utf8")).snapshots.map(
        (e: IndexEntry) => e.digest,
      );
    const exists = (d: string) =>
      readFile(join(opts.output, `${d}.json`)).then(
        () => true,
        () => false,
      );

    it("a rebuild replaces the same-eval-version entry and deletes its file", async () => {
      const { snapshots } = await run(runReport(opts));
      const fresh = snapshots[0]?.entry;
      const stale = sha(snap("stale"));
      await seed({ stale: fresh ? { ...fresh, digest: stale } : prior(stale, "0.1") });
      const again = await run(runReport(opts));
      expect(await listed()).toEqual([again.snapshots[0]?.entry.digest]);
      expect(await exists(stale)).toBe(false);
    });

    it("keeps an earlier eval version of the same dataset", async () => {
      const old = sha(snap("old"));
      await seed({ old: prior(old, "0.0") });
      const s = await run(runReport(opts));
      expect(await listed()).toEqual([s.snapshots[0]?.entry.digest, old]);
      expect(await exists(old)).toBe(true);
    });

    it("keeps one snapshot of a draft (null eval version)", async () => {
      const [a, b] = [sha(snap("a")), sha(snap("b"))];
      await seed({ a: prior(a, null), b: prior(b, null) });
      const s = await run(runReport(opts));
      const fresh = s.snapshots[0]?.entry;
      expect(fresh?.evalVersion).not.toBeNull();
      // Two null-version entries share one slot: the first in index order stays, the other goes.
      expect(await listed()).toContain(a);
      expect(await listed()).not.toContain(b);
      expect(await exists(b)).toBe(false);
    });
  });

  it("fails naming a challenge file that does not load", async () => {
    await put("releases/0/challenges/bad.yaml", "id: [unterminated\n");
    const r = await exit(runReport(opts));
    expect(Exit.isFailure(r) && String(r.cause)).toMatch(/bad\.yaml/);
  });

  it("fails naming the items whose challenge YAML drifted from release.json", async () => {
    await put(
      "releases/0/challenges/ch.yaml",
      (await readFile(join(root, "releases/0/challenges/ch.yaml"), "utf8")).replace(
        'expected: "4"',
        'expected: "5"',
      ),
    );
    const r = await exit(runReport(opts));
    expect(Exit.isFailure(r) && String(r.cause)).toMatch(
      /ch\/q: scorer changed without an erratum/,
    );
  });

  it("records configs.yaml by digest, fails on an unparseable one, and marks a dirty harness", async () => {
    await put("configs.yaml", "configs: []\n");
    const entry = (await run(runReport({ ...opts, harnessDirty: true }))).snapshots[0]?.entry;
    const snap = JSON.parse(await readFile(join(opts.output, `${entry?.digest}.json`), "utf8"));
    expect(snap.inputs).toMatchObject({
      configs: sha("configs: []\n"),
      harnessGitSha: `${"f".repeat(40)}-dirty`,
      harnessDirty: true,
    });
    await put("configs.yaml", "configs: [\n");
    const r = await exit(runReport(opts));
    expect(Exit.isFailure(r) && String(r.cause)).toMatch(/configs\.yaml/);
  });

  it("fails when a listed attempt file no longer matches its pin", async () => {
    const p = join(root, "arch/a1.jsonl");
    await writeFile(p, (await readFile(p, "utf8")).replace('"output":"4"', '"output":"5"'));
    const r = await exit(runReport(opts));
    expect(Exit.isFailure(r) && String(r.cause)).toMatch(/LegacyDigestMismatch/);
  });
});

describe("orderIndex", () => {
  const e = (
    dataset: string,
    release: string,
    evalVersion: string | null,
    legacy: boolean,
    digest = dataset,
  ): IndexEntry => ({
    dataset,
    title: dataset,
    release,
    evalVersion,
    ranked: !legacy && release !== "draft",
    legacy,
    digest,
    rows: 0,
    challenges: 0,
    span: null,
  });
  it("alpha, other legacy, releases newest first (newest eval version first), drafts last", () => {
    const entries = [
      e("draft", "draft", null, true),
      e("2027.1", "2027.1", "2027.1.0", false, "a"),
      e("next", "draft", null, false),
      e("2027.2", "2027.2", "2027.2.0", false),
      e("2027.1", "2027.1", "2027.1.1", false, "b"),
      e("old", "0", "0.6", true),
      e("alpha", "0", "0.7", true),
    ];
    expect(orderIndex(entries, new Set()).map((x) => `${x.dataset}@${x.evalVersion}`)).toEqual([
      "alpha@0.7",
      "old@0.6",
      "2027.2@2027.2.0",
      "2027.1@2027.1.1",
      "2027.1@2027.1.0",
      "draft@null",
      "next@null",
    ]);
  });
  it("puts this build's snapshot before an earlier one of the same dataset and eval version", () => {
    const entries = [e("alpha", "0", "0.7", true, "a"), e("alpha", "0", "0.7", true, "b")];
    expect(orderIndex(entries, new Set(["b"])).map((x) => x.digest)).toEqual(["b", "a"]);
  });
});

describe("snapshot release file and ranked flag", () => {
  const snapshot = async () => {
    const entry = (await run(runReport(opts))).snapshots[0]?.entry as IndexEntry;
    return JSON.parse(await readFile(join(opts.output, `${entry.digest}.json`), "utf8"));
  };

  it("carries release.json without items and the manifest's ranked flag", async () => {
    const manifest = join(root, "datasets/alpha.yaml");
    await writeFile(
      manifest,
      (await readFile(manifest, "utf8")).replace("ranked: false", "ranked: true"),
    );
    const snap = await snapshot();
    expect(snap.releaseFile).toEqual({ release: "0", closed: "0.2" });
    expect(snap.dataset.ranked).toBe(true);
  });
});

describe("legacy lines graded under an earlier scorer", () => {
  // Same prompt, new answer key: the archived line (stored score 1, output "4") is regraded to 0.
  // The new key is erratum 0.2, which records the scorer it put in effect.
  const rekey = async () => {
    await put(
      "releases/0/challenges/ch.yaml",
      `id: ch\nversion: 1\npassThreshold: 1\nitems:\n  - name: q\n    category: math\n    tier: 1\n    family: fam\n    prompt: What is 2+2?\n    scorer: exact_match\n    expected: "5"\n    extract: (\\d+)\n`,
    );
    const ch = await run(loadChallenge(join(root, "releases/0/challenges/ch.yaml")));
    const scorer = resolveItems([ch], "0").items["ch/q"]?.scorer;
    await put(
      "releases/0/errata.yaml",
      `errata:\n${erratum("0.1")}${erratum("0.2")
        .replace("scorerChange: false", `scorerChange: true\n    scorers: { "ch/q": "${scorer}" }`)
        .replace("kind: prompt-ambiguity", "kind: answer-key")}`,
    );
  };
  const score = () =>
    run(
      scoreDataset({
        name: "alpha",
        datasetsDir: opts.datasetsDir,
        store: opts.store,
        releasesDir: opts.releasesDir,
        legacyRoot: opts.legacyRoot,
        harnessGitSha: "f".repeat(40),
      }),
    );

  it("a scorer-only change keeps the line counted, failing the report until ./bench score grades it", async () => {
    await rekey();
    const before = await exit(runReport(opts));
    expect(Exit.isFailure(before) && String(before.cause)).toMatch(
      /run \.\/bench score --dataset alpha/,
    );
    expect((await score()).appended).toBe(1);
    expect((await score()).appended).toBe(0);
    const entry = (await run(runReport(opts))).snapshots[0]?.entry as IndexEntry;
    const snap = JSON.parse(await readFile(join(opts.output, `${entry.digest}.json`), "utf8"));
    expect(snap.rows[0].cells.ch).toMatchObject({ status: "scored", passed: 0 });
    const detail = JSON.parse(await readFile(join(opts.output, "details/a1.json"), "utf8"));
    expect(detail.items[0]).toMatchObject({ score: 0, scorer: { expected: "5" } });
    expect(snap.inputs.scoringRules).toEqual([SCORING_RULES]);
  });

  it("a pinned rowsDigest fails a build whose rows differ, and passes an identical one", async () => {
    const entry = (await run(runReport(opts))).snapshots[0]?.entry as IndexEntry;
    const rows = JSON.parse(await readFile(join(opts.output, `${entry.digest}.json`), "utf8")).rows;
    const manifest = join(root, "datasets/alpha.yaml");
    const src = await readFile(manifest, "utf8");
    await writeFile(
      manifest,
      src.replace("ranked:", `rowsDigest: ${sha(stableStringify(rows))}\nranked:`),
    );
    await run(runReport(opts));
    await rekey();
    await score();
    const changed = await exit(runReport(opts));
    expect(Exit.isFailure(changed) && String(changed.cause)).toMatch(/differs from the pinned/);
  });

  it("an open release needs a record even for a line whose 12-hex scorerHash is current", async () => {
    const yaml = await readFile(join(root, "releases/0/challenges/ch.yaml"), "utf8");
    await put("releases/draft/challenges/ch.yaml", yaml);
    const ch = await run(loadChallenge(join(root, "releases/draft/challenges/ch.yaml")));
    const blob = scorerBlob(ch.items[0]?.scorer as never);
    await put(`releases/draft/blobs/${sha(blob)}`, blob);
    await put(`releases/draft/blobs/${sha(PROMPT)}`, PROMPT);
    const item = { prompt: sha(PROMPT), scorer: sha(blob), scope: "core", family: "fam" };
    await put(
      "releases/draft/release.json",
      `${JSON.stringify({ release: "draft", items: { "ch/q": item } })}\n`,
    );
    const manifest = join(root, "datasets/alpha.yaml");
    await writeFile(
      manifest,
      (await readFile(manifest, "utf8"))
        .replace('release: "0"', "release: draft")
        .replace('evalVersion: "0.1"', "evalVersion: null"),
    );
    // A draft's challenges must match its release.json exactly, naming the items that drift.
    await put("releases/draft/challenges/ch.yaml", yaml.replace("What is 2+2?", "What is 2+3?"));
    const drift = await exit(runReport(opts));
    expect(Exit.isFailure(drift) && String(drift.cause)).toMatch(/ch\/q/);
    await put("releases/draft/challenges/ch.yaml", yaml);
    const before = await exit(runReport(opts));
    expect(Exit.isFailure(before) && String(before.cause)).toMatch(
      /run \.\/bench score --dataset alpha/,
    );
    expect((await score()).appended).toBe(1);
    const entry = (await run(runReport(opts))).snapshots[0]?.entry as IndexEntry;
    const snap = JSON.parse(await readFile(join(opts.output, `${entry.digest}.json`), "utf8"));
    expect(snap.rows[0].cells.ch).toMatchObject({ status: "scored", passed: 1 });
    expect(snap.inputs.scoringRules).toEqual([SCORING_RULES]);
  });

  it("a closed release's line graded by the current scorer needs no record and keeps its stored score", async () => {
    expect((await score()).appended).toBe(0);
    const entry = (await run(runReport(opts))).snapshots[0]?.entry as IndexEntry;
    const snap = JSON.parse(await readFile(join(opts.output, `${entry.digest}.json`), "utf8"));
    expect(snap.rows[0].cells.ch).toMatchObject({ status: "scored", passed: 1 });
  });
});
