/**
 * RunManifest reconstruction (requirements §11.1).
 *
 * A prototype archive has no manifest header — the migration tool must
 * synthesize one. We use:
 *
 * - **archiveId** — the synthesized stem `{date}_{modelSlug}_{quant}_migrated`
 *   derived from the group identity. Deterministic so re-running migration
 *   produces the same IDs. Used as the output filename (`{archiveId}.jsonl`).
 * - **runId** — the logical-run group id stamped on every record. For
 *   migrated archives this is `legacy-{archiveId}` so legacy data is clearly
 *   distinguishable from real run-id-grouped archives produced by `bench run`.
 * - **startedAt / finishedAt** — the file's mtime (§11.1). All records in a
 *   group share this timestamp; the original per-execution timing is gone.
 * - **env** — synthesized placeholder. `benchmarkGitSha: "migrated"` marks
 *   the archive as reconstructed so downstream reports can flag it.
 * - **promptCorpus / scenarioCorpus** — loaded from the CURRENT `prompts/`
 *   YAML and embedded. Prompts that no longer exist in YAML cannot be matched;
 *   those records are listed in the returned `unmatched` and dropped from the
 *   manifest's result set (or included with a best-effort entry — see below).
 *
 * Prompt-name resolution (best-effort):
 *
 *   - **Direct match** — prototype name equals a current corpus name. Common
 *     for scenarios (`bootstrap_grind`, `combat_pirate`) which didn't change.
 *   - **Stripped suffix** — prototype `foo__tN_style` becomes `foo_{style}`
 *     if current corpus has a prompt by that name. This handles the
 *     2025-era → 2026-era prompt rename (E2 dropped the __tN_ suffix).
 *   - **Tier-1 fallback** — prototype `foo` (no suffix) matches `foo_direct`
 *     or `foo` in the current corpus.
 *
 * Unmatched records are dropped: the new ExecutionResult requires a
 * `promptHash` that we can only get from the corpus. Rather than fabricate,
 * we surface them to the operator.
 */
import { Effect } from "effect";
import type {
  ExecutionResult,
  PromptCorpusEntry,
  RunEnv,
  RunManifest,
  ScenarioCorpusEntry,
} from "../schema/index.js";
import type { GroupKey, PrototypeGroup } from "./group-by-model.js";
import type { PrototypeRecord } from "./read-prototype.js";

const STRIP_SUFFIX_RE = /^(.*)__t\d+_(.+)$/;

/**
 * Try to find a corpus entry for a prototype prompt name.
 *
 * Returns the matched name in the current corpus, or `null` if no match.
 * Prefers direct, then stripped-suffix, then bare-name → `_direct`, then
 * bare-name → `_<anything>`.
 */
export const resolvePromptName = (
  protoName: string,
  promptCorpus: Record<string, PromptCorpusEntry>,
  scenarioCorpus: Record<string, ScenarioCorpusEntry>,
  isScenario: boolean,
): string | null => {
  const corpus: Record<string, { name: string }> = isScenario ? scenarioCorpus : promptCorpus;
  if (protoName in corpus) return protoName;

  // `foo__tN_style` → try `foo_style`
  const m = STRIP_SUFFIX_RE.exec(protoName);
  if (m !== null) {
    const stem = m[1];
    const style = m[2];
    if (stem !== undefined && style !== undefined) {
      const candidate = `${stem}_${style}`;
      if (candidate in corpus) return candidate;
      // tier-style combos sometimes dropped style entirely
      if (stem in corpus) return stem;
    }
  }

  // Bare name → `foo_direct`
  const directCandidate = `${protoName}_direct`;
  if (directCandidate in corpus) return directCandidate;

  // Bare name → match any `foo_*`
  const prefix = `${protoName}_`;
  const suffixMatches = Object.keys(corpus).filter((k) => k.startsWith(prefix));
  if (suffixMatches.length === 1) {
    const first = suffixMatches[0];
    if (first !== undefined) return first;
  }

  return null;
};

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "model";

/**
 * Deterministic synthetic archiveId from a group's identity. The shape
 * matches the new convention `{date}_{modelSlug}_{quant}_{shortId}` but with
 * a "migrated" marker as the shortId to distinguish reconstructed archives.
 */
export const synthesizeArchiveId = (group: PrototypeGroup): string => {
  const date = new Date(group.mtimeMs).toISOString().slice(0, 10);
  const modelSlug = slugify(group.key.model);
  const quantPart = group.key.quant.length > 0 ? slugify(group.key.quant) : "noquant";
  return `${date}_${modelSlug}_${quantPart}_migrated`;
};

