import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect, Exit } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Erratum, ReleaseItem } from "../config/errata.js";
import {
  commitment,
  commitRelease,
  loadRelease,
  scorerDigestAt,
  syncRelease,
  verifyRelease,
} from "./release.js";

const ok = <A, E>(eff: Effect.Effect<A, E, NodeContext.NodeContext>) =>
  Effect.runPromise(Effect.provide(eff, NodeContext.layer));
const exit = <A, E>(eff: Effect.Effect<A, E, NodeContext.NodeContext>) =>
  Effect.runPromiseExit(Effect.provide(eff, NodeContext.layer));

const item = (prompt: string, scorer: string): ReleaseItem => ({
  prompt,
  scorer,
  scope: "core",
  family: "f",
});

describe("commitment", () => {
  const items = { "c/a": item("p1", "s1"), "c/b": item("p2", "s2") };

  it("is deterministic: key order and report metadata do not enter it", () => {
    const reordered = { "c/b": item("p2", "s2"), "c/a": { ...item("p1", "s1"), family: "g" } };
    expect(commitment(reordered)).toBe(commitment(items));
    expect(commitment(items)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes with any key, prompt or scorer digest", () => {
    const base = commitment(items);
    expect(commitment({ ...items, "c/a": item("p9", "s1") })).not.toBe(base);
    expect(commitment({ ...items, "c/a": item("p1", "s9") })).not.toBe(base);
    expect(commitment({ "c/z": item("p1", "s1"), "c/b": item("p2", "s2") })).not.toBe(base);
  });
});

describe("scorerDigestAt", () => {
  const erratum = (id: string, scorers: Record<string, string>): Erratum => ({
    id,
    date: "2027-04-01",
    kind: "scorer",
    items: Object.keys(scorers),
    description: "d",
    scorerChange: true,
    scorers,
    scoresChanged: { lines: 0, configs: 0 },
    releaseStatus: "none",
  });
  const release = {
    file: { release: "2027.1", items: { "c/a": item("p", "s0"), "c/b": item("p", "t0") } },
    errata: [erratum("2027.1.1", { "c/a": "s1" }), erratum("2027.1.2", { "c/b": "t2" })],
  };

  it("is the latest erratum <= n naming the item, else release.json's", () => {
    expect(scorerDigestAt(release, "2027.1.0", "c/a")).toBe("s0");
    expect(scorerDigestAt(release, "2027.1.1", "c/a")).toBe("s1");
    expect(scorerDigestAt(release, "2027.1.2", "c/a")).toBe("s1");
    expect(scorerDigestAt(release, "2027.1.1", "c/b")).toBe("t0");
    expect(scorerDigestAt(release, "2027.1.2", "c/b")).toBe("t2");
  });

  it("is release.json's for a draft (no eval version) and undefined for an unknown item", () => {
    expect(scorerDigestAt(release, null, "c/a")).toBe("s0");
    expect(scorerDigestAt(release, "2027.1.2", "c/zz")).toBeUndefined();
  });
});

const CHALLENGE = `id: arith
version: 1
passThreshold: 1
items:
  - name: add
    category: math
    tier: 1
    prompt: What is 2+2?
    scorer: exact_match
    expected: "4"
    extract: (\\d+)
  - name: mul
    category: math
    tier: 1
    prompt: What is 3*3?
    scorer: exact_match
    expected: "9"
    extract: (\\d+)
`;

describe("sync, commit and verify", () => {
  let root: string;
  let releases: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "release-"));
    releases = join(root, "releases");
    await mkdir(join(releases, "draft", "challenges"), { recursive: true });
    await writeFile(join(releases, "draft", "challenges", "arith.yaml"), CHALLENGE);
  });
  afterEach(() => rm(root, { recursive: true, force: true }));

  const problems = async (dir: string) => (await ok(verifyRelease(dir))).problems;

  it("syncs a draft: release.json + blobs, idempotent; a stale release.json fails verify", async () => {
    const draft = join(releases, "draft");
    const first = await ok(syncRelease(draft));
    expect(first).toEqual({ items: 2, blobsWritten: 4 });
    expect(await ok(syncRelease(draft))).toEqual({ items: 2, blobsWritten: 0 });
    const file = JSON.parse(await readFile(join(draft, "release.json"), "utf8"));
    expect(file.release).toBe("draft");
    expect(Object.keys(file.items)).toEqual(["arith/add", "arith/mul"]);
    expect(file.items["arith/add"].prompt).toMatch(/^[0-9a-f]{64}$/);
    expect(await problems(draft)).toEqual([]);

    await writeFile(
      join(draft, "challenges", "arith.yaml"),
      CHALLENGE.replace("What is 3*3?", "What is 3*4?"),
    );
    expect((await problems(draft)).join("\n")).toMatch(/out of sync/);
  });

  it("commits the draft as YYYY.N and verifies; refuses a bad name or an existing release", async () => {
    await ok(syncRelease(join(releases, "draft")));
    const r = await ok(commitRelease(releases, "2027.1", join(releases, "draft")));
    expect(r.commitment).toMatch(/^[0-9a-f]{64}$/);
    const dir = join(releases, "2027.1");
    const file = JSON.parse(await readFile(join(dir, "release.json"), "utf8"));
    expect(file).toMatchObject({ release: "2027.1", commitment: r.commitment });
    expect(typeof file.committedAt).toBe("string");
    expect(await readFile(join(dir, "errata.yaml"), "utf8")).toBe("errata: []\n");
    expect(await readdir(join(dir, "blobs"))).toHaveLength(4);
    const v = await ok(verifyRelease(dir));
    expect(v.problems).toEqual([]);
    expect(v.ok.join("\n")).toContain(r.commitment);
    expect((await ok(loadRelease(dir))).file.items).toEqual(file.items);

    expect(
      Exit.isFailure(await exit(commitRelease(releases, "2027.1", join(releases, "draft")))),
    ).toBe(true);
    expect(
      Exit.isFailure(await exit(commitRelease(releases, "2027.0", join(releases, "draft")))),
    ).toBe(true);
    expect(
      Exit.isFailure(await exit(commitRelease(releases, "2026.2", join(releases, "draft")))),
    ).toBe(true);
  });

  describe("verify fails on", () => {
    let dir: string;
    beforeEach(async () => {
      await ok(commitRelease(releases, "2027.1", join(releases, "draft")));
      dir = join(releases, "2027.1");
    });

    it("a tampered blob", async () => {
      const [blob] = await readdir(join(dir, "blobs"));
      await writeFile(join(dir, "blobs", blob as string), "tampered");
      expect((await problems(dir)).join("\n")).toMatch(/hashes to/);
    });

    it("an unparseable challenge file, naming the file", async () => {
      await writeFile(join(dir, "challenges", "arith.yaml"), "items: [unclosed\n");
      expect((await problems(dir)).join("\n")).toMatch(/challenges: .*arith\.yaml/);
    });

    it("a missing blob", async () => {
      const [blob] = await readdir(join(dir, "blobs"));
      await rm(join(dir, "blobs", blob as string));
      expect((await problems(dir)).join("\n")).toMatch(/no blob/);
    });

    it("a tampered challenge", async () => {
      await writeFile(join(dir, "challenges", "arith.yaml"), CHALLENGE.replace('"9"', '"10"'));
      expect(await problems(dir)).toEqual([
        "arith/mul: scorer changed without an erratum (scorerChange: true)",
      ]);
    });

    it("a wrong commitment", async () => {
      const file = JSON.parse(await readFile(join(dir, "release.json"), "utf8"));
      file.commitment = "0".repeat(64);
      await writeFile(join(dir, "release.json"), JSON.stringify(file));
      expect((await problems(dir)).join("\n")).toMatch(/commitment/);
    });
  });
});
