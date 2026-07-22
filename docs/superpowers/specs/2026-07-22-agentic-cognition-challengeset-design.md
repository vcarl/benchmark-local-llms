# Agentic-cognition challengeset — design

## Purpose

This challengeset exists to inform agent-harness design. The goal is not "answer the
questions." The goal is to learn what works best when prompting models for an
autonomous-agent-loop workload, and which models suit that workload.

The capability under test: **can a model turn provided information into constrained
judgments without being captured by noise, narrative, examples, or stale priors?**

Five constraint dimensions frame the work. They are interpretation lenses, not a
partition of the set — every challenge exercises several at once.

1. **Grounding** — every factual claim is traceable to provided input; contradictions
   between a provided prior and provided current facts resolve toward current facts, and
   the contradiction is flagged.
2. **Salience** — significant signals (location change, incoming communication, threat,
   resource threshold) are weighted above routine noise; routine repetition is filtered
   without dropping the significant.
3. **Evidence over inference** — outcomes are judged from the mechanical record, never
   from intent; an action attempted is not an action succeeded.
4. **Prior resistance** — quotable examples in the instructions are not echoed;
   authoritative-sounding stale advice is overridden by observed facts, with the conflict
   named.
5. **Format discipline** — output honors the requested structure exactly; structured
   fields agree with the free-text rationale.

## Experimental design

The unit is a trial: **(challenge prompt C, context treatment T, model M)** on a fixed
scenario.

- **C** — 6 challenge prompts, verbatim across all treatments and all models.
- **T** — 3 context treatments (T1 raw telemetry / T2 labeled digest / T3 narrative
  brief). Same facts, different structure. This is the factor most suspected to drive
  outcomes and the least understood, so it is the axis the set is built around.
- **M** — the existing model roster. **The lineup is a given, not a design variable.**
  Models are selected by the existing `--configs` globs against `configs.yaml`. Nothing
  in this project is built for the model axis.

**N=1 per cell.** No repeat mechanism, no seeds in the cache key, no variance recording.

### Turn structure

**Every trial is two conversational turns.**

- **Turn 1** is the challenge exactly as designed, uncontaminated.
- **Turn 2** shows the model its own turn-1 output as an assistant message and asks for a
  generic self-assessment verdict.

Turn 2 is scored against turn-1 mechanical ground truth as a separate **calibration**
signal. The reason for the split: asking for a self-check is itself a reflection prompt
that would improve turn-1 performance and blunt the traps in C4 and C6. Keeping it in a
second turn preserves the traps and buys a calibration measurement.

There is no LLM-judge. Self-assessment is itself mechanically scorable, so judge validity
never becomes a dependency of the results.

### Controls

- **Information equivalence.** Each scenario has a canonical **fact manifest**: a flat
  list of true propositions. All three treatments must encode every manifest fact. If a
  treatment cannot express a fact, the fact is cut from the scenario — it is never left
  asymmetric. **This is a build-time assertion, not an authoring intention.** It is the
  single most important validity control and the primary reason the rendering layer
  exists at all.
- **Fixed decoding params** per model, from the existing config.
- **Fixed output contract** per challenge.
- **Seeded surface details.** Scenario names and numbers are randomized per fixture so
  memorized answers cannot transfer.
- **Axis independence.** Challenges never reference the treatment; treatments never
  reference the challenge.

### Hypotheses

All four are seeded by live observation. None has been tested as a controlled comparison.

- **H1** — Labeled-digest context beats raw telemetry, and the gap widens as model size
  shrinks.
- **H2** — Narrative-brief context degrades grounding, and the degradation persists at
  large scale.
- **H3** — Echo rate is driven by the presence of quotable exemplar sentences, not by
  model scale. The lever is the structure of instructions, not capacity.
- **H4** — Evidence-over-inference failures occur across scales, and are mitigated more
  by how the mechanical record is rendered than by model size.

### Scale-ceiling caveat

Stated plainly, and published alongside any result: the roster tops out at roughly
31–36B dense / 48B MoE local quants. `Runtime` is a closed literal `llamacpp | mlx`, and
`src/llm/chat-completion.ts` hardcodes `http://127.0.0.1:{18080,18081}` with no base URL
and no auth, so no hosted frontier model is reachable.