/**
 * Synthetic runId for a legacy archive — there's no group concept in
 * prototype data, so each migrated archive becomes its own one-archive
 * group, identified by `legacy-{stem}`.
 */
export const synthesizeLegacyRunId = (archiveId: string): string => `legacy-${archiveId}`;

export interface ReconstructInput {
  readonly group: PrototypeGroup;
  readonly currentPromptCorpus: Record<string, PromptCorpusEntry>;
  readonly currentScenarioCorpus: Record<string, ScenarioCorpusEntry>;
  /** Temperatures to stamp on the reconstructed manifest. Default [0.7]. */
  readonly temperatures?: ReadonlyArray<number>;
}

export interface ReconstructedArchive {
  readonly archiveId: string;
  readonly runId: string;
  readonly manifest: RunManifest;
  readonly results: ReadonlyArray<ExecutionResult>;
  readonly unmatched: ReadonlyArray<{
    readonly promptName: string;
    readonly reason: "no-corpus-match";
  }>;
}

const defaultEnv: RunEnv = {
  hostname: "migrated",
  platform: "migrated",
  runtimeVersion: "migrated",
  nodeVersion: "migrated",
  benchmarkGitSha: "migrated",
};

/**
 * Map one prototype record to a new-format ExecutionResult. Requires the
 * matched corpus entry (for `promptHash`, which the prototype didn't always
 * store reliably). Temperature defaults to 0.7 if not recorded — the
 * prototype executed at a single temperature across all prompts.
 */
const toExecutionResult = (
  rec: PrototypeRecord,
  archiveId: string,
  runId: string,
  executedAt: string,
  group: PrototypeGroup,
  corpusPromptHash: string,
  corpusScenarioHash: string | null,
): ExecutionResult => {
  const isScenario = rec.scenario_name !== undefined && rec.scenario_name !== null;
  const finalStats = rec.final_player_stats ?? rec.final_state_summary ?? null;
  const eventsRaw = rec.events ?? null;

  // Best-effort: prefer prototype-stored hash, fall back to corpus-derived.
  const promptHash =
    rec.prompt_hash !== undefined && rec.prompt_hash.length > 0
      ? rec.prompt_hash
      : corpusPromptHash;

  const scenarioHash =
    rec.scenario_hash !== undefined && rec.scenario_hash !== null
      ? rec.scenario_hash
      : corpusScenarioHash;

  // Events: the schema requires `event: AgentEventType` values
  // ("tool_call"|"tool_result"|"tool_error"|"turn_end"|"error"|"connection").
  // The prototype's events field sometimes stored free-form strings; keep
  // only entries whose `event` field is one of the known tags.
  const KNOWN_EVENTS = new Set([
    "tool_call",
    "tool_result",
    "tool_error",
    "turn_end",
    "error",
    "connection",
  ]);
  const events =
    eventsRaw === null
      ? null
      : eventsRaw
          .filter((e) => {
            const t = (e as Record<string, unknown>)["event"];
            return typeof t === "string" && KNOWN_EVENTS.has(t);
          })
          .map((e) => {
            const r = e as Record<string, unknown>;
            const tick = typeof r["tick"] === "number" ? r["tick"] : 0;
            const ts = typeof r["ts"] === "string" ? r["ts"] : "";
            const data =
              typeof r["data"] === "object" && r["data"] !== null
                ? (r["data"] as Record<string, unknown>)
                : {};
            return {
              event: r["event"] as
                | "tool_call"
                | "tool_result"
                | "tool_error"
                | "turn_end"
                | "error"
                | "connection",
              tick,
              ts,
              data,
            };
          });

  return {
    archiveId,
    runId,
    executedAt,
    promptName: rec.prompt_name ?? "",
    temperature: rec.temperature ?? 0.7,
    model: group.key.model,
    runtime: group.key.runtime,
    quant: group.key.quant,
    promptTokens: rec.prompt_tokens ?? 0,
    generationTokens: rec.generation_tokens ?? 0,
    promptTps: rec.prompt_tps ?? 0,
    generationTps: rec.generation_tps ?? 0,
    peakMemoryGb: rec.peak_memory_gb ?? 0,
    wallTimeSec: rec.wall_time_sec ?? 0,
    output: rec.output ?? "",
    error: rec.error === undefined ? null : rec.error,
    promptHash,
    scenarioHash: isScenario ? scenarioHash : null,
    scenarioName: isScenario ? (rec.scenario_name ?? null) : null,
    terminationReason: isScenario
      ? normalizeTerminationReason(rec.termination_reason ?? null)
      : null,
    toolCallCount: isScenario ? (rec.tool_call_count ?? 0) : null,
    finalPlayerStats: isScenario ? finalStats : null,
    events: isScenario ? events : null,
  };
};

