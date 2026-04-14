import { Schema } from "effect";

/**
 * One seat in a game session. `llm` seats receive directives from the model
 * under test; `npc` seats are driven by the game engine. See requirements §2.2.
 */
export const PlayerDef = Schema.Struct({
  id: Schema.String,
  controlledBy: Schema.Literal("llm", "npc"),
});
export type PlayerDef = typeof PlayerDef.Type;

/**
 * Session termination budgets. All three are checked by the {@link CutoffWatchdog}
 * state machine (§5.5); `wallClockSec` is additionally enforced by a racing
 * Fiber (§3.3) so it fires even if the watchdog stops receiving events.
 */
export const CutoffConfig = Schema.Struct({
  wallClockSec: Schema.Number,
  totalTokens: Schema.Number,
  toolCalls: Schema.Number,
});
export type CutoffConfig = typeof CutoffConfig.Type;

/**
 * Frozen scenario definition embedded in the RunManifest. `scenarioMd` is the
 * full directive markdown content, resolved from a local `.md` file at load
 * time (§2.2) — kept in the corpus so re-scoring doesn't depend on the
 * on-disk file that may have changed since the run.
 *
 * `scenarioHash` is SHA-256[:12] over `fixture + scorer + params + players +
 * cutoffs` (matching the Python prototype's scenario hashing).
 */
export const ScenarioCorpusEntry = Schema.Struct({
  name: Schema.String,
  fixture: Schema.String,
  players: Schema.Array(PlayerDef),
  scorer: Schema.String,
  scorerParams: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  cutoffs: CutoffConfig,
  tier: Schema.Number,
  scenarioMd: Schema.String,
  scenarioHash: Schema.String,
});
export type ScenarioCorpusEntry = typeof ScenarioCorpusEntry.Type;