H2 and H3 therefore carry an explicit ceiling caveat: we cannot distinguish "structure
beats scale" from "we never tested enough scale."

## Project decomposition

- **P1 — Harness seams.** No content dependency; independently testable.
- **P2 — Rendering layer + challengeset.** A pure function library; YAML is one sink.
- **P3 — Analysis.** Cell comparison, the "present but unusable" query, validity checks
  on the set.

P1 and P2 run in parallel under separate leads.

## P2: the rendering layer

The renderer is **pure and total**: `Scenario -> RenderedVariant[]`, where

```
RenderedVariant = { challengeKey, treatmentKey, prompt, followUp, checks }
```

No I/O, no ambient randomness — the seed is passed in. It lives in
`scripts/author/agentic/`, matching the existing precedent that `economics.yaml`,
`financial.yaml` and `trust.yaml` are generated by solvers under `scripts/author/`
rather than hand-written.

**YAML emission is a sink the layer knows nothing about.** Today one sink writes
`challenges/agentic-cognition.yaml`. This is what makes author-time-versus-runtime
rendering a non-architectural choice: a future runtime resolver calls the identical pure
functions.

### Owns

- The Scenario: fact manifest plus seeded surface details.
- Three treatment renderers: manifest -> context block.
- Six challenge templates: context + payloads -> prompt.
- Derivation of mechanical checks from the manifest.
- The turn-2 prompt and its scoring rule.

### Does not own

- System prompts. A config concern; stays in `system-prompts.yaml`, never inlined into
  challenges.
- Model selection and decoding params.
- Check execution — `src/scoring/` runs the emitted declarations, unchanged.
- Archive, report and webapp shape.
- Any analysis, or any notion of which treatment "won".

### Checks are derived, never hand-written

Checks are derived from the manifest, never authored per variant. If a scenario's fuel
figure changes, all 18 variants' checks change with it — otherwise the set scores against
stale truth.

## Source material: the Roci logs

Real agent logs live at `/Users/vcarl/workspace/roci/players/vcarl/logs`
(`events.jsonl`, 11,254 lines / 10.3MB; `episodes-tool.jsonl`;
`episodes-transition.jsonl`). They are a source of **concrete example shapes** — not a
distributional target, and not a content source.

### Not a calibration target

The measured noise density (95–99% routine, mean 169 events between significant ones,
~154KB of interstitial material, frozen run-lengths up to 545 identical ticks) is not
something scenarios must match. The current system's design may have significant flaws;
matching its distribution would encode those flaws as our spec. Payloads are sized to be
workable across the whole roster. Noise is present and meaningful, but there is no
calibration assertion.

### Not a content source

Scenarios are authored fresh — different systems, different numbers, different failure
surfaces — with the manifest as source of truth and seeded surface details. A fixture
that transcribes a real incident would measure whether a model handles *that* incident.

### What is taken: four concrete shapes

1. **Byte-identical success/failure records.** A failed `spacemolt travel horizon` and a
   successful `spacemolt jump altais` produce `tool_result` records with identical
   `kind`, identical key set, `status:"completed"` on both, and comparable `durationMs`
   (3ms vs 5ms). The only discriminator is that the free-text `text` body starts with
   `Error [`. Supporting figures: 34% of exit-code-bearing actions failed while 100% were
   logged `status:"completed"`; 103 of 678 `tool_result` bodies (15%) contain `Error [`.
2. **Mixed-outcome body.** A single `text` body carrying both success and failure:
   `"Bought 1 Palladium Ore for 200cr. +2 trading XP. | Bought 1 Iridium Ore for 90cr. | Error [item_not_available]: ..."`.
3. **The WRONG/RIGHT exemplar pair** embedded in the live `orient` prompt template.
4. **The weight-0 appraisal whose own summary contains the new system name** while its
   reason reads "no new changes."

### Vocabulary for fresh authoring

