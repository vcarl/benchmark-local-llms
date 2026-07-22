# Agentic-cognition challengeset — design

## Purpose

This challengeset exists to inform agent-harness design. The goal is to learn what works best when prompting models for an autonomous-agent-loop workload, and which models suit that workload.

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

The unit is a trial: **(challenge prompt C, context treatment T, model M)** on one
scenario from a fixed set of three.

- **C** — 6 challenge prompts, verbatim across all treatments and all models.
- **T** — 3 context treatments (T1 raw telemetry / T2 labeled digest / T3 narrative
  brief). Same facts, different structure. This is the factor most suspected to drive
  outcomes and the least understood, so it is the axis the set is built around.
- **M** — the existing model roster. **The lineup is a given, not a design variable.**
  Models are selected by the existing `--configs` globs against `configs.yaml`. Nothing
  in this project is built for the model axis. **Model scale is analyzed, never
  manipulated:** every model that runs is a model that already exists in `configs.yaml`,
  so a scale-related reading (H1, H4) is a post-hoc split of an observational roster, not
  a controlled comparison. No hypothesis licenses adding, removing or re-quantizing a
  model to test it.

**N=1 per cell.** No repeat mechanism, no seeds in the cache key, no variance recording.
Consequence, stated once and applied everywhere below: **every result is a directional
reading, never a statistically tested effect.** With one observation per cell there is no
within-cell variance to estimate, so no confidence interval, significance test or
"the gap is real" claim may be attached to any comparison in this document — including
the hypotheses and the R5 discrimination check. Where a result matters enough to need
confidence, the response is a follow-up experiment with a repeat mechanism, which is
explicitly out of scope here.

### The scenario

**A scenario is one coherent world-moment. All six challenges draw from that single
world — there are not six fixtures per scenario.** Each scenario carries, at once:

- standing state (fuel, hull, cargo, credits, contacts, comms);
- a prior-shift claim that current facts contradict — feeds C2 and C5;
- one incoming event — feeds C1, C4, C6;
- a completed work step: its goal plus the mechanical action log — feeds C3;
- a learned advisory that was true when written — feeds C5.

The three treatments render only the `{{ENVIRONMENT_CONTEXT}}` portion. The payloads
(`{{EVENT}}`, `{{ACTION_LOG}}`, `{{ADVISORY}}`, `{{GOAL}}`) are treatment-invariant by
construction. This is what makes C a **within-scenario** factor: all 18 cells of a
scenario rest on identical information, so any difference between cells is attributable to
structure and to nothing else.

The fact manifest spans the whole world-moment, not just the environment block, since the
equivalence assertion must cover every fact any of the six challenges can reach.

### The scenario set

**Scenarios are the replication factor.** With N=1 and no repeat mechanism, running K
scenarios is what gives each (C, T, M) cell more than one observation — K samples across
differing content rather than K resamples of identical content. Consequence: scenario
count is the compute multiplier.

The set is fixed at **three scenarios**, constructed so that correct answers genuinely
differ across them. Without this a constant-answer strategy scores well and the set fails
to discriminate: if every scenario's correct C1 disposition is ACT_NOW, a model with a
stuck ACT_NOW key aces C1; if every action log contains a failure, "NOT_ACHIEVED" is a
winning constant.

| Scenario | Incoming event | Correct C1 disposition | C3 step outcome |
|---|---|---|---|
| S1 | routine repetition, unchanged, same location | IGNORE | genuinely succeeded |
| S2 | incoming private message from another pilot | NOTE | mixed — body contains both a success and an `Error [...]` |
| S3 | system jump plus a threat indicator | ACT_NOW | failed while logged `status:"completed"` |

S1's "genuinely succeeded" case is load-bearing in both directions: it is the control that
catches a model biased toward NOT_ACHIEVED, and it is the one place where
evidence-over-inference can produce a false negative rather than a false positive.

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
  asymmetric. **This is a build-time assertion, not an authoring intention:** an automated
  check that runs with the renderer's own test suite and fails the build when any manifest
  fact is unencoded by any of the three treatments. A reviewer's eyeball at R3 is a
  second line of defense, not the assertion. It is the single most important validity
  control and the primary reason the rendering layer exists at all. The mechanism by
  which a *prose* rendering (T3) is checked against the manifest is not settled — see
  Open questions.
