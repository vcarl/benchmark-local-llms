#!/usr/bin/env -S npx tsx
/**
 * One-off migration helper. Walks `benchmark-archive/*.jsonl` and prints a
 * per-model summary of recorded temperatures and prompt-drift counts so the
 * operator can populate `temperature:` in models.yaml.
 *
 * Usage:
 *   npx tsx scripts/inventory.ts [archive-dir] [prompts-dir]
 *
 * Defaults: ./benchmark-archive ./prompts
 */
import { Effect, Layer } from "effect";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { loadAllArchives } from "../src/report/load-archives.js";
import { loadPromptCorpus } from "../src/config/prompt-corpus.js";
import { loadScenarioCorpus } from "../src/config/scenario-corpus.js";
import { loadSystemPrompts, SystemPromptRegistry } from "../src/config/system-prompts.js";
import { scenariosSubdir, systemPromptsPath } from "../src/cli/paths.js";

const archiveDir = process.argv[2] ?? "./benchmark-archive";
const promptsDir = process.argv[3] ?? "./prompts";

interface ModelStats {
  readonly temps: Map<number, number>;
  readonly drifted: number;
  readonly total: number;
}

const modelKey = (model: string, runtime: string, quant: string) =>
  `${model}|${runtime}|${quant}`;

const program = Effect.gen(function* () {
  const registryLayer = Layer.effect(
    SystemPromptRegistry,
    loadSystemPrompts(systemPromptsPath(promptsDir)),
  );
  const promptCorpus = yield* loadPromptCorpus(promptsDir).pipe(
    Effect.provide(registryLayer),
  );
  const scenarioCorpus = yield* loadScenarioCorpus(scenariosSubdir(promptsDir));
  const promptIndex = Object.fromEntries(promptCorpus.map((p) => [p.name, p]));
  const scenarioIndex = Object.fromEntries(scenarioCorpus.map((s) => [s.name, s]));

  const loaded = yield* loadAllArchives(archiveDir);

  const stats = new Map<string, ModelStats>();
  for (const archive of loaded.archives) {
    for (const r of archive.data.results) {
      const key = modelKey(r.model, r.runtime, r.quant);
      const cur = stats.get(key) ?? { temps: new Map(), drifted: 0, total: 0 };
      const isScenario = r.scenarioName !== null;
      if (isScenario) {
        const entry = scenarioIndex[r.promptName];
        // For scenario rows, r.promptHash carries the scenarioHash value.
        const drifted =
          entry !== undefined && entry.scenarioHash !== r.promptHash ? 1 : 0;
        const next: ModelStats = {
          temps: new Map(cur.temps).set(r.temperature, (cur.temps.get(r.temperature) ?? 0) + 1),
          drifted: cur.drifted + drifted,
          total: cur.total + 1,
        };
        stats.set(key, next);
      } else {
        const entry = promptIndex[r.promptName];
        const drifted =
          entry !== undefined && entry.promptHash !== r.promptHash ? 1 : 0;
        const next: ModelStats = {
          temps: new Map(cur.temps).set(r.temperature, (cur.temps.get(r.temperature) ?? 0) + 1),
          drifted: cur.drifted + drifted,
          total: cur.total + 1,
        };
        stats.set(key, next);
      }
    }
  }

  if (loaded.issues.length > 0) {
    console.error(`Skipped ${loaded.issues.length} archive(s) with load errors:`);
    for (const issue of loaded.issues) {
      console.error(`  ${issue.path}: ${issue.reason}`);
    }
  }

  const sorted = [...stats.entries()].sort(([a], [b]) => a.localeCompare(b));
  console.log("Model | Runtime | Quant | Temperatures (count) | Drift / Total");
  for (const [key, s] of sorted) {
    const tempsList = [...s.temps.entries()]
      .sort(([a], [b]) => a - b)
      .map(([t, n]) => `${t}=${n}`)
      .join(", ");
    console.log(`${key} | ${tempsList} | ${s.drifted}/${s.total}`);
  }
});

NodeRuntime.runMain(program.pipe(Effect.provide(NodeContext.layer)));