Taken from the logs for nativeness: resources `fuel n/100`, `hull n/100`, `shield n/50`,
`cargo used/capacity`, `credits` as integer `cr`, `CPU used/capacity`,
`power used/capacity`; POI types `sun` / `planet` / `asteroid_belt` / `relic` /
`station`; error-code style `Error [invalid_poi]:`, `Error [cpu_exceeded]:`,
`Error [cannot_craft]:`, `Error [no_facility]:`.

## The five failure archetypes

Each must reproduce somewhere in the matrix, or the set is measuring something else.
This is the R5 checkable list.

### 1. Weight-0 on a system jump

Confirmed in the logs, cleanly. 0 of 1,590 appraisals ever scored a location or system
change above 0. The exemplar record scored weight 0 with reason "A routine full_state
snapshot with no alerts and no new changes" while its own summary string contained the
new system name.

Ready-made mechanical check: canary token present in input, absent from `REASON`.

### 2. "Crisis resolved" narrative adoption

Confirmed, and the most pervasive pattern in the corpus. 31 of 68 `orient` headlines
(46%) contain a resolution clause; 8 explicitly attribute the resolution to notes or
logs. The claim persisted across three sessions and eight days while the underlying
condition recurred as `Error [cpu_exceeded]` on four separate dates. It propagated into
`SYNTHESIS.md`, `WM.md` and `DIARY.md`.

### 3. Attempted-action-judged-successful

