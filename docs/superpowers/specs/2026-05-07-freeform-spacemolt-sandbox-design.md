# Freeform Spacemolt Sandbox

## Problem

Current spacemolt scenarios are scripted: each markdown file states an objective and a step-by-step procedure ("call `get_missions`, then `accept`, then `complete`"). Scoring is tied to bespoke functions in `GAME_SCORERS` (`src/scoring/game.ts`) that read `finalPlayerStats` and synthesize a `[0,1]` value tuned for that scenario.

Two issues:

1. The scenarios test how well a model can follow a script, not how well it can play the game. A model that can't follow a 4-step recipe doesn't tell us much about agentic play; a model that *can* follow it doesn't tell us much either.
2. Each new "what does this model do" question requires authoring a new scorer. Scorers are code; iteration is heavy.

The gameserver already computes a canonical score for any player and returns it via `GET /api/admin/benchmark/player-stats?player_id=<username>` as `{ score, leaderboard_rank, ... }`. We can use that directly.

## Goals

- One freeform sandbox scenario: loose directive, agent runs until its token budget is exhausted.
- Score read directly from the gameserver, defaulting to the `score` field, with the field configurable in scenario YAML.
- Scenario score type accepts arbitrary numerics — no `[0,1]` coercion at scoring time.
- Replace most scripted scenarios; keep 1–2 as harness smoke tests.

## Non-goals

- No new gameserver endpoints. `/api/admin/benchmark/player-stats` is sufficient.
- No mid-run score queries. Score is read once at termination, same as today.
- No pass-rate semantics for scenarios. Webapp shows raw values; pass rate stays a prompt-lane concept.
- No expression DSL or computed scoring. The scorer reads one numeric field; combinations live in the gameserver if needed.
- No backwards-compatibility shims for old `Score` shape on archived scenario results — consistent with the project's recent legacy-cleanup posture, old archives fail to parse and are regenerated.

## Design

### Score type split

The shared `Score` shape in `src/scoring/score-result.ts` collapses into a discriminated union along the seam that already exists at every consumer (`scoreExecution`, `aggregate.ts`, the webapp record builder all branch on `scenarioName !== null` or `isPromptEntry`):

```ts
interface PromptScore {
  score: number;        // [0, 1], unchanged
  details: string;
  breakdown?: ConstraintBreakdown;
}

interface ScenarioScore {
  value: number;        // raw, from API; no coercion
  scoreField: string;   // which finalPlayerStats key was read (audit trail)
  details: string;
}

type ScoreResult = PromptScore | ScenarioScore;
```

`scoreExecution` returns `ScoreResult`; the prompt branch yields `PromptScore`, the scenario branch yields `ScenarioScore`. Consumers branch as they already do.

### `api_field` scorer

A new entry in `GAME_SCORERS`:

```yaml
scorer: api_field
scorerParams:
  scoreField: score        # optional; defaults to "score"
```

It reads `result.finalPlayerStats[scoreField ?? "score"]`, coerces to number. If the field is missing or non-numeric, returns `ScenarioScore { value: 0, scoreField, details: "<field> missing or non-numeric" }` — same defensive posture as existing scorers.

This is the only scorer the sandbox uses, and the only scorer that needs to be written.

### Sandbox scenario

Two new files:

- `prompts/scenarios/sandbox.md` — directive in the "goal + orienting hints" shape:

  > You are an admiral. Maximize your score before your token budget runs out.
  >
  > The galaxy has missions, markets that fluctuate, ore to mine, and pirates to fight. How you spend your time is up to you.

- `prompts/scenarios/sandbox.yaml`:

  ```yaml
  name: sandbox
  fixture: <existing general-purpose fixture>
  scenarioMd: sandbox.md
  players:
    - id: admiral
      controlledBy: llm
  scorer: api_field
  scorerParams:
    scoreField: score
  cutoffs:
    totalTokens: 500_000
    toolCalls: 10_000        # large backstop; expected exit is tokens
    wallClockSec: 1800       # large backstop
  tier: 3
  tags: [freeform, sandbox]
  ```

Token-budget exhaustion is the *expected* exit. The other cutoffs exist only to bound runaway loops.

### Watchdog and runner

No code change. The watchdog (`src/game/session/watchdog.ts:62-76`) already tracks cumulative tokens from `turn_end` events and stops the run when `cutoffs.totalTokens` is hit. The runner (`src/game/session/run-session.ts:232`) already calls `getPlayerStats` post-termination and stashes the result on `result.finalPlayerStats`.

### Aggregate and webapp

- `src/report/aggregate.ts` — the `scenarioName !== null` branch (line 165) builds its record from `ScenarioScore` instead of `Score`. The prompt branch is unchanged.
- `WebappRecord` for scenario rows carries `value: number` and `scoreField: string` instead of `score: number`. Prompt rows are unchanged.
- Webapp scenario cells render the raw `value`. Existing pass-rate UI is prompt-only and stays as-is.

The type split means every downstream consumer that reads `score` from a scenario record gets a type error until it's updated to read `value`. Audit surface is bounded.

### Migration

- **Delete** scripted scenarios (markdown + YAML pairs) except the two retained as smoke tests, plus their `GAME_SCORERS` entries that become unreferenced.
- **Keep as smoke tests**: one scripted scenario per lower tier so the harness covers all three tiers.
  - **Tier 1** (can dock/undock): `dock_and_sell` — closest existing scenario; scope is slightly broader (mine + sell) but exercises dock/undock as the spine.
  - **Tier 2** (can accept quest → travel → complete → return): `accept_complete_mission` — direct match.
  - All other scripted scenarios are deleted along with their `GAME_SCORERS` entries. Sandbox is tier 3.
- **Add**: `sandbox.md`, `sandbox.yaml`, `api_field` in `GAME_SCORERS`.
- **Update**: `Score` → `ScoreResult` union; `scoreExecution` return type; `aggregate.ts` scenario branch; `webapp-contract.ts`; webapp consumers.

## Testing

- Unit: `api_field` scorer with present numeric, present non-numeric, missing, default vs. overridden `scoreField`.
- Unit: `scoreExecution` dispatch — prompt entry returns `PromptScore`, scenario entry returns `ScenarioScore`.
- Integration: full sandbox run against the game-server fixture; assert `result.finalPlayerStats.score` flows through to the resulting `ScenarioScore.value`.
- Smoke: the two retained scripted scenarios still pass.
- Webapp contract: scenario `WebappRecord` round-trips with `value` and `scoreField`; prompt records unchanged.

## Risks

- **Existing archives** carry old scenario scores in `Score` shape (`{ score: number ∈ [0,1] }`). They will fail to parse under the new union and be regenerated on next run, consistent with the no-shim posture in the recent thinking-extraction work.
- **Webapp downstream consumers** of `WebappRecord.score` on scenario rows must switch to `value`. The type split should catch every site at compile time; if any consumer reads through `unknown` or `any`, it will silently render `undefined`.
- **Fixture choice** for the sandbox is open. The existing scripted scenarios used domain-specific fixtures; the sandbox needs one that exposes enough surface (missions, market, pirates, mining) for "freeform play" to be meaningful. Confirm during implementation.
