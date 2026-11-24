// Pilot batches 1 (P2, P6, P7, P8) and 2: write the seeded sets to releases/draft/challenges/.
// Run: npx tsx scripts/author/next/draft-sets.ts

import { mkdirSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { writeSuiteFile } from "../emit.js";
import { classifyItems } from "./classify.js";
import type { Generated } from "./common.js";
import { dateItems } from "./dates.js";
import { followupItems } from "./followups.js";
import { ifevalItems } from "./ifeval.js";
import { longctxItems } from "./longctx.js";
import { stretchItems } from "./stretch.js";
import { toolcallItems } from "./toolcall.js";

export const OUT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../releases/draft/challenges",
);

export const SETS: Record<string, () => Generated[]> = {
  ifeval: ifevalItems,
  dates: dateItems,
  longctx: longctxItems,
  stretch: stretchItems,
  toolcall: toolcallItems,
  classify: classifyItems,
  followups: followupItems,
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [id, gen] of Object.entries(SETS)) {
    const items = gen().map((g) => g.authored);
    console.log("wrote", writeSuiteFile(OUT_DIR, id, items), `(${items.length} items)`);
  }
}
