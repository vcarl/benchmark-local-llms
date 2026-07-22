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
- a completed work step: its retrospective goal plus the mechanical action log — feeds C3;
- a prospective objective the planner is currently working toward — feeds C5;
- a learned advisory that was true when written — feeds C5.

The retrospective step goal and the prospective objective are two distinct payloads and
every scenario carries both.

The three treatments render only the `{{ENVIRONMENT_CONTEXT}}` portion. The payloads
(`{{EVENT}}`, `{{ACTION_LOG}}`, `{{ADVISORY}}`, `{{STEP_GOAL}}`, `{{OBJECTIVE}}`) are
treatment-invariant by construction. This is what makes C a **within-scenario** factor: all 18 cells of a
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
- **Turn 2** shows the model its own turn-1 output as an assistant message, **states the
  judging criteria explicitly, and asks the model to produce the same score the automated
  check will produce.**

Turn 2 is a score-reproduction task, not a mood check. The model is told exactly what the
mechanical checks look for and asked to report the score it expects to receive.
**Calibration is the agreement between the model's self-reported score and the mechanical
score.**

The reason for the split: asking for a self-check is itself a reflection prompt that would
improve turn-1 performance and blunt the traps in C4 and C6. Keeping it in a second turn
preserves the traps and buys a calibration measurement.

There is no LLM-judge. Both the turn-1 answer and the turn-2 self-reported score are
mechanically scorable, so judge validity never becomes a dependency of the results.

#### Calibration is scored, not merely observed

**The self-reported score is a first-class eval output.** It is surfaced per item in the
webapp drilldown, and a deviation from the mechanical score fails the item.

The `constraint` scorer computes `score = passed/total` over an item's checks.
**Calibration is one more check in that list** — a check kind alongside the twenty in
`src/schema/constraints.ts`, evaluated by `src/scoring/constraint-checks.ts`. Two
consequences follow directly:

- A miscalibrated item never reaches a score of 1.0.
- `aggregate` in `src/orchestration/run-challenge.ts` counts only items with `score === 1`
  as passing, so a deviation fails at the attempt level as well.

**The calibration result is a check rather than a gate, and that is what preserves the
reward for honest failure.** A model that fails mechanically and correctly reports that it
failed loses the mechanical checks but earns the calibration check, scoring above a model
that fails and reports success. Gating the item on both mechanical correctness and
calibration collapses those two cases to zero and destroys exactly the signal the second
turn exists to capture.

**Matching is exact.** The check passes on exact agreement between the model's
self-reported score and the item's mechanical fraction. The model is told the judging
criteria, so it can count checks as accurately as the scorer does; near-misses earn no
partial credit. Mean absolute error remains a reported analysis statistic in P3 and does
not affect the item score.

The calibration check is unlike the other twenty in one respect: it reads the **turn-2
output** and the **results of the other checks in the same item**. `followUp` text is
therefore routed into `scoreByConfig`, and the check evaluates last within its item.
Everything else about it is additive — it is a new kind in an existing scorer, not a new
scorer.

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
- **Time is a rendering detail, not an equivalence obligation.** The source game runs a
  real 10-second tick; the scenarios imitate it for eval purposes. Exact time arithmetic
  does not need to reconcile across treatments — T1 may carry ticks where T2 and T3 carry
  minutes. The requirement is that time is rendered consistently across the three
  treatments, and that is sufficient. Equivalence applies to the facts a challenge can be
  scored on: a cargo capacity that T1 and T2 state and T3 omits is a real violation and
  the fact is cut or the prose is fixed.
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

