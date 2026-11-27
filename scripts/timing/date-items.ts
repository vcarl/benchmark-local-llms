// Date when each local item's prompt first became public: writes
// item-dates.json (docs/EVAL-TIMING.md). Run from the repo root:
//
//   npx tsx scripts/timing/date-items.ts
//
// Ground truth is the GitHub repository activity log of `origin` (server-side
// push times, including force-pushed and deleted branches). Every commit a
// push made reachable is public from that push; every YAML/JSON blob in such a
// commit is scanned for `prompt` / `prompt_text` strings, each hashed the way
// the harness names a single-turn prompt blob (sha256 of promptContent). The
// local items (every releases/<r>/challenges/ item, resolved by the harness)
// whose digest a public blob holds get an entry; existing entries are never
// changed. No entry = not public as of `asOf`. Reads the network; writes only
// the output file and fetches missing public commits into the object store.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { parse as parseYaml } from "yaml";
import {
  expandItem,
  listChallengeFiles,
  loadChallenge,
  promptContent,
} from "../../src/config/challenges.js";
import type { ChallengeItem } from "../../src/schema/challenge.js";
import { sha256Hex } from "../../src/store/digest.js";

const OUT = "item-dates.json";
const git = (...args: string[]) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 30 });

interface Entry {
  readonly publishedAt: string;
  readonly evidence: string;
}
interface Event {
  timestamp: string;
  activity_type: string;
  ref: string;
  before: string;
  after: string;
}

// 1. Local items: every release's challenges, resolved by the harness.
const local = new Map<string, string[]>(); // digest → item keys
for (const release of readdirSync("releases").sort()) {
  const dir = path.join("releases", release, "challenges");
  if (!existsSync(dir)) continue;
  const challenges = await Effect.runPromise(
    Effect.gen(function* () {
      const out = [];
      for (const f of yield* listChallengeFiles(dir)) out.push(yield* loadChallenge(f.path));
      return out;
    }).pipe(Effect.provide(NodeContext.layer)),
  );
  for (const c of challenges)
    for (const i of c.items) {
      const d = sha256Hex(promptContent(i.prompt));
      local.set(d, [...(local.get(d) ?? []), `${release}:${c.id}/${i.itemId}`]);
    }
}

// 2. Public commits: each first reachable at the earliest push that reached it.
const origin = git("remote", "get-url", "origin").trim();
const slug = origin.replace(/^.*github\.com[:/]/, "").replace(/\.git$/, "");
const events = execFileSync(
  "gh",
  ["api", `repos/${slug}/activity?per_page=100`, "--paginate", "--jq", ".[] | tojson"],
  { encoding: "utf8", maxBuffer: 1 << 28 },
)
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l) as Event)
  .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
const ZERO = /^0+$/;
const has = (sha: string) => {
  try {
    git("cat-file", "-e", `${sha}^{commit}`);
    return true;
  } catch {
    return false;
  }
};
const missing = [
  ...new Set(events.flatMap((e) => [e.before, e.after]).filter((s) => !ZERO.test(s))),
].filter((s) => !has(s));
if (missing.length > 0) git("fetch", "--no-write-fetch-head", "--no-tags", "origin", ...missing);
const firstPublic = new Map<string, Event>(); // commit → event
for (const e of events) {
  if (ZERO.test(e.after)) continue;
  for (const c of git("rev-list", e.after).split("\n").filter(Boolean))
    if (!firstPublic.has(c)) firstPublic.set(c, e);
}

// 3. Blobs: each first public with the earliest commit holding it.
const blobFirst = new Map<string, { event: Event; commit: string; file: string }>();
for (const [commit, event] of firstPublic) {
  for (const line of git("ls-tree", "-r", commit).split("\n")) {
    const m = /^\d+ blob ([0-9a-f]+)\t(.+\.(?:ya?ml|json))$/.exec(line);
    if (m === null) continue;
    const [, blob, file] = m as unknown as [string, string, string];
    const prior = blobFirst.get(blob);
    if (prior === undefined || event.timestamp < prior.event.timestamp)
      blobFirst.set(blob, { event, commit, file });
  }
}

// 4. Prompt strings in public blobs.
const PROMPT_KEYS = new Set(["prompt", "prompt_text"]);
const found = new Map<string, Entry>();
let unparsed = 0;
// A prompt string hashes as a single-turn prompt blob; a multi-turn item
// (`turns`) expands the harness's way, each turn under its gold history.
const walk = (v: unknown, onDigest: (d: string) => void): void => {
  if (Array.isArray(v)) for (const x of v) walk(x, onDigest);
  else if (v !== null && typeof v === "object") {
    if ("turns" in v && Array.isArray(v.turns) && typeof v.turns[0]?.prompt === "string") {
      for (const u of expandItem(v as ChallengeItem))
        onDigest(sha256Hex(promptContent({ promptText: u.item.prompt, history: u.history })));
      return;
    }
    for (const [k, x] of Object.entries(v)) {
      if (PROMPT_KEYS.has(k) && typeof x === "string")
        onDigest(sha256Hex(promptContent({ promptText: x })));
      else walk(x, onDigest);
    }
  }
};
// Self-check: the walk over the local YAML gives exactly the harness's digests.
const walked = new Set<string>();
for (const release of readdirSync("releases"))
  for (const f of existsSync(path.join("releases", release, "challenges"))
    ? readdirSync(path.join("releases", release, "challenges")).filter((n) => n.endsWith(".yaml"))
    : [])
    walk(parseYaml(readFileSync(path.join("releases", release, "challenges", f), "utf8")), (d) =>
      walked.add(d),
    );
if (walked.size !== local.size || [...local.keys()].some((d) => !walked.has(d)))
  throw new Error(`walk gives ${walked.size} digests over the local YAML, the harness ${local.size}`);

for (const [blob, at] of blobFirst) {
  const src = git("cat-file", "blob", blob);
  let doc: unknown;
  try {
    doc = at.file.endsWith(".json") ? JSON.parse(src) : parseYaml(src);
  } catch {
    unparsed++;
    continue;
  }
  walk(doc, (d) => {
    if (!local.has(d)) return;
    const prior = found.get(d);
    if (prior !== undefined && prior.publishedAt <= at.event.timestamp) return;
    const e = at.event;
    found.set(d, {
      publishedAt: e.timestamp,
      evidence: `GitHub activity ${e.activity_type} ${e.ref} ${e.before.slice(0, 8)}..${e.after.slice(0, 8)} at ${e.timestamp} (server time); commit ${at.commit.slice(0, 12)} ${at.file}`,
    });
  });
}

// 5. Merge: existing entries are never changed.
const prior: { items?: Record<string, Entry> } = existsSync(OUT)
  ? JSON.parse(readFileSync(OUT, "utf8"))
  : {};
const items: Record<string, Entry> = { ...Object.fromEntries(found), ...(prior.items ?? {}) };
const sorted = Object.fromEntries(Object.entries(items).sort(([a], [b]) => (a < b ? -1 : 1)));
writeFileSync(
  OUT,
  `${JSON.stringify({ asOf: new Date().toISOString().slice(0, 19) + "Z", source: `https://github.com/${slug}`, items: sorted }, null, 2)}\n`,
);
const dated = [...local.keys()].filter((d) => d in items).length;
console.log(
  `${events.length} activity events, ${firstPublic.size} public commits, ${blobFirst.size} blobs (${unparsed} unparsed); ` +
    `${local.size} local prompt digests: ${dated} dated, ${local.size - dated} not public`,
);