const TERMINATION_REASONS = new Set(["completed", "wall_clock", "tokens", "tool_calls", "error"]);

const normalizeTerminationReason = (
  raw: string | null,
): "completed" | "wall_clock" | "tokens" | "tool_calls" | "error" | null => {
  if (raw === null) return null;
  if (TERMINATION_REASONS.has(raw)) {
    return raw as "completed" | "wall_clock" | "tokens" | "tool_calls" | "error";
  }
  return null;
};

/**
 * Reconstruct a complete RunManifest archive from one prototype group. The
 * returned `results` array mirrors the source records in order (minus the
 * unmatched ones). The caller writes `manifest` + `results` to
 * `{archiveId}.jsonl` via `write-migrated.ts`.
 */
export const reconstructArchive = (
  input: ReconstructInput,
): Effect.Effect<ReconstructedArchive, never> =>
  Effect.sync(() => {
    const { group, currentPromptCorpus, currentScenarioCorpus } = input;
    const archiveId = synthesizeArchiveId(group);
    const runId = synthesizeLegacyRunId(archiveId);
    const isoAt = new Date(group.mtimeMs).toISOString();

    const results: ExecutionResult[] = [];
    const unmatched: Array<{
      readonly promptName: string;
      readonly reason: "no-corpus-match";
    }> = [];

    const usedPromptNames = new Set<string>();
    const usedScenarioNames = new Set<string>();

    for (const rec of group.records) {
      const protoName = rec.prompt_name ?? "";
      if (protoName.length === 0) {
        unmatched.push({ promptName: "(missing)", reason: "no-corpus-match" });
        continue;
      }
      const isScenario = rec.scenario_name !== undefined && rec.scenario_name !== null;
      const matched = resolvePromptName(
        protoName,
        currentPromptCorpus,
        currentScenarioCorpus,
        isScenario,
      );
      if (matched === null) {
        unmatched.push({ promptName: protoName, reason: "no-corpus-match" });
        continue;
      }

      let corpusPromptHash = "";
      let corpusScenarioHash: string | null = null;
      if (isScenario) {
        const entry = currentScenarioCorpus[matched];
        if (entry !== undefined) {
          corpusScenarioHash = entry.scenarioHash;
          usedScenarioNames.add(matched);
        }
      } else {
        const entry = currentPromptCorpus[matched];
        if (entry !== undefined) {
          corpusPromptHash = entry.promptHash;
          usedPromptNames.add(matched);
        }
      }

      results.push(
        toExecutionResult(
          { ...rec, prompt_name: matched },
          archiveId,
          runId,
          isoAt,
          group,
          corpusPromptHash,
          corpusScenarioHash,
        ),
      );
    }

    // Embed only the corpus entries we actually used — mirrors the runtime
    // behavior where a run's manifest carries only its own prompts. This
    // keeps the archive file small and avoids bloating it with unrelated
    // current-corpus entries.
    const promptCorpus: Record<string, PromptCorpusEntry> = {};
    for (const name of usedPromptNames) {
      const entry = currentPromptCorpus[name];
      if (entry !== undefined) promptCorpus[name] = entry;
    }
    const scenarioCorpus: Record<string, ScenarioCorpusEntry> = {};
    for (const name of usedScenarioNames) {
      const entry = currentScenarioCorpus[name];
      if (entry !== undefined) scenarioCorpus[name] = entry;
    }

    const manifest: RunManifest = {
      schemaVersion: 1,
      archiveId,
      runId,
      startedAt: isoAt,
      finishedAt: isoAt,
      interrupted: false,
      artifact: group.key.model, // best-effort: no artifact in prototype
      model: group.key.model,
      runtime: group.key.runtime,
      quant: group.key.quant,
      env: defaultEnv,
      temperatures: input.temperatures ?? [0.7],
      promptCorpus,
      scenarioCorpus,
      stats: {
        totalPrompts: usedPromptNames.size,
        totalExecutions: results.length,
        completed: results.filter((r) => r.error === null).length,
        skippedCached: 0,
        errors: results.filter((r) => r.error !== null).length,
        totalWallTimeSec: results.reduce((sum, r) => sum + r.wallTimeSec, 0),
      },
    };

    return { archiveId, runId, manifest, results, unmatched };
  });

export const reconstructKey = (key: GroupKey): string => `${key.model}|${key.runtime}|${key.quant}`;