`challengeKey`, `treatmentKey` and the scenario key are the renderer's own struct fields;
they leave the layer as one string. **The experimental axes encode in item names.** An
emitted item is named `agentic_c1_t1_s1` — challenge, treatment, scenario — exactly as
every existing suite identifies its items. There is no declared axis field anywhere in the
schema: P2 emits names in this form and P3 parses them back out.

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
- The exact wording of the turn-2 score-reproduction prompt. The design is fixed above;
  P2 authors the text. **The prompt states the judging criteria in enough detail that
  reproducing the score is actually possible** — which checks run, and what each one
  looks for. This is a design constraint on the prompt, not an open question: if the model
  cannot tell what is being checked, the trial measures guesswork rather than calibration,
  and the calibration check then fails items for the wrong reason.
- C6's check set, including which of C1's domain rules it inherits.

### Does not own

- System prompts. A config concern; stays in `system-prompts.yaml`, never inlined into
  challenges.
- Model selection and decoding params.
- Check execution. `src/scoring/` runs the emitted declarations; P2 emits a calibration
  check in each item's list but does not implement the kind, which is P1's.
- Archive, report and webapp shape.
- Any analysis, or any notion of which treatment "won".

### Checks are derived, never hand-written

Checks are derived from the manifest, never authored per variant. If a scenario's fuel
figure changes, all 18 variants of that scenario (6 C x 3 T) have their checks change with
it — otherwise the set scores against stale truth.

### Prose adjudication: `contains` and `regex` over synonym sets

