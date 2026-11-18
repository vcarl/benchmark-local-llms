/**
 * Cut a prompt release's baseline:
 *
 *   npx tsx scripts/release-baseline.ts <release-label> [--challenges-dir <dir>]
 *
 * 1. Refuses while any item differs from the current release-baseline.json
 *    without an erratum (the same check `npm test` runs).
 * 2. Rewrites release-baseline.json with every item's promptHash/scorerHash
 *    from the challenges directory (default: challenges/).
 * 3. Marks every `promptFix: pending-next-release` erratum in errata.yaml as
 *    `fixed-in-release` with `release: <release-label>`.
 *
 * Without an existing release-baseline.json the coverage check is skipped
 * (bootstrapping the first baseline).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, Schema } from "effect";
import * as YAML from "yaml";
import { loadSelectedChallenges } from "../src/config/challenges.js";
import {
  coverageGaps,
  ErrataFile,
  ReleaseBaseline,
  snapshotItems,
} from "../src/config/errata.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = path.join(repoRoot, "release-baseline.json");
const errataPath = path.join(repoRoot, "errata.yaml");

const { values, positionals } = parseArgs({
  options: { "challenges-dir": { type: "string" } },
  allowPositionals: true,
});
const challengesDir = values["challenges-dir"] ?? path.join(repoRoot, "challenges");
const release = positionals[0];
if (release === undefined || positionals.length > 1) {
  console.error("usage: tsx scripts/release-baseline.ts <release-label> [--challenges-dir <dir>]");
  process.exit(2);
}

const { challenges } = await Effect.runPromise(
  loadSelectedChallenges(challengesDir).pipe(Effect.provide(NodeFileSystem.layer)),
);
const current = snapshotItems(challenges.map((c) => c.resolved));

const errataDoc = existsSync(errataPath)
  ? YAML.parseDocument(readFileSync(errataPath, "utf8"))
  : undefined;
const errata =
  errataDoc === undefined ? [] : Schema.decodeUnknownSync(ErrataFile)(errataDoc.toJS()).errata;

if (existsSync(baselinePath)) {
  const prior = Schema.decodeUnknownSync(ReleaseBaseline)(
    JSON.parse(readFileSync(baselinePath, "utf8")),
  );
  const gaps = coverageGaps(prior.items, current, errata);
  if (gaps.length > 0) {
    console.error(`changes since ${prior.release} lack errata:\n  ${gaps.join("\n  ")}`);
    process.exit(1);
  }
}

const date = new Date().toISOString().slice(0, 10);
writeFileSync(baselinePath, `${JSON.stringify({ release, date, items: current }, null, 2)}\n`);

let fixed = 0;
const seq = errataDoc?.get("errata");
if (errataDoc !== undefined && YAML.isSeq(seq)) {
  for (const node of seq.items) {
    if (YAML.isMap(node) && node.get("promptFix") === "pending-next-release") {
      node.set("promptFix", "fixed-in-release");
      node.set("release", release);
      fixed++;
    }
  }
  writeFileSync(errataPath, errataDoc.toString());
}
console.log(
  `release ${release}: baseline of ${Object.keys(current).length} items written; ${fixed} pending prompt fix(es) marked fixed-in-release`,
);
