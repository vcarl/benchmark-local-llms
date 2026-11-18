/**
 * Cut a prompt release's baseline:
 *
 *   npx tsx scripts/release-baseline.ts <YYYY.M> [--challenges-dir <dir>]
 *
 * 1. Refuses a version that is not CalVer `YYYY.M` or does not follow the
 *    current baseline release, and while any item differs from the current
 *    release-baseline.json without an erratum or an erratum id is out of
 *    sequence (the same checks `npm test` runs).
 * 2. Rewrites release-baseline.json at `release: <YYYY.M>` with every item's
 *    promptHash/scorerHash from the challenges directory (default: challenges/).
 * 3. Marks every `releaseStatus: next-release` erratum in errata.yaml as
 *    `released` with `releasedIn: <YYYY.M>`.
 *
 * Errata recorded afterwards are numbered `<YYYY.M>.1`, `<YYYY.M>.2`, ….
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
  errataIdProblems,
  ReleaseBaseline,
  releaseArgProblem,
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
  console.error("usage: tsx scripts/release-baseline.ts <YYYY.M> [--challenges-dir <dir>]");
  process.exit(2);
}

const prior = existsSync(baselinePath)
  ? Schema.decodeUnknownSync(ReleaseBaseline)(JSON.parse(readFileSync(baselinePath, "utf8")))
  : undefined;
const argProblem = releaseArgProblem(release, prior?.release);
if (argProblem !== undefined) {
  console.error(argProblem);
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

if (prior !== undefined) {
  const gaps = [
    ...coverageGaps(prior.items, current, errata),
    ...errataIdProblems(prior.release, errata),
  ];
  if (gaps.length > 0) {
    console.error(`errata since release ${prior.release} are incomplete:\n  ${gaps.join("\n  ")}`);
    process.exit(1);
  }
}

const date = new Date().toISOString().slice(0, 10);
writeFileSync(baselinePath, `${JSON.stringify({ release, date, items: current }, null, 2)}\n`);

let fixed = 0;
const seq = errataDoc?.get("errata");
if (errataDoc !== undefined && YAML.isSeq(seq)) {
  for (const node of seq.items) {
    if (YAML.isMap(node) && node.get("releaseStatus") === "next-release") {
      node.set("releaseStatus", "released");
      node.set("releasedIn", release);
      fixed++;
    }
  }
  writeFileSync(errataPath, errataDoc.toString());
}
console.log(
  `release ${release}: baseline of ${Object.keys(current).length} items written; ${fixed} next-release erratum(s) marked released; new errata number from ${release}.1`,
);