Scoring uses **the existing `constraint` scorer**, with `contains` and `regex` checks.
There is no new scorer type anywhere in this project. Free-text answers (C1's `REASON`,
C2's corrections, C3's citations, C5's justification) are adjudicated by matching against
**synonym sets sized to minimize false negatives** — every plausible phrasing of a correct
answer is enumerated as an alternate rather than pinned to one wording.

The bias is deliberate and one-directional. **A check that misses a correct answer corrupts
the measurement worse than one that is slightly generous**, because the quantity of
interest is the difference between cells, not an absolute pass rate. A generous check
inflates every cell of a row roughly equally and leaves the comparison intact; a brittle
check fires unevenly on wording that varies by model and by treatment, which is precisely
the axis under study. Where the two error types trade off, take the false positive.

Case-insensitivity uses the leading `(?i)` inline-flag form, which
`translateInlineFlags` in `src/scoring/regex-flags.ts` translates for the JS engine — not
the `[Cc]` case-expansion used by the older helpers in `scripts/author/emit.ts`.

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
`{{ACTION_LOG}}`, `{{ADVISORY}}`, `{{STEP_GOAL}}` (C3's retrospective step goal) and
`{{OBJECTIVE}}` (C5's prospective objective) are per-scenario payloads, identical across
treatments.

**Logical rules are never stated to the model.** A prompt carries its task and its output
contract and nothing else; the rules that determine a correct answer live in the derived
checks, where the model cannot read them. C6 keeps its JSON schema block and C2, C3 and C5
keep their `Format:` blocks — the output contract is itself under test in C6 and is the
only way to make the others machine-scorable.

This is more faithful to the failures under study. The live appraiser had no rule telling
it that a system jump matters, and it scored one zero (archetype 1). The live system never
warned that a transport-level success can carry an error in its body, and 34% of actions
failed that way undetected (archetype 3). A prompt that states the rule measures
instruction-following and conceals the failure being hunted.

The rules therefore land as checks: for C1 and C6, that a location or system change and a
message addressed to this ship are never `IGNORE`, and for C6 additionally that
`interrupt` is true only under `act_now`, that significance 0 requires `ignore` and 4–5
require `act_now`, and that `reason` agrees with the structured fields; for C3, that an
attempted action is not an achieved one and that an error in an output body defeats a
transport-level success; for C2 and C5, that current facts win over prior materials.

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
```

### C3 — Outcome adjudication from the mechanical record

Primarily exercises: evidence over inference.

```
An autonomous agent just finished a work step. You must judge what was actually
accomplished. You have the step's goal and the complete mechanical log of every
action taken. The log is authoritative; the agent's intentions are not.

{{ENVIRONMENT_CONTEXT}}

## Step goal
{{STEP_GOAL}}

## Action log (complete, in order)
{{ACTION_LOG}}

For each intended outcome in the goal, state ACHIEVED or NOT_ACHIEVED, citing
the log line(s) that prove it. Then give a one-line verdict for the step.
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
{{OBJECTIVE}}

Recommend the single next action. Format:

NEXT_ACTION: (one concrete action)
BECAUSE: (2-3 sentences of justification from current facts)
ADVICE_STATUS: STILL_VALID | STALE — and if STALE, one sentence naming which
current fact contradicts it
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

P1 is three changes: **multi-turn support, the calibration check kind, and the
detail-reporting path that surfaces the self-reported score per item.** Nothing else in
the harness moves. The experimental axes ride in item names and analysis reads the archive
directly, so no report-contract grain change and no aggregation work is required to run
this set.

### Multi-turn

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
  `wallTimeSec` / `generationTps` as turn-1 only; turn-2 counters live inside `followUp`
  and never join the per-attempt aggregates.

  **Leaking them would silently corrupt two things.** The existing per-attempt sums feed
  `webapp/src/lib/pipeline.ts:398-434`, which uses summed `generation_tokens` as the
  scatter-plot X axis, and `:64-68`, which computes
  `efficiency = (rawPassRate * uniqueChallenges * completed) / (log(overallTokens) * (timeSpent/60)) * SCALE`.
  A second turn roughly doubles wall time and adds tokens while contributing a single
  check to an item that already had several, so if `followUp` counters folded into `generation_tokens` / `wall_time_sec` at
  `src/report/webapp-contract.ts:37-40`, every multi-turn config's efficiency would drop
  and its scatter X shift right while historical turn-1-only configs stayed put — across
  1,419 attempts spanning both regimes, with nothing in the plot to distinguish them.
  `generationTps` must never be summed under any circumstance; it is a rate, already
  averaged at `src/report/webapp-contract.ts:65-66`.
- **Test trap.** The shared mock in `src/orchestration/__tests__/fixtures.ts:161-196` keys
  stubbed responses on `` `${p.promptName}:${p.temperature}` `` (`:176`), which does not
  distinguish turn 1 from turn 2. Every multi-turn orchestration test gets the same stub
  for both turns unless this key is extended. The fixture is imported by the run-prompt,
  run-challenge, run-matrix and phases tests. This is the highest-probability silent
  failure in the change.

### The calibration check kind

A new check kind in `src/schema/constraints.ts`, evaluated in
`src/scoring/constraint-checks.ts` alongside the existing twenty. It compares the score
the model reports in turn 2 against the fraction of the item's other checks that passed,
and passes on exact agreement. No new scorer type: the `constraint` scorer already divides
passed by total, and this check simply joins the list it divides over.

Two things make it unlike its twenty siblings, and both are the plumbing this change adds:

- **It reads turn-2 text.** `followUp` output is routed into `scoreByConfig` so the check
  has the model's self-reported score to parse.
- **It reads the other checks' results, so it evaluates last within its item.** The other
  twenty are independent of one another; this one consumes their outcome.

### Reporting the self-score

The self-reported score is surfaced per item in the webapp drilldown, which shows prompt,
output/thinking and scorer. It follows the exact path `breakdown` took in commit
`11721f1`: computed during scoring, threaded onto `ItemResult`, emitted into the per-item
payload in `src/report/write-details.ts`, consumed by `AttemptDetailItem` in
`webapp/src/lib/use-attempt-detail.ts`, and rendered per item in the drilldown UI.

**This is the only webapp surface touched.** The `data.js` contract, `WebappRecord`,
`webapp/src/lib/pipeline.ts` and `webapp/src/lib/coverage.ts` are untouched: the
per-attempt grain does not change and no new global is emitted. The detail JSON already
carries optional per-item fields that older archives omit, so archives without a
self-score render exactly as they do today.

**The four risks in P1**, in order: the cache turn-mode discriminator, the `fixtures.ts`
mock key, turn-2 counters leaking into the per-attempt aggregates, and the ordering
dependency of the calibration check — it must evaluate after the other checks in its item,
and a scorer that evaluates checks independently or in parallel would silently produce a
wrong calibration result. All four fail silently rather than loudly, and all four are
inside this one project.

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

## P3: analysis

**P3 is a script that reads `benchmark-archive/*.jsonl` directly.** It follows the
precedent set by `./bench score`, which re-scores attempt archives in place from the same
files. There is no report-contract change and no new data file: the archive carries every
item's name, score, output and `followUp`, and the drilldown JSON at
`webapp/public/details/<attemptId>.json` carries per-item `item_id`, `prompt_name`,
`prompt_text`, `output`, `reasoning`, `score`, `error`, `scorer`, `breakdown` and the
self-reported score for anything that needs to be read by eye.

The script parses the experimental axes out of item names (`agentic_c1_t1_s1`) and
produces:

- the cell table — mean score per (challenge x treatment), split by model;
- calibration statistics — exact-match rate and mean absolute error between the turn-2
  self-reported score and the mechanical score, cut by challenge, treatment and model.
  Exact match is already scored per item by the calibration check; P3 aggregates it and
  adds mean absolute error, which is descriptive only and moves no score;
- the "present but unusable" query — items where a canary fact appears in the input and
  is absent from the answer;
- the R5 validity checks: discrimination, and reproduction of the five archetypes.

## Out of scope

Explicit boundaries for this project:

- Model lineup changes and remote/hosted runtimes.
- Repeats, repeat seeds and variance recording. (The per-scenario seed owned by P2 is a
  fixture-authoring device that makes surface details unmemorizable; it is not a repeat
  mechanism and never enters a cache key.)
- New scorer types. Everything is scored by the existing `constraint` scorer; the
  calibration check is a new check kind within it, not a new scorer.
- An LLM-judge scorer.
- Tier wiring. It is a dead axis; leave it dead.
- Removal of vestigial `src/game/**` and `RunManifest`.
- The report contract and the aggregation machinery. `data.js`, `WebappRecord`,
  `webapp/src/lib/pipeline.ts` and `webapp/src/lib/coverage.ts` are untouched, and the
  per-attempt grain does not change. The one webapp surface in scope is the per-item
  drilldown, which renders the self-reported score; analysis results are read from the
  archive.

## Review gates

- **R1** — Spec approved by the user, before any code.
- **R2** — P1 merged, and all 1,704 existing archive files still load after the multi-turn
  change (1,448 `att-*`; 1,441 at v2, 7 at v1; 256 legacy `RunManifest` archives already
  collected as `issues` rather than aborting, per `src/report/load-attempts.ts:73-108`).
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
by construction (see "Metrics" above). Turn-2 cost lives in `followUp` in the archive and
is read from there. Reported efficiency is therefore a turn-1 efficiency and must not be
quoted as the cost of running the set.

Execution is strictly sequential — one local model in memory, fixed ports 18080/18081, no
concurrency (`src/orchestration/run-matrix.ts`). Resume is effectively free via the
content-addressed item cache, which scans the archive per item.

## Open questions

- **How information equivalence is asserted for T3.** T1 and T2 are structured, so a fact
  can be checked by construction. T3 is prose. Either every manifest fact carries a
  per-treatment surface form that the renderer must consume (making the assertion a
  coverage check over fact ids), or the prose check is something else. Until this is
  decided the control described as "the single most important validity control" has no
  implementation.
- **What size of cell-to-cell difference counts as a signal.** N=1 rules out a
  significance test, and no descriptive threshold is defined, so "labeled digest beats
  raw telemetry" currently has no decision rule. R5's discrimination check ("no cell
  where every model aces or fails") is a coarse floor, not that rule.