**Restated from the original framing.** The original phrasing was
"attempted-travel-judged-successful"; that specific version is not supported by the logs.
The obvious candidate ("I have successfully traveled to the Horizon system...
[STEP_DONE]") was checked, and the heartbeats show a 2-fuel decrement matching the logged
route cost — the travel genuinely succeeded.

What is evidenced is the same failure on a different verb. The agent's own diary records:
"I once swore a core was installed while it sat in the hold, and the buy failed for it,"
and the adjudication ledger cites the corresponding failed step. Supporting: 24 of 26
self-evaluations returned "succeeded" (92%); 36 further steps were abandoned with no
judgment at all. The structural precondition is shape 1 above — success and failure
records that differ only in a free-text body.

### 4. Verbatim example echo

Confirmed — and it is the mechanism behind archetype 2, which validates C4's design. The
live `orient` template contains a labeled WRONG/RIGHT pair. The model's output borrowed
the WRONG example's opening verb and the RIGHT example's trailing clause: "Drifting
through Altais Outer Ice with half fuel and half hull; the Phase Drift crisis is resolved
per my notes." It also asserted "half hull" when the heartbeat one second earlier read
`hull:100%`. The anti-pattern warning taught the anti-pattern.

### 5. Stale-skill over-trust

Confirmed. A learned skill accepted on a single datapoint ("local crafting beats distant
purchasing when you are isolated") was applied where live observation contradicted it,
producing `Error [no_facility]` and three consecutive retries of the same failing craft
eight days after ground truth had said no.

## The six challenge prompts

Conventions: `{{ENVIRONMENT_CONTEXT}}` is filled by one treatment. `{{EVENT}}`,
`{{ACTION_LOG}}`, `{{ADVISORY}}` and `{{GOAL}}` are per-scenario payloads, identical
across treatments.

Constraints are stated explicitly to the model. We test constraint-following, not
constraint-guessing.

### C1 — Significance appraisal

Primarily exercises: salience, grounding, format discipline.

```
You are the attention filter for an autonomous ship. You receive a stream of
events; most are routine. Your judgment decides whether the ship's planning
system is interrupted.

{{ENVIRONMENT_CONTEXT}}

## New event
{{EVENT}}

Decide how significant this event is, given everything above.

Respond with exactly three lines:
DISPOSITION: one of IGNORE | NOTE | ACT_NOW
SIGNIFICANCE: an integer 0-5
REASON: one sentence naming the specific fact in the input that drove your decision

Constraints:
- Your REASON must cite a fact that appears in the input above. Do not invent facts.
- A change in the ship's location or system is never IGNORE.
- A message addressed to this ship from another pilot is never IGNORE.
- An event you have seen before, unchanged, at the same location, is noise.
```

### C2 — Situation report under narrative pressure

Primarily exercises: grounding, prior resistance.

```
You are writing the situation report an autonomous ship's planner will act on.
A report from your previous shift is included in your materials; it may be out
of date or wrong.

{{ENVIRONMENT_CONTEXT}}

Write the current situation report. Format:

SITUATION: (2-3 sentences, present tense, current facts only)
OPEN PROBLEMS: (bulleted; each names the blocking fact)
CORRECTIONS: (bulleted; each claim from prior materials that current facts
contradict, stated as "prior said X; currently Y" — write "none" if none)

Constraints:
- Every claim must be traceable to the current-state facts provided.
- Where prior materials conflict with current facts, current facts win.
- Do not carry forward any prior assessment you cannot re-verify from the
  current facts.
```

### C3 — Outcome adjudication from the mechanical record

Primarily exercises: evidence over inference.

```
An autonomous agent just finished a work step. You must judge what was actually
accomplished. You have the step's goal and the complete mechanical log of every
action taken. The log is authoritative; the agent's intentions are not.

{{ENVIRONMENT_CONTEXT}}

## Step goal
{{GOAL}}

## Action log (complete, in order)
{{ACTION_LOG}}

For each intended outcome in the goal, state ACHIEVED or NOT_ACHIEVED, citing
the log line(s) that prove it. Then give a one-line verdict for the step.

Constraints:
- An action that was attempted is not an action that succeeded. Only the log's
  recorded results count.
- Some actions report success at the transport level but contain an error in
  their output body. Read the output, not just the status.
- If the log does not contain evidence for an outcome, it is NOT_ACHIEVED.
```

### C4 — Appraisal with exemplar bait

Primarily exercises: prior resistance. The task is C1's; the exemplars are the trap.

```
You are the attention filter for an autonomous ship, deciding whether an event
should interrupt the planning system.

Here is how to think about significance:
- Example: a cargo hold reading identical to the last three readings →
  "DISPOSITION: IGNORE / REASON: Routine repetition of an unchanged cargo state."
- Example: a hull breach alarm during transit →
  "DISPOSITION: ACT_NOW / REASON: Active hull damage threatens ship survival."
- Bad example (do not imitate): "DISPOSITION: NOTE / REASON: A distant vessel
  moved, which is worth noting as novelty." — vague, does not name a
  consequential fact.

{{ENVIRONMENT_CONTEXT}}

## New event
{{EVENT}}

Respond with exactly three lines: DISPOSITION / SIGNIFICANCE / REASON, as in
the examples' format.

Constraints:
- Your REASON must be composed from the facts of THIS event, in your own words.
- Do not reuse the wording of any example above; they describe different events.
```

### C5 — Plan revision against a stale advisory

Primarily exercises: prior resistance, grounding.

```
You are the planner for an autonomous agent. You have current observed facts
and a piece of learned advice from earlier experience. The advice was true when
written. It may not be true now.

{{ENVIRONMENT_CONTEXT}}

## Learned advice (from a previous session)
{{ADVISORY}}

## Current objective
{{GOAL}}

Recommend the single next action. Format:

NEXT_ACTION: (one concrete action)
BECAUSE: (2-3 sentences of justification from current facts)
ADVICE_STATUS: STILL_VALID | STALE — and if STALE, one sentence naming which
current fact contradicts it

Constraints:
- Where the advice conflicts with current observed facts, the facts win.
- Do not recommend retrying an action the current facts show to be impossible.
- Prefer the smallest action that makes real progress toward the objective.
```

### C6 — Schema discipline under load

Primarily exercises: format discipline. C1's judgment, a strict machine contract, and
oversized input.

```
You are an automated event classifier inside a running system. Your output is
parsed by a machine. Any deviation from the schema is a system fault.

{{ENVIRONMENT_CONTEXT}}

## New event
{{EVENT}}

Output a single JSON object, and nothing else — no prose, no code fences,
no reasoning outside the JSON:

{"disposition": "ignore" | "note" | "act_now",
 "significance": <integer 0-5>,
 "interrupt": <boolean>,
 "reason": "<one sentence citing a fact from the input>"}

Constraints:
- "interrupt" may be true only if disposition is "act_now".
- "significance" 0 requires disposition "ignore"; 4-5 require "act_now".
- The "reason" must agree with the structured fields (a reason describing
  routine noise cannot accompany "act_now").
```

C6 pairs with the largest scenario payloads — the failure it hunts appears under input
pressure. Payload size is bounded by the smallest `ctxSize` in the selected roster.

## The three treatments

All three render the same fact manifest. The worked example below is shared, so the three
renderings can be read against each other directly.

**Example manifest.** Ship *Vagrant* completed a jump from system Harrow to system Ledge
~2 minutes ago and is now adrift at Ledge Outer Belt; fuel 49/100; hull 100/100; cargo
13/50; credits 44,510; 3 unread private messages; one other pilot (*Meridian-7*) in scan
range with no hostile act; a prior-shift note claims "fuel concerns resolved, hardware
bottleneck cleared" — contradicted, because fuel is below half and the hardware upgrade
was never installed.

### T1 — Raw telemetry

Verbatim machine state: nested, unprioritized, uninterpreted. Significant facts are
present but buried mid-structure. This is the "harness does no work for you" baseline.

```
## Ship state (raw)
{"ts":1410441,"ship":{"id":"vagrant","status":"adrift","location":{"system_id":
"ledge","poi":"ledge_outer_belt","docked":false},"nav":{"last_jump":{"from":
"harrow","to":"ledge","completed_ticks_ago":12}},"resources":{"fuel":{"current":
49,"max":100},"hull":{"current":100,"max":100}},"cargo":{"used":13,"capacity":
50,"manifest":[{"item":"iron_ore","qty":9},{"item":"processing_core","qty":1},
{"item":"superconductor","qty":1},{"item":"circuit_board","qty":2}]},"credits":
44510,"comms":{"unread":{"private":3,"local":0,"system":0}},"contacts":[{"id":
"meridian-7","type":"ship","range":"scan","aggression":null}],"notes_prev":
"fuel concerns resolved, hardware bottleneck cleared"}}
```

### T2 — Labeled digest

Flat labeled lines, one fact per line, leading type tokens, deltas isolated from standing
state, explicit verdict tokens on threshold lines. The harness pre-chews; the model reads
labels, not structure.

```
## Changed since last check
LOCATION: now in system Ledge at Ledge Outer Belt — jumped from Harrow ~2 min ago
COMMS: 3 unread private messages — senders unknown until read

## Standing state
FUEL: 49/100 — below half, no alert threshold crossed
HULL: 100/100 — no alerts
CARGO: 13/50 (iron_ore x9, processing_core x1, superconductor x1, circuit_board x2)
CREDITS: 44,510
CONTACTS: 1 ship in scan range (Meridian-7) — no hostile act observed

## Prior-shift note (unverified — trust current lines above where they differ)
"fuel concerns resolved, hardware bottleneck cleared"
```

### T3 — Narrative brief

The same facts woven into prose with history and interpretation — the way a diary, a
handoff note, or a conversational summary naturally arrives. Priors and facts share one
voice; nothing is labeled. It carries narrative pressure by construction, not as an
add-on.

```
## Briefing
The Vagrant finally made the jump out of Harrow — after the long stall there,
the crossing to Ledge went cleanly, and she's now drifting at the Outer Belt,
about two minutes after arrival. The previous shift signed off in good spirits,
noting the fuel concerns were resolved and the hardware bottleneck cleared.
The tanks read 49 of 100 and the hull is untouched. The hold is carrying its
usual mix — nine units of iron ore, the processing core and superconductor
picked up back at Harrow, and a couple of circuit boards — with credits at
44,510. Three private messages have piled up unread since before the jump.
One other ship, the Meridian-7, sits at the edge of scan range and hasn't
done anything worth mentioning.
```

## P1: harness seams

Land in this order: **3a -> 1 -> 2 -> 3b.**

### Change 3a: declared `challengeKey` + `treatment` on ChallengeItem

- Add as **optional** fields to all 6 union members in `src/schema/challenge.ts:20-88`.
  The 6 structs duplicate common fields deliberately (doc comment at `:11-13` — better
  error pointers); do not refactor to a shared base as part of this change. 12 new lines.
- Hoist onto `ResolvedItem` (`src/config/challenges.ts:19-25`) rather than routing via
  `PromptCorpusEntry` — see the tier precedent below.
- **Excluded from every hash.** `computePromptHash` (`src/config/hashing.ts:20-21`) is
  `shortSha256(promptText|systemText)`; `itemHash` (`challenges.ts:214`) is
  `shortSha256(promptHash|scorerKey)`; `challengeHash` (`:224-226`) joins those. None
  read `name` / `category` / `tier` / `tags`, so new optional fields are excluded by
  default. Document this in JSDoc next to the existing `tags` field.

  **Failure mode if included:** every `itemHash` changes -> full cache miss on all 19,522
  items; every `challengeHash` changes -> `attemptId` changes ->
  `webapp/src/lib/coverage.ts:16` recovers a new hash while all 1,419 existing records
  carry the old one -> every historical attempt reads as stale -> every coverage-adjusted
  passRate drops to ~0 and the ranking table zeroes out. Silent and
  catastrophic-looking.
- Reaches `ItemResult` at `src/orchestration/run-challenge.ts:175-198` as
  `Schema.optional(Schema.String)`, following the `scorerHash` precedent. Note `:143-146`:
  cache hits bypass this construction and return rows verbatim, so cached items carry
  undefined until re-run.

#### The tier precedent — do not repeat it

`tier` is required on all 6 item structs and on `PromptCorpusEntry:28`, copied at
`challenges.ts:205`, and stops dead at the `ItemResult` literal in
`run-challenge.ts:175-198`, which never mentions it. Zero non-test hits across
`webapp/src/lib`, `webapp/src/components`, `webapp/src/routes`, `src/schema/attempt.ts`,
`src/report`. Its only consumer is `src/cli/commands/list.ts:58-63`. It is a required
field every author fills in that has never influenced a chart, a filter, or a score.

Therefore: **the acceptance criterion for 3a is "visible in the webapp", not "present in
ChallengeItem", and a test must assert the archive -> report half, not the schema ->
config half.**

### Change 1: multi-turn

- **Additive** optional field on `CompletionParams`
  (`src/llm/chat-completion.ts:48-64`):
  `readonly priorTurns?: ReadonlyArray<{ role: "assistant" | "user"; content: string }>`.
  `buildBody` (`:167-176`) becomes `[system, {user: userPrompt}, ...priorTurns]`.
  Strictly additive; `exactOptionalPropertyTypes: true` is on, so use conditional spreads,
  and callers omitting it are unaffected. Do not reshape to a `messages` array — that is
  breaking for a type constructed in exactly one place (`toCompletionParams`,
  `src/orchestration/run-prompt.ts:227`) but with a much larger test blast radius.
- **Turn 2 runs from `executeOrCacheItem` in `src/orchestration/run-challenge.ts` as a
  second `runPrompt` call**, merged into `ItemResult` there. Do not put turn-2 data on
  `ExecutionResult` (`src/schema/execution.ts:47-99`): it is already a bloated
  intermediate carrying ~11 nulled scenario-only fields, it is decoded by
  `src/archive/loader.ts:30` against 256 legacy archives, and it also serves the legacy
  `src/orchestration/phases.ts:120` path.
- **Nested optional `followUp` struct on `ItemResult`** (`src/schema/attempt.ts:6-36`),
  carrying `output`, `reasoning`, `rawOutput`, `error`, `promptTokens`,
  `generationTokens`, `generationTps`, `wallTimeSec`. This matches the file's own idiom —
  `scorerHash:11` and `breakdown:28-35` are both post-hoc `Schema.optional`. All 1,448
  existing `att-*.jsonl` decode unchanged; `Schema.encode` in
  `src/archive/attempt-writer.ts:15-16` drops undefined keys, so existing rows stay
  byte-identical. The array-of-turns alternative is rejected: it either breaks every
  scalar reader or duplicates turn-1 data in every line.
- **No `schemaVersion` bump.** Currently `Schema.Literal(1, 2)` at
  `src/schema/attempt.ts:54`, written at `run-challenge.ts:86`. House precedent
  (`scorerHash`, `breakdown`, `blobPool`) is optional fields with no bump. Three
  consumers use exact equality rather than `>=`, and each fails silently:
  `src/report/reconstruct.ts:42` (v3 loses all drilldown detail, swallowed as `skipped`
  at `write-details.ts:50-53`), `src/cli/commands/score.ts:267` (falls back to the corpus
  path), `src/cli/commands/export.ts:55` (hard fail). `src/schema/attempt.test.ts:128-131`
  explicitly asserts v3 is rejected. If a bump ever becomes necessary, convert all three
  to `>=` in the same commit.
- **Cache discriminator required.** `executeOrCacheItem` (`run-challenge.ts:130-200`)
  returns cache hits verbatim (`:145`). A turn-1-only cached row would return with no
  `followUp` forever, producing a silently mixed archive. Include a turn-mode
  discriminator in the cache lookup at `:137-142`. Do not add a second stamp exception —
  the doc comment at `:112-125` calls the `scorerHash` stamp a "narrow exception".
- **Metrics: turn-1 stays definitionally turn-1.** Keep `ItemResult.generationTokens` /
  `wallTimeSec` / `generationTps` as turn-1 only; turn-2 counters live inside `followUp`.
  Add explicit `followup_generation_tokens` / `followup_wall_time_sec` to `WebappRecord`,
  defaulting to 0, so the webapp opts in.

  **Summing would silently corrupt two things.** `webapp/src/lib/pipeline.ts:308-345` uses
  summed `generation_tokens` as the scatter-plot X axis, and `:66-70` computes
  `efficiency = (rawPassRate * uniqueChallenges * completed) / (log(overallTokens) * (timeSpent/60)) * SCALE`.
  A second turn roughly doubles wall time and adds tokens for zero additional pass credit,
  so every multi-turn config's efficiency drops and its scatter X shifts right while
  historical turn-1-only configs stay put — with 1,419 attempts spanning both regimes and
  no discriminator field in `data.js`. `generationTps` must never be summed; it is a rate,
  already averaged at `src/report/webapp-contract.ts:67-70`.
- **Test trap.** The shared mock in `src/orchestration/__tests__/fixtures.ts:154-189` keys
  stubbed responses on `` `${p.promptName}:${p.temperature}` `` (`:176`), which does not
  distinguish turn 1 from turn 2. Every multi-turn orchestration test gets the same stub
  for both turns unless this key is extended. The fixture is imported by the run-prompt,
  run-challenge, run-matrix and phases tests. This is the highest-probability silent
  failure in the change.

### Change 2: per-item report grain

- **A second, lean parallel array in `data.js`** (e.g. `globalThis.__BENCHMARK_ITEMS`),
  carrying roughly `{attempt_id, item_id, score, challengeKey, treatment, error_kind}`.
  At ~90–170 B/row x 19,522 items that is ≈ 1.8–3.3 MB. Blast radius on
  `webapp/src/lib/pipeline.ts` and `webapp/src/lib/coverage.ts` is **zero** — every
  existing function keeps taking `BenchmarkResult[]`.
- Full text stays in the existing lazy `webapp/public/details/<attemptId>.json` (77 MB
  across 1,413 files), which already carries per-item `item_id` / `prompt_text` /
  `output` / `reasoning` / `score` / `error` / `scorer` / `breakdown`, and is already
  fetched and cached by `webapp/src/lib/use-attempt-detail.ts`.
- Requires: `formatDataJs` (`src/report/write-data-js.ts:33-37`) to emit two assignments —
  it hardcodes a single one, and `src/report/write-data-js.test.ts` parses the JSON back
  out of the string, so that test breaks; `aggregateAttempts` (`src/report/aggregate.ts:4-40`)
  to return a second array; `ReportSummary` (`src/report/index.ts:34-47`) to carry it;
  a `normalizeItemRecord` and a second `declare global` in `webapp/src/lib/data.ts`.
- **Rows must carry `attempt_id` verbatim, never a synthesized id.**
  `webapp/src/lib/coverage.ts:16-17` recovers the canonical challenge hash via
  `attemptId.split("-")[2]`; a synthesized id yields `""` and collapses every challenge
  into one universe entry.
- **Rejected: changing the existing array's grain.** `pipeline.ts` treats every element as
  an attempt in at least 8 places. `splitInvocations` (`:191-206`) detects invocation
  boundaries by a repeated bare `challenge_id` — at 13.8 items/attempt every item would
  open a new invocation. `coverage.ts:53` sums `item_count` per canonical challenge,
  inflating the universe denominator 13.8x silently. That is a re-architecture of
  `pipeline.ts` + `coverage.ts` + ~561 lines of `pipeline.test.ts` + 119 of
  `coverage.test.ts`, not a grain change.
- Record-array consumers to keep in mind: `webapp/src/routes/__root.tsx:66,74,98-102` (the
  only `DATA` importer), `DrilldownPanel.tsx:12`, `ConfigSummaryPanel.tsx:18`,
  `DebugPanel.tsx:10`, and indirectly `RunGroupTable.tsx` / `RunRowItem.tsx` /
  `Scatter.tsx`.
- `WebappRecord` (`src/report/webapp-contract.ts:13-35`) is hand-mirrored field-for-field
  in `webapp/src/lib/data.ts:1-24` with **no compile-time link** (separate tsconfig and
  package.json). `src/report/webapp-contract.test.ts` asserts on `toWebappRecord` output
  but not against the webapp interface. Both files change together or drift silently.

### Lint and typing constraints

`npm run lint` is `biome check src/` plus `scripts/lint-strict.sh`, which is three textual
greps over `src/` only (`webapp/src/` is unlinted): no `try {`, no raised-error keyword
(except `src/interop/` and `*.test.ts`), no logging-object prefix (except `src/cli/`).
These match comments too, so example code in `src/` must avoid the banned tokens even
inside comments.

`tsconfig.json` sets `exactOptionalPropertyTypes: true`, so optional fields cannot be
assigned undefined explicitly — use the conditional-spread idiom already at
`src/orchestration/run-challenge.ts:75-84`.

## Out of scope

Explicit boundaries for this project:

- Model lineup changes and remote/hosted runtimes.
- Repeats, seeds, variance recording.
- An LLM-judge scorer.
- Tier wiring. It is a dead axis; leave it dead.
- Removal of vestigial `src/game/**` and `RunManifest`.
- Webapp UI work beyond the contract change.
- P3 analysis tooling.

## Review gates

- **R1** — Spec approved by the user, before any code.
- **R2** — P1 merged. 1,704 archive files still load (1,448 `att-*`; 1,441 at v2, 7 at v1;
  ~256 legacy `RunManifest` archives already collected as `issues` rather than aborting,
  per `src/report/load-attempts.ts:70-105`).
- **R3** — One scenario rendered all 18 ways, read by the user. The treatments *are* the
  experiment; if T3 leaks a fact that T1 buries, H2 measures our prose.
- **R4** — Mechanical checks validated against outputs the user hand-labels. Skip this and
  the set measures its own regexes.
- **R5** — Pilot sweep, then validity checks: discrimination (no challenge x treatment
  cell where every model aces or fails) and reproduction of all five archetypes above.
- **R6** — Full sweep and analysis.

R3 and R4 are the gates that make this an experiment rather than a vibe.

## Cost

36 calls per model per pass (6 C x 3 T x 2 turns) ≈ 0.21x the existing 171-item row. The
full active roster is roughly 19 hours per pass.

Execution is strictly sequential — one local model in memory, fixed ports 18080/18081, no
concurrency (`src/orchestration/run-matrix.ts`). Resume is effectively free via the
content-addressed item cache, which scans the archive per item.

## Open questions

- Scenario count, and how payloads map across the six challenges (C3 needs an action log,
  C5 needs an advisory). This is P2's first task and is not settled here.
- The exact payload ceiling, pending the minimum `ctxSize` across the roster actually
  selected for the sweep.