- **Fixed decoding params** per model, from the existing config.
- **Fixed output contract** per challenge.
- **Seeded surface details.** Scenario names and numbers are randomized per fixture so
  memorized answers cannot transfer. **The seed is a property of the scenario, not of the
  cell:** one seed produces one set of surface details, and all three treatments and all
  models see those same details. A difference between two cells is therefore never a
  fixture difference.
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

H2, H3 and H4 therefore carry an explicit ceiling caveat: each asserts that structure
matters more than capacity, and above the ceiling we cannot distinguish "structure beats
scale" from "we never tested enough scale." H1 is exempt only in the shrinking direction —
the roster's small end is well populated, so a widening gap toward small models is
observable even though the large end is not.

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

`treatmentKey` is this layer's name for the value the harness carries as `treatment`
(P1 change 3a); they are the same string, and the emitted YAML uses the harness spelling.

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
figure changes, all 18 variants of that scenario (6 C x 3 T) have their checks change with
it — otherwise the set scores against stale truth.

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

Ready-made mechanical check: the check **fails** when a canary token that appears in the
input is absent from `REASON` (and, for C1/C6, when the disposition on a location-change
event is `IGNORE`).

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

### Archetype coverage under the three-scenario set

Most archetypes map to challenges rather than to scenarios, so coverage is better than
scenario count suggests.

| Archetype | Exercised by | Coverage |
|---|---|---|
| 2 — narrative adoption | C2 under T3; every scenario carries a contradicted prior | all 3 |
| 4 — exemplar echo | C4 | all 3 |
| 5 — stale-skill over-trust | C5; every scenario carries an advisory | all 3 |
| 3 — attempted not achieved | C3 on S2 (mixed body) and S3 (failed-but-completed) | 2 of 3 |
| 1 — weight-0 on a location change | C1 and C6; requires a location change | S3 only |

