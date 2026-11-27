// Writes llms.txt and llms/**.md from a snapshots directory:
//   tsx webapp/src/llms/cli.ts <site-dir> --site-url <url> --data-origin <url>
// Reads <site-dir>/snapshots/ and writes next to it (scripts/deploy-pages.sh
// runs it on the built site). Output is a pure function of the snapshots and
// the two URLs.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import type { RowsDataset } from "../lib/rows";
import { parseIndex } from "../lib/snapshots";
import { renderLlms } from "./render";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { "site-url": { type: "string" }, "data-origin": { type: "string" } },
});
const [siteDir] = positionals;
const siteUrl = values["site-url"];
const dataOrigin = values["data-origin"];
if (siteDir === undefined || siteUrl === undefined || dataOrigin === undefined || !siteUrl.endsWith("/") || !dataOrigin.endsWith("/")) {
  console.error("usage: cli.ts <site-dir> --site-url <url/> --data-origin <url/>  (both URLs end in /)");
  process.exit(2);
}

const snapDir = path.join(siteDir, "snapshots");
const readJson = (f: string): unknown => JSON.parse(fs.readFileSync(path.join(snapDir, f), "utf8"));
const index = parseIndex(readJson("index.json"));
if (index === null) {
  console.error(`${snapDir}/index.json: missing or malformed`);
  process.exit(1);
}
const snapshots = new Map(index.map((e) => [e.digest, readJson(`${e.digest}.json`) as RowsDataset]));

let bytes = 0;
const files = renderLlms({ index, snapshots, siteUrl, dataOrigin });
for (const [rel, text] of files) {
  const file = path.join(siteDir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  bytes += Buffer.byteLength(text);
}
console.log(`llms: ${files.size} files, ${bytes} bytes → ${siteDir}`);
