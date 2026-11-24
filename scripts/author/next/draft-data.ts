// Generate the data-work pilot sets (P1 extraction, P3 transform, P4 SQL,
// P5 regex, code-edit mutants) into releases/draft/challenges/. Run: npx tsx scripts/author/next/draft-data.ts
// Output is deterministic in (family, seed); data.test.ts checks the files on
// disk match a fresh render and that every gold answer passes its grader.

import { writeFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { suiteYaml } from "../emit.js";
import { codefixFamilies } from "./codefix.js";
import type { DataItem, DataSet } from "./data-common.js";
import { extractionFamilies } from "./extraction.js";
import { regexFamilies } from "./regex.js";
import { sqlFamilies } from "./sql.js";
import { transformFamilies } from "./transform.js";

export const NEXT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../releases/draft/challenges",
);

export const DATA_SETS: readonly DataSet[] = [
  { id: "extraction", families: extractionFamilies, seeds: [0, 1, 2, 3] },
  { id: "transform", families: transformFamilies, seeds: [0, 1, 2, 3] },
  { id: "sql", families: sqlFamilies, seeds: [0, 1, 2] },
  { id: "regex", families: regexFamilies, seeds: [0, 1, 2] },
  { id: "codefix", families: codefixFamilies, seeds: [0, 1, 2] },
];

/** Every item of a set, family-major. */
export const buildSet = (set: DataSet): DataItem[] =>
  set.families.flatMap((f) => set.seeds.map((s) => f.build(s)));

/** File name → content for every file the sets emit (YAML + code_exec test files). */
export const renderAll = (): Map<string, string> => {
  const files = new Map<string, string>();
  for (const set of DATA_SETS) {
    const items = buildSet(set);
    files.set(
      `${set.id}.yaml`,
      suiteYaml(
        set.id,
        items.map((i) => i.authored),
      ),
    );
    for (const i of items) if (i.testFile) files.set(i.testFile.name, i.testFile.content);
  }
  return files;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [name, content] of renderAll()) writeFileSync(path.join(NEXT_DIR, name), content);
  console.log(
    `wrote ${DATA_SETS.map((s) => `${s.id}.yaml`).join(", ")} (+ test files) to ${NEXT_DIR}`,
  );
}