**Archetype 1 is the single thin spot.** Design note for P2, not a decision made here: the
environment context can carry a recent jump independent of the `{{EVENT}}` — the worked
example does exactly this, with the ship having jumped Harrow to Ledge two minutes before
an unrelated event. That would let S2 exercise archetype 1 through C2's grounding without
disturbing S2's C1 answer being NOTE. P2 decides whether to use it.

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
The tanks read 49 of 100 and the hull is untouched. Thirteen of the hold's
fifty units are spoken for by the usual mix — nine units of iron ore, the
processing core and superconductor picked up back at Harrow, and a couple of
circuit boards — with credits at 44,510. Three private messages have piled up
unread since before the jump. One other ship, the Meridian-7, sits at the edge
of scan range and hasn't done anything worth mentioning.
```

## P1: harness seams

Land in this order: **3a -> 1 -> 2 -> 3b.**

3a, 1 and 2 are specified below. **3b is named by the landing order but is not specified
in this document** — it is the step that makes `challengeKey` / `treatment` actually
visible downstream, which is why it lands after 2 (the per-item array is its carrier).
Its exact contents are an open question; do not start it from an inferred definition.

### Change 3a: declared `challengeKey` + `treatment` on ChallengeItem

- Add as **optional** fields to all 6 union members in `src/schema/challenge.ts:20-85`.
  The 6 structs duplicate common fields deliberately (doc comment at `:11-14` — better
  error pointers); do not refactor to a shared base as part of this change. 12 new lines.
- Hoist onto `ResolvedItem` (`src/config/challenges.ts:19-25`) rather than routing via
  `PromptCorpusEntry` — see the tier precedent below.
- **Excluded from every hash.** `computePromptHash` (`src/config/hashing.ts:16-17`) is
  `shortSha256(promptText|systemText)`; `itemHash` (`challenges.ts:237`) is
  `shortSha256(promptHash|scorerKey)`; `challengeHash` (`:247-249`) joins those. None
  read `name` / `category` / `tier` / `tags`, so new optional fields are excluded by
  default. Document this in JSDoc next to the existing `tags` field.

  **Failure mode if included:** every `itemHash` changes -> full cache miss on all 19,522
  items; every `challengeHash` changes -> `attemptId` changes ->
  `webapp/src/lib/coverage.ts:16` recovers a new hash while all 1,419 existing records
  carry the old one -> every historical attempt reads as stale -> every coverage-adjusted
  passRate drops to ~0 and the ranking table zeroes out. Silent and
  catastrophic-looking.
- Reaches `ItemResult` at `src/orchestration/run-challenge.ts:174-198` as
  `Schema.optional(Schema.String)`, following the `scorerHash` precedent. Note `:149-152`:
  cache hits bypass this construction and return rows verbatim, so cached items carry
  undefined until re-run.

#### The tier precedent — do not repeat it

`tier` is required on all 6 item structs and on `PromptCorpusEntry:28`, copied at
`challenges.ts:205`, and stops dead at the `ItemResult` literal in
`run-challenge.ts:174-198`, which never mentions it. Zero non-test hits across
`webapp/src/lib`, `webapp/src/components`, `webapp/src/routes`, `src/schema/attempt.ts`,
`src/report`. Its only consumer is `src/cli/commands/list.ts:58-63`. It is a required
field every author fills in that has never influenced a chart, a filter, or a score.

Therefore: **the acceptance criterion for 3a is "visible in the webapp", not "present in
ChallengeItem", and a test must assert the archive -> report half, not the schema ->
config half.**

### Change 1: multi-turn

- **Additive** optional field on `CompletionParams`
  (`src/llm/chat-completion.ts:48-61`):
  `readonly priorTurns?: ReadonlyArray<{ role: "assistant" | "user"; content: string }>`.
  `buildBody` (`:167-176`) becomes `[system, {user: userPrompt}, ...priorTurns]`.
  Strictly additive; `exactOptionalPropertyTypes: true` is on, so use conditional spreads,
  and callers omitting it are unaffected. **Rejected: reshaping to a `messages` array.**
  It buys nothing the optional field does not, and it is breaking at every site that names
  the current scalar fields: the single production construction (`toCompletionParams`,
  `src/orchestration/run-prompt.ts:227`), the shared orchestration mock
  (`src/orchestration/__tests__/fixtures.ts:161-196`, which types on `CompletionParams`),
  and `src/llm/chat-completion.test.ts:43,86-89`, which constructs the params and asserts
  the exact two-message request body. The optional field breaks none of them.
- **Turn 2 runs from `executeOrCacheItem` in `src/orchestration/run-challenge.ts` as a
  second `runPrompt` call**, merged into `ItemResult` there. Do not put turn-2 data on
  `ExecutionResult` (`src/schema/execution.ts:47-96`): it is already a bloated
  intermediate carrying ~11 nulled scenario-only fields, it is decoded by
  `src/archive/loader.ts:30` against 256 legacy archives, and it also serves the legacy
  `src/orchestration/phases.ts:120` path.
- **Nested optional `followUp` struct on `ItemResult`** (`src/schema/attempt.ts:6-37`),
  carrying `output`, `reasoning`, `rawOutput`, `error`, `promptTokens`,
  `generationTokens`, `generationTps`, `wallTimeSec`. This matches the file's own idiom —
  `scorerHash:11` and `breakdown:30-36` are both post-hoc `Schema.optional`. All 1,448
  existing `att-*.jsonl` decode unchanged; `Schema.encode` in
  `src/archive/attempt-writer.ts:15-16` drops undefined keys, so existing rows stay
  byte-identical. The array-of-turns alternative is rejected: it either breaks every
  scalar reader or duplicates turn-1 data in every line.
- **No `schemaVersion` bump.** Currently `Schema.Literal(1, 2)` at
  `src/schema/attempt.ts:54`, written at `run-challenge.ts:86`. House precedent
  (`scorerHash`, `breakdown`, `blobPool`) is optional fields with no bump. Three
  consumers use exact equality rather than `>=`, and each fails silently:
  `src/report/reconstruct.ts:42` (v3 loses all drilldown detail, swallowed as `skipped`
  at `write-details.ts:36-41`), `src/cli/commands/score.ts:267` (falls back to the corpus
  path), `src/cli/commands/export.ts:55` (hard fail). `src/schema/attempt.test.ts:128-131`
  explicitly asserts v3 is rejected. If a bump ever becomes necessary, convert all three
  to `>=` in the same commit.
- **Cache discriminator required.** `executeOrCacheItem` (`run-challenge.ts:124-199`)
  returns cache hits verbatim (`:149-152`). A turn-1-only cached row would return with no
  `followUp` forever, producing a silently mixed archive. **Requirement: a cached row is
  reusable only when its turn mode matches the turn mode the item is being executed
  under.** A one-turn cached row must miss for a two-turn item and vice versa; the
  discriminator therefore participates in the lookup at `:142-147` (alongside
  `configHash` / `challengeId` / `challengeVersion` / `itemHash`), rather than being
  applied as a post-hoc filter on the returned row. Do not satisfy this by stamping the
  missing turn onto a hit: the doc comment at `:109-123` calls the `scorerHash` stamp a
  "narrow exception", and a second exception would rewrite measured-cost fields.
- **Metrics: turn-1 stays definitionally turn-1.** Keep `ItemResult.generationTokens` /
  `wallTimeSec` / `generationTps` as turn-1 only; turn-2 counters live inside `followUp`.
  Add explicit `followup_generation_tokens` / `followup_wall_time_sec` to `WebappRecord`,
  summed over the attempt's items exactly as `generation_tokens` / `wall_time_sec` already
  are (`src/report/webapp-contract.ts:37-40`) and emitted as `0` — not omitted, not null —
  for any attempt whose items carry no `followUp`. The webapp then opts in by reading
  them; nothing existing changes meaning.

  **Summing would silently corrupt two things.** `webapp/src/lib/pipeline.ts:398-434` uses
  summed `generation_tokens` as the scatter-plot X axis, and `:64-68` computes
  `efficiency = (rawPassRate * uniqueChallenges * completed) / (log(overallTokens) * (timeSpent/60)) * SCALE`.
  A second turn roughly doubles wall time and adds tokens for zero additional pass credit,
  so every multi-turn config's efficiency drops and its scatter X shifts right while
  historical turn-1-only configs stay put — with 1,419 attempts spanning both regimes and
  no discriminator field in `data.js`. `generationTps` must never be summed; it is a rate,
  already averaged at `src/report/webapp-contract.ts:65-66`.
- **Test trap.** The shared mock in `src/orchestration/__tests__/fixtures.ts:161-196` keys
  stubbed responses on `` `${p.promptName}:${p.temperature}` `` (`:176`), which does not
  distinguish turn 1 from turn 2. Every multi-turn orchestration test gets the same stub
  for both turns unless this key is extended. The fixture is imported by the run-prompt,
  run-challenge, run-matrix and phases tests. This is the highest-probability silent
  failure in the change.

### Change 2: per-item report grain

- **A second, lean parallel array in `data.js`**, `globalThis.__BENCHMARK_ITEMS`, one row
  per item, carrying exactly these six fields and no others:
  `{attempt_id, item_id, score, challenge_key, treatment, error_kind}` — snake_case, to
  match the existing `WebappRecord` convention. `challenge_key` / `treatment` are the
  optional strings from change 3a and are omitted when absent. `error_kind`'s derivation
  from `ItemResult.error` (a nullable free-text string today, with no existing
  classification anywhere in `src/` or `webapp/src/`) is an open question; do not invent a
  taxonomy while implementing.
  At ~90–170 B/row x 19,522 items that is ≈ 1.8–3.3 MB. Blast radius on
  `webapp/src/lib/pipeline.ts` and `webapp/src/lib/coverage.ts` is **zero** — every
  existing function keeps taking `BenchmarkResult[]`.
- Full text stays in the existing lazy `webapp/public/details/<attemptId>.json` (77 MB
  across 1,413 files), which already carries per-item `item_id` / `prompt_text` /
  `output` / `reasoning` / `score` / `error` / `scorer` / `breakdown`, and is already
  fetched and cached by `webapp/src/lib/use-attempt-detail.ts`.
- Requires: `formatDataJs` (`src/report/write-data-js.ts:34-37`) to emit two assignments —
  it hardcodes a single one, and `src/report/write-data-js.test.ts` parses the JSON back
  out of the string, so that test breaks; `aggregateAttempts` (`src/report/aggregate.ts:17-40`)
  to return a second array; `ReportSummary` (`src/report/index.ts:35-47`) to carry it;
  a `normalizeItemRecord` and a second `declare global` in `webapp/src/lib/data.ts`.
- **Rows must carry `attempt_id` verbatim, never a synthesized id.**
  `webapp/src/lib/coverage.ts:16-17` recovers the canonical challenge hash via
  `attemptId.split("-")[2]`; a synthesized id yields `""` and collapses every challenge
  into one universe entry.
- **Rejected: changing the existing array's grain.** `pipeline.ts` treats every element as
  an attempt in at least 8 places. `splitInvocations` (`:185-215`) detects invocation
  boundaries by a repeated bare `challenge_id` — at 13.8 items/attempt every item would
  open a new invocation. `coverage.ts:58` sums `item_count` per canonical challenge,
  inflating the universe denominator 13.8x silently. That is a re-architecture of
  `pipeline.ts` + `coverage.ts` + ~561 lines of `pipeline.test.ts` + 119 of
  `coverage.test.ts`, not a grain change.
- Record-array consumers to keep in mind: `webapp/src/routes/__root.tsx:66,74,98-102` (the
  only `DATA` importer), `DrilldownPanel.tsx:12`, `ConfigSummaryPanel.tsx:18`,
  `DebugPanel.tsx:10`, and indirectly `RunGroupTable.tsx` / `RunRowItem.tsx` /
  `Scatter.tsx`.
- `WebappRecord` (`src/report/webapp-contract.ts:13-35`) is hand-mirrored field-for-field
  in `webapp/src/lib/data.ts:1-23` with **no compile-time link** (separate tsconfig and
  package.json). `src/report/webapp-contract.test.ts` asserts on `toWebappRecord` output
  but not against the webapp interface. Both files change together or drift silently.

### Lint and typing constraints

`npm run lint` is `biome check src/` plus `scripts/lint-strict.sh`, which is three textual
greps over `src/` only (`webapp/src/` is unlinted): no `try {` (except `src/cli/main.ts`,
`src/cli/subprocess-registry.ts` and `src/interop/`), no raised-error keyword (except
`src/interop/` and `*.test.ts`), no logging-object prefix (except `src/cli/`). These are
plain `grep -rn` over the file text, so they match comments too: example code in `src/`
must avoid the banned tokens even inside comments.

`tsconfig.json` sets `exactOptionalPropertyTypes: true`, so optional fields cannot be
assigned undefined explicitly — use the conditional-spread idiom already at
`src/orchestration/run-challenge.ts:74-83`.

## Out of scope

Explicit boundaries for this project:

- Model lineup changes and remote/hosted runtimes.
- Repeats, repeat seeds and variance recording. (The per-scenario seed owned by P2 is a
  fixture-authoring device that makes surface details unmemorizable; it is not a repeat
  mechanism and never enters a cache key.)
- An LLM-judge scorer.
- Tier wiring. It is a dead axis; leave it dead.
- Removal of vestigial `src/game/**` and `RunManifest`.
- Webapp UI work beyond the contract change.
- P3 analysis tooling.

## Review gates

- **R1** — Spec approved by the user, before any code.
- **R2** — P1 merged. 1,704 archive files still load (1,448 `att-*`; 1,441 at v2, 7 at v1;
  256 legacy `RunManifest` archives already collected as `issues` rather than aborting,
  per `src/report/load-attempts.ts:73-108`).
- **R3** — One scenario rendered all 18 ways, read by the user. The treatments *are* the
  experiment; if T3 leaks a fact that T1 buries, H2 measures our prose.
- **R4** — Mechanical checks validated against outputs the user hand-labels. Skip this and
  the set measures its own regexes.
- **R5** — Pilot sweep, then validity checks: discrimination (no challenge x treatment
  cell where every model aces or fails) and reproduction of all five archetypes above.
- **R6** — Full sweep and analysis.

R3 and R4 are the gates that make this an experiment rather than a vibe.

## Cost

**Per scenario:** 18 items (6 C x 3 T) x 2 turns = **36 calls per model**.

**Per pass, per model:** 3 scenarios x 6 challenges x 3 treatments x 2 turns =
**108 calls**. That is roughly 0.63x the existing 171-item challenge row, which is 171
calls per model. Across the full 60-config active roster, approximately **57 hours**,
sequential — the roster would not typically all be run.

Note the deliberate asymmetry with the reported metrics: those calls are the true cost,
but `generation_tokens` / `wall_time_sec` / `efficiency` in the report cover turn 1 only
by construction (see "Metrics" above). Turn-2 cost is visible solely through the
`followup_*` fields. Reported efficiency is therefore a turn-1 efficiency and must not be
quoted as the cost of running the set.

Execution is strictly sequential — one local model in memory, fixed ports 18080/18081, no
concurrency (`src/orchestration/run-matrix.ts`). Resume is effectively free via the
content-addressed item cache, which scans the archive per item.

## Open questions

- **`{{GOAL}}` carries two different things.** C3's goal is the completed step's goal
  (retrospective); C5's is the current objective (prospective). A scenario must therefore
  carry two distinct goal payloads, and the placeholder naming in the challenge prompts
  does not currently distinguish them.
- The exact payload ceiling, pending the minimum `ctxSize` across the roster actually
  selected for the sweep.
- **The turn-2 prompt text and its calibration scoring rule.** P2 is named as the owner,
  but "a generic self-assessment verdict scored against turn-1 mechanical ground truth"
  is not a specification: neither the wording nor what a calibration score *is* (a
  per-item agree/disagree with the turn-1 check outcome? a signed over/under-confidence
  measure?) exists yet. Nothing in P1 depends on the answer; R4 does.
- **How information equivalence is asserted for T3.** T1 and T2 are structured, so a fact
  can be checked by construction. T3 is prose. Either every manifest fact carries a
  per-treatment surface form that the renderer must consume (making the assertion a
  coverage check over fact ids), or the prose check is something else. Until this is
  decided the control described as "the single most important validity control" has no
  implementation.
- **T1's tick-to-wall-clock rate.** The worked example encodes "jumped ~2 min ago" as
  `completed_ticks_ago: 12` in T1 and as plain minutes in T2 and T3. Nothing in T1 states
  the seconds-per-tick rate, so the manifest fact is not recoverable from T1 — an
  equivalence violation in the spec's own example. Either T1 carries the rate, or the
  manifest fact is expressed in ticks everywhere. Not decided here.
- **Whether C6 inherits C1's domain constraints** (location change is never IGNORE, a
  message addressed to this ship is never IGNORE). C6 is described as "C1's judgment"
  but its constraint block states only the schema-consistency rules. This determines C6's
  derived ground truth for exactly the events C1 traps on, so it cannot be left to the
  implementer.
- **The contents of P1 change 3b.** The landing order names it; no section defines it.
- **`error_kind`'s value domain** in the per-item `data.js` array. `ItemResult.error` is
  a nullable free-text string with no existing classification in the codebase, and no
  taxonomy is specified here.
- **What size of cell-to-cell difference counts as a signal.** N=1 rules out a
  significance test, and no descriptive threshold is defined, so "labeled digest beats
  raw telemetry" currently has no decision rule. R5's discrimination check ("no cell
  where every model aces or fails") is a coarse floor, not that rule.
