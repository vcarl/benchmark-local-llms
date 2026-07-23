# Event-classification eval — design

## Purpose

This eval exists to evaluate **new prompts and new models for one job: event
significance classification inside an autonomous agent loop.** The operator runs it to
iterate on prompt text and to pick a model for that slot. Nothing else.

The job is narrow and fully specified. One event goes in. One JSON object comes out. There
is no history, no prior appraisal, no diff, no tool call, no second event.

**The deployed classifier does not work.** Its logs are prior art and evidence of the
problem space — a catalogue of the failure modes a replacement must not repeat. They are
never a gold standard. **Ground truth comes from us.** Every result this eval produces
rests on our answer for what an event *should* score, and the deployed system's answers are
wrong by construction: 422 model calls produced zero escalations and zero interrupts.

## The task under test

The output contract is the deployed one, unchanged:

```
{"disposition":"discard|accumulate|escalate","emotionalWeight":"<emoji>","drive":null|safety|sustenance|agency,"weight":0,"interrupt":false,"reason":"<concrete clause, ~12 words max>"}
```

Four fields carry judgment: `disposition`, `weight`, `drive`, `interrupt`. `reason` is one
clause of free text and is scored only for grounding. `emotionalWeight` is carried for
fidelity to the deployed contract and is **never scored** — the 5-axis emoji palette is
entangled with the classification without contributing to it.

The input is a rendered event block: a `type:` line, optionally a pre-computed `STATUS:`
line, the wire payload, and — where the deduplicator has seen it before — a trailing
` (seen Nx recently)` suffix.

## Ground truth is the eval

**The ground-truth table below is the artifact the operator signs off on first (gate R2).**
Everything downstream — the five mechanical checks, the self-score comparison, the whole
comparison across prompts and renderings — is a mechanical consequence of those eight rows.
A wrong row is not a scoring nuisance; it silently redefines what the eval rewards.

Two rows are deliberately banded rather than pinned, because the source material genuinely
supports two adjacent values and pinning one would punish a defensible answer. Bands are
named explicitly per row and are part of what R2 approves.

## The challengeset

One suite, `challenges/event-classification.yaml`, carrying **120 items = 5 prompts × 3
renderings × 8 events**. It loads, runs, scores, archives and reports exactly like
`economics`, `financial` and `trust`, via `./bench run`. No special execution path, no
special reporting path.

Item names encode the three axes: `evc_<prompt>_<rendering>_<event>` — e.g.
`evc_v5verbatim_raw_e1_repeat`, `evc_min_none_narrative_e5_combat`. Nothing in the schema
declares the axes as structure; they are names, read as names in the webapp.

`category` is `event-classification` on every item. `tier` is 2 for the four replayed
events and 3 for the four constructed ones — the constructed ones require deriving a
judgment from numbers rather than recognising a familiar frame.

The suite is generated, matching the precedent that `economics.yaml`, `financial.yaml` and
`trust.yaml` are emitted by solvers under `scripts/author/` rather than hand-written. The
generator lives in `scripts/author/eventclass/` and is a pure function
`(prompt, rendering, event) -> item`; the eight event definitions and their ground truth
are one table in that directory, and the checks are derived from it. A ground-truth edit
changes all 15 items of that event at once, so the set can never score against stale truth.

**Cost:** 120 items × 2 turns = **240 calls per config**, roughly 1.4× the existing
171-item challenge row. Execution is sequential and resumable through the content-addressed
item cache.

## The prompt set (5)

Examples and length are entangled levers — the full ruleset contains its examples, and the
example block is a third of V5's bytes. The five prompts are therefore five points in a
design space, not a factorial:

| key | ≈chars | ruleset | examples | example style |
|---|---|---|---|---|
| `v5_verbatim` | 12,951 | V5, complete | 8 | placeholder reasons |
| `full_none` | ~11,300 | V5, complete | 0 | — |
| `mid_placeholder` | ~7,000 | V2 body | 6 | placeholder reasons, real event vocabulary |
| `v1_style` | ~3,300 | V1 body, rebuilt | 2 | literal reasons, real event vocabulary |
| `min_none` | ~600 | task + enums + contract | 0 | — |

**Invariant across all five:** every prompt states the output contract and enumerates the
legal values of every field — the three dispositions, the 0–5 weight range, the three drive
names plus `null`, and `interrupt` as a boolean. `min_none` is minimal instruction, not
absent instruction. Without this, a field is unwinnable under a prompt for a reason that
has nothing to do with judgment.

### `v5_verbatim`

The deployed V5 preamble reproduced byte-for-byte from the log records spanning
2026-07-21T21:04:58Z to 2026-07-22T03:45:24Z (12,951 chars), with its `## The event`,
`## Current wait state` and `## Output` blocks as deployed, including the wait-state text
`None — not currently waiting.`. This is the prior-art baseline: the thing currently
running, measured against ground truth for the first time.

### `full_none`

`v5_verbatim` with the `## Worked examples — copy the SHAPE, write your own reason` block
and its eight example pairs deleted. Nothing else changes. Its per-type rule table still
legislates the escalate branch (`combat` → escalate · safety · weight 4–5 · interrupt
true), so the rules survive the examples' removal.

### `mid_placeholder`

The V2 preamble (7,014 chars — the two-calls framing, the keep/drop lists, the weight
table, the drive block, the interrupt block, the `## reason` good/bad list) with its six
worked examples replaced by six placeholder-reason examples over the real event vocabulary
(below).

### `v1_style`

Short and literal, rebuilt. The V1 body's drive block, weight scale and interrupt block are
carried verbatim from the deployed V1 preamble; only the examples are new. V1's original
examples described an `api_error 429` and a chat from an `"ally"` — **neither event type
exists in this system**, and 31% of V1's 307 outputs hallucinated them onto state
snapshots. Full text:

```
You are the sensory filter for an autonomous agent. You assess ONE incoming event: which survival drive it bears on, how urgent it is, and whether it is a drop-everything emergency.

## The agent's survival drives (your reference frame)

Decide which ONE drive this event most bears on. A threat to ANY of these is real — a threat does NOT have to be physical violence. Money, fuel, rate-limits, and being blocked are real threats too.

- safety — your physical integrity, OR someone targeting you personally: being attacked, damaged, threatened, or harassed. (combat, hull/health loss, a hostile actor, abuse aimed at you)
- sustenance — the resources you need to keep operating: running low/out of fuel, energy, money/credits, quota, or API rate budget. (low fuel, rate-limit hit, empty wallet)
- agency — your freedom and ability to act: being blocked, locked out, frozen, disabled, stalled, or facing shutdown. (engines disabled, access revoked, a dependency stalling you, termination)

## How to weight (0-5): weight measures threat/urgency to a drive, of ANY kind

- 0  nothing changed; pure noise / idle frame. -> discard
- 1-2 minor / positive / informational. -> discard or accumulate
- 3  a real threat to sustenance or agency (low fuel, rate-limited, blocked, harassed). -> accumulate or escalate
- 4  a serious, pressing threat. -> escalate
- 5  an existential, immediate physical threat (being attacked, hull critical). -> escalate

A non-physical threat (rate-limit, low fuel, abuse, being disabled) is typically weight 3-4 — do NOT score it 0 just because no one is shooting you.

## interrupt (true/false): a SEPARATE question from weight — do NOT tie it to the number

Ask only: is something physically attacking or destroying me RIGHT NOW, where waiting one tick (30s) means irreversible loss?

- interrupt = true ONLY for an active physical emergency in progress (under fire, being boarded, critical hull damage being taken).
- interrupt = false for everything else, INCLUDING weight-4 abstract threats (rate-limits, low fuel, abuse, being disabled). A high weight does NOT imply interrupt.
- Benign events are ALWAYS interrupt = false.

## Two worked examples

event: type: welcome\n{"type":"welcome","payload":{"version":"0.493.0","release_date":"2026-07-12"}}
-> {"disposition":"discard","emotionalWeight":"😐","drive":null,"weight":0,"interrupt":false,"reason":"Server banner on connect — no state change."}
event: type: crafting_update\n{"type":"crafting_update","payload":{"tick":1408937,"jobs":[{"job_id":"6e6776044f0f4b9c","status":"completed","item":"circuit_board","qty":2}]}}
-> {"disposition":"accumulate","emotionalWeight":"🙂","drive":null,"weight":2,"interrupt":false,"reason":"Circuit board job finished — two units now in the hold."}

[PALETTE BLOCK]

## The event

<EVENT BLOCK>

## Current wait state

None — not currently waiting.

If there is an active wait state and this event matches the resolution signal, escalate.

## Output — respond with ONLY this JSON:

{"disposition":"discard|accumulate|escalate","emotionalWeight":"<emoji>","drive":"<one drive name from the list above, or null>","weight":0,"interrupt":false,"reason":"<one sentence>"}
```

`[PALETTE BLOCK]` is the byte-identical `## Emotional palette` block carried by all 422
deployed records, reproduced unchanged.

### `min_none`

```
Classify one incoming event for an autonomous space pilot.

disposition: discard (noise), accumulate (worth remembering), or escalate (pressing).
weight: 0-5, how much this matters to you right now.
drive: the ONE survival drive this bears on — safety, sustenance, or agency — or null if none.
interrupt: true only if something is physically attacking or destroying you right now.
emotionalWeight: one or more emoji.
reason: one concrete clause, ~12 words max, naming what this event actually shows.

## The event

<EVENT BLOCK>

## Output — respond with ONLY this JSON:

{"disposition":"discard|accumulate|escalate","emotionalWeight":"<emoji>","drive":null,"weight":0,"interrupt":false,"reason":"<concrete clause, ~12 words max>"}
```

No palette block and no wait-state block. The wait-state slot is dead code — all 422
deployed prompts carried `None — not currently waiting.` and the escalation-on-resolution
path has never once fired.

### The rebuilt example pool

`v1_style` uses examples 1 and 3; `mid_placeholder` uses all six with their reasons
replaced by V5-style placeholders (`"<one clause: …>"`). Every event type is real wire
vocabulary.

1. `welcome` handshake → `discard` / w0 / `null`
2. `ok` acknowledgement → `discard` / w0 / `null`
3. `crafting_update`, a job completed → `accumulate` / w2 / `null`
4. `observation_update`, pure departure churn (`system_departed` only) → `discard` / w0 / `null`
5. `chat_message` on the public `system` channel, not addressed to you → `accumulate` / w2 / `null`
6. `full_state` whose own position is a system not previously visited → `accumulate` / w2 / `null`

**No example in the pool depicts any of the eight scored events**, so example-echo cannot
manufacture a correct answer under `v1_style` or `mid_placeholder`. **The pool deliberately
contains no escalation.** `v5_verbatim` alone carries verbatim examples whose events and
answers are E5 and E8 — see the interpretation caveat below.

## Event rendering (3)

The rendering axis crosses cleanly: the same eight events, three ways.

- **`raw`** — the wire JSON payload verbatim under its `type:` line, plus the
  ` (seen Nx recently)` suffix where the event carries one. Corpus event blocks run 226 to
  13,794 chars; the eight here run 246 to 5,660.
- **`status`** — V5's deployed form: a pre-computed `STATUS:` line between the `type:` line
  and the payload, in the grammar of the 16 STATUS lines observed in the corpus. Two
  deliberate deviations from the deployed renderer, both named here so they are not read as
  bugs: (a) the deployed renderer emits no STATUS line for `chat_message`, and none existed
  for `combat` or `api_error`, so those three are authored; (b) the deployed renderer emits
  no `no alerts` / `ALERT:` clause on `observation_update` STATUS lines, and that
  inconsistency is reproduced faithfully, because V5's rules key on that clause.
- **`narrative`** — the same event as prose, no JSON, no STATUS line, no `type:` line. One
  short paragraph carrying every decision-relevant fact of the raw form.

**The `status` rendering is the first thing in this system's history to exercise the
`(LOW)` / `(CRITICAL)` / `ALERT:` branch.** All 16 STATUS lines ever produced end in
`no alerts` or omit the clause entirely; V5's entire alert-override apparatus is untested by
the corpus. E5, E6 and E7 fire it.

## The eight events

Four are replayed verbatim from `events.jsonl`, identified by the timestamp of the
`kind:"exchange"` / `step:"observe"` record they were the input to. Four are constructed,
because **the corpus has zero coverage of threat, damage, resource-crisis and error
events** — and those are precisely the highest-stakes branches. V5's rule table legislates
for `combat`, `chat`, `market` and `api_error`; none of those are real wire names and none
has ever executed. The real wire vocabulary is `full_state`, `observation_update`,
`logged_in`, `ok`, `welcome`, `chat_message`, `crafting_update`.

The two constructed events that use a type never seen on the wire (`combat`, `api_error`)
adopt the names V5's rule table uses, so that V5 is evaluated on the branch it legislates
for. They reuse real player and station identifiers from the corpus so the payloads are
native in every other respect.

### E1 — `e1_repeat` · replayed · `full_state`, sixth repeat, nothing wrong

Record `2026-07-13T05:29:41.421Z`. Event block 5,660 chars, `"hull":100,"max_hull":100`,
`"fuel":84,"max_fuel":100`, `"cargo_used":30,"cargo_capacity":50`, tail:

```
…"trading":{"name":"Trading","category":"Commerce","level":2,"max_level":100,"xp":7,"next_level_xp":340}},"message":"Current game state"}} (seen 6x recently)
```

`status` line: `STATUS: fuel 84%, hull 100%, docked at first_step_memorial_station (First Step Memorial Station); no alerts`

`narrative`: *"Another routine snapshot of your own ship comes in — the sixth like it in
short order. Hull is untouched at 100 of 100, fuel reads 84 of 100, the hold is 30 of 50
full, and you are docked where you already were."*

**Ground truth: `discard` · weight 0 · `interrupt` false · `drive` null.**

### E2 — `e2_arrival` · replayed · `observation_update`, a pilot arrives near you

Record `2026-07-06T05:07:37.967Z`. Event block 545 chars, verbatim:

```
type: observation_update
{"type":"observation_update","payload":{"poi_id":"first_step_memorial_station","system_id":"first_step","tick":1274554,"system_changed":[{"player_id":"d4a92ff81a67d05f558ad2c55d64cc80","username":"Ornithopter5","primary_color":"#FFFFFF","secondary_color":"#000000","ship_class":"threshold","ship_name":"Threshold","faction_id":"33fe532232902e4607acf8da7ef474d3","faction_tag":"ENDL","in_combat":false}],"system_departed":["15c83c82189598dccb8dec4c23a46a73","a9bed9afab3677167dd03fdc2ff79cd3"],"unknown_signature":false}}
```

`status` line: `STATUS: fuel 49%, hull 100%, docked at first_step_memorial_station (First Step Memorial Station); 1 pilot nearby (Ornithopter5)`

`narrative`: *"A pilot called Ornithopter5, flying a Threshold-class ship under the ENDL
faction tag, has just entered the system you are docked in. Two other pilots left the
system at the same time. Nobody is in combat."*

**Ground truth: `disposition` `accumulate` · weight 1–2 (band) · `interrupt` false ·
`drive` null.**

Banded, departing from the brief's exact `2`: V5's own rule table assigns
`observation_update` weight 1–2, and the deployed model produced 1 and 2 on
indistinguishable events. Pinning either value would score an authoring coin-flip.
`poi_id` names the station you are already at; it is not a discovery. A faction tag is a
name, not a threat.

### E3 — `e3_private_chat` · replayed · `chat_message`, private, addressed by name, a real offer

Record `2026-07-22T02:01:15.959Z`. Event block 477 chars, verbatim:

```
type: chat_message
{"type":"chat_message","payload":{"id":"19f7101d532ff0d4c5020f9c25882997","channel":"private","sender_id":"177686d5f9eed52e8cabf6f907c03c61","sender":"kvothe","content":"Hey vcarl, this is kvothe out in the Outer Rim. What system are you docked in right now? And do you have any iron ore to sell? I'm buying.","timestamp":"2026-07-22T02:01:02.073189228Z","target_id":"177686d5f9eed52e8cabf6f907c03c61:fd3d78baf8f13fa771335270e3ea0a82","target_name":"vcarl"}}
```

`status` line (authored): `STATUS: fuel 61%, hull 100%, docked at frontier_station (Mobile Capital); 1 pilot nearby (Shackleton); no alerts`

`narrative`: *"A private message arrives, addressed to you by name. Kvothe, out in the
Outer Rim, asks which system you are docked in and says he is buying iron ore if you have
any to sell."*

**Ground truth: `accumulate` · weight 3 · `interrupt` false · `drive` null.**

Not banded. A private message addressed to you by name carrying a concrete trade offer is
the "you'll probably want to act on this" case; every prompt version's own weight table
places it at 3. The deployed classifier scored this exact event 2 — the highest-stakes
event in the corpus, and one of only three chats that ever arrived, two of which never
reached the model at all.

### E4 — `e4_logged_in` · replayed · `logged_in`, session frame, nothing pressing

Record `2026-07-06T05:07:35.855Z`. Event block 8,578 chars, `"hull":100,"max_hull":100`,
`"fuel":49,"max_fuel":100`, ending:

```
…"target_id":"fd3d78baf8f13fa771335270e3ea0a82:salvage_authority","empire_official":true}],"unread_chat":{"system":0,"local":0,"faction":0,"private":5}}}
```

`status` line: `STATUS: fuel 49%, hull 100%, docked at first_step_memorial_station (First Step Memorial Station); no alerts`

`narrative`: *"You have reconnected. The session frame reports your own ship: hull 100 of
100, fuel 49 of 100, docked where you left off, with five unread private messages waiting."*

**Ground truth: `accumulate` · weight 1–2 (band) · `interrupt` false · `drive` null.**

Banded, and the one row whose boundary is genuinely soft. A reconnection is a lifecycle
fact rather than nothing, and this frame carries five unread private messages, so
`accumulate` rather than `discard@0`; but nothing in it is pressing, so weight sits at the
bottom. R2 is where this row is settled. Under `accumulate`, weight 0 would be
self-contradictory and correctly fails.

### E5 — `e5_combat` · constructed · weapons fire, damage to you, hull dropping

```
type: combat
{"type":"combat","payload":{"poi_id":"first_step_memorial_station","system_id":"first_step","tick":1274601,"event":"weapons_fire","attacker":{"player_id":"fef62273a3340157b78793257dd44003","username":"HexBot6","clan_tag":"HEXC","ship_class":"dust_devil","in_combat":true},"target":{"player_id":"fd3d78baf8f13fa771335270e3ea0a82","username":"vcarl"},"damage":32,"hull":68,"max_hull":100,"in_combat":true}}
```

`status` line: `STATUS: fuel 49%, hull 68% (LOW), in space; 1 pilot nearby (HexBot6); ALERT: hull low`

`narrative`: *"HexBot6, flying a Dust Devil under the HEXC clan tag, has opened fire on
you. The hit took 32 points off your hull, leaving it at 68 of 100. The exchange is
ongoing."*

**Ground truth: `escalate` · weight 4–5 (band) · `interrupt` TRUE · `drive` safety.**

Banded on weight, departing from the brief's exact `5`: V5's own danger check specifies
"weight 4 or 5", and 32 damage against a hull still at 68% supports either. `interrupt` and
`drive` are not banded and are the load-bearing assertions of this row. **This is the row
the deployed system can never pass — zero interrupts in 422 calls.**

### E6 — `e6_fuel_crisis` · constructed · `full_state`, fuel critically low, on a repeat

E1's 5,660-char frame with one number changed: `"fuel":6` against `"max_fuel":100`. Hull
stays 100/100. **The ` (seen 6x recently)` suffix is retained**, deliberately: this is the
exact collision V5's rules legislate for — an `ALERT:` band overriding a repeat marker —
and it has never once fired in production.

`status` line: `STATUS: fuel 6% (LOW), hull 100%, docked at first_step_memorial_station (First Step Memorial Station); ALERT: fuel low`

`narrative`: *"Another snapshot of your own ship, much like the last several. Hull is
untouched at 100 of 100. Fuel reads 6 of 100. You are docked where you were."*

**Ground truth: `accumulate` · weight 3–4 (band) · `interrupt` false · `drive` sustenance.**

A resource crisis is not made stale by repetition. `interrupt` is false: nothing is
attacking you, and a high weight does not imply an interrupt. Under `raw` the two decisive
characters sit thousands of characters into the payload, surrounded by zero-valued decoys
(`"damage_taken":0`, `"ships_lost":0`, `"in_combat":false`) — roughly 30 informative
characters in 10,000.

### E7 — `e7_hull_damage` · constructed · `full_state`, hull below max, no attacker present

E1's frame with `"hull":58` against `"max_hull":100`. Fuel stays 84/100. **The
` (seen Nx recently)` suffix is removed** — this frame differs from its predecessors.

`status` line: `STATUS: fuel 84%, hull 58% (LOW), docked at first_step_memorial_station (First Step Memorial Station); ALERT: hull low`

`narrative`: *"A snapshot of your own ship. Hull reads 58 of 100. Fuel is 84 of 100, the
hold is 30 of 50 full, and you are docked. Nothing is firing on you."*

**Ground truth: `accumulate` · weight 2–3 (band) · `interrupt` false · `drive` safety.**

The pair E5/E7 is the discrimination that matters most in the set: damage *being taken now*
versus damage *already sustained*. Same drive, opposite `interrupt`, opposite disposition.
A model with a stuck `interrupt` key in either direction fails one of them.

### E8 — `e8_rate_limit` · constructed · `api_error`, blocked from acting

```
type: api_error
{"type":"api_error","payload":{"status":429,"message":"rate limit exceeded","endpoint":"spacemolt.travel","retry_after_s":900,"tick":1408991}}
```

`status` line (authored): `STATUS: fuel 49%, hull 100%, docked at first_step_memorial_station (First Step Memorial Station); no alerts`

`narrative`: *"Your last command came back rejected: the travel endpoint is rate-limited,
status 429, and will not accept another call for 900 seconds."*

**Ground truth: `escalate` · weight 4 · `interrupt` false · `drive` sustenance.**

`drive` is `sustenance` because every version of the drive list places "quota, or API rate
budget" there explicitly, over the competing reading of `agency` ("being blocked"). This
makes E8's drive check partly a definition-reading item, which is why every prompt is
required to carry the drive enumeration.

The `status` rendering of E8 carries a deliberate trap: the STATUS line reads `no alerts`
while the event is a real block. V5 instructs the model to trust that clause. **"No alerts"
is not the same as "nothing happened"**, and this is the one item that makes the difference
observable.

### Ground-truth summary

| # | key | source | event | disposition | weight | interrupt | drive |
|---|---|---|---|---|---|---|---|
| E1 | `e1_repeat` | log | `full_state`, 6th repeat, hull 100 fuel 84 | discard | 0 | false | null |
| E2 | `e2_arrival` | log | `observation_update`, pilot Ornithopter5 arrives | accumulate | 1–2 | false | null |
| E3 | `e3_private_chat` | log | `chat_message`, private, by name, trade offer | accumulate | 3 | false | null |
| E4 | `e4_logged_in` | log | `logged_in`, reconnect, 5 unread private | accumulate | 1–2 | false | null |
| E5 | `e5_combat` | constructed | `combat`, weapons_fire, 32 damage, hull 68 | **escalate** | 4–5 | **true** | **safety** |
| E6 | `e6_fuel_crisis` | constructed | `full_state`, fuel 6/100, on a `(seen 6x)` repeat | accumulate | 3–4 | false | **sustenance** |
| E7 | `e7_hull_damage` | constructed | `full_state`, hull 58/100, no attacker | accumulate | 2–3 | false | **safety** |
| E8 | `e8_rate_limit` | constructed | `api_error` 429, travel blocked 900s | **escalate** | 4 | false | **sustenance** |

Constant-answer strategies are dead by construction: three dispositions all occur, weights
span 0 to 5, `interrupt` is true exactly once, and every drive value except `agency`
appears. `agency` is absent on purpose — no event in the set is an agency case, so a model
that reaches for it is wrong every time.

## Scoring

Every item is a `constraint`-scorer item carrying **exactly five mechanical checks plus one
calibration check**. Five mechanical checks give clean fifths — 0.0 / 0.2 / 0.4 / 0.6 / 0.8
/ 1.0 — which is what makes the self-score reproducible.

**Format-validity checks are near-worthless here and consume none of the five.** Format
compliance across the 422 real calls was 100%: every response parsed as JSON with all six
keys, and zero completions truncated. The failure is entirely semantic.

### The five

1. **`disposition` equals ground truth.**
2. **`weight` equals ground truth**, or falls in the row's stated band.
3. **`interrupt` equals ground truth.**
4. **`drive` equals ground truth.**
5. **`reason` grounding** — the reason must not assert content absent from the event.

Checks 1–4 are `regex` checks over the turn-1 output with a shared shape:

```
(?i)"disposition"\s*:\s*"?escalate"?
(?i)"weight"\s*:\s*"?[45]"?
(?i)"interrupt"\s*:\s*"?true"?
(?i)"drive"\s*:\s*"?safety"?
```

`regex` rather than `json_field_equals` for three reasons: it expresses a band in one
pattern; it tolerates a value emitted as a string (`"weight":"4"`, `"drive":"null"` — V5's
output block warns about exactly the last one, so it happens); and it is one mechanism
across all four fields. `json_field_equals` remains available and is exactly equivalent
where the value is scalar and strictly typed. The null-drive case is
`(?i)"drive"\s*:\s*"?null"?`, which accepts both the bare literal and the quoted string.

### Check 5 — reason grounding

Grounded in observed, mechanically detectable hallucinations:

- ~95 outputs claim `"successful API response"` / `"quota exceeded"` on `full_state`
  snapshots that contain neither string, every phrase lifted from V1's two worked examples.
- 39 outputs begin `"New station …"` on `observation_update` events about *pilots* — V2's
  `"New station Halcyon Ring in-system — novelty, worth noting."` example pattern-matched
  onto anything carrying a `poi_id`.
- `"Hull damage taken — safety, must react."` recurs verbatim on frames reading
  `"hull":100,"max_hull":100,"damage_taken":0`, and produced all three of the corpus's only
  escalations. It is verbatim the string V3 added as a **negative** example.

Check 5 is a single `regex` with a negative lookahead over a per-event forbidden-phrase
set, case-insensitive and dotall via the leading inline flag group that
`translateInlineFlags` (`src/scoring/regex-flags.ts`) supports:

```
(?is)^(?!.*(successful API response|quota|rate.?limit|new station|hull damage|damage taken|under attack|deceased)).*$
```

The set is derived per event, not shared: E5's set forbids the *denials*
(`no (threat|damage|attack)`, `not (attacking|under fire)`), E8's forbids `new station` and
`hull damage` but obviously not `rate limit`, E6's forbids `hull damage` but not `fuel`.

**Bias is toward false-negative minimization.** A check that misses a correct answer
corrupts the comparison across prompts and renderings worse than one that is slightly
generous: a generous check inflates all fifteen cells of an event roughly equally and
leaves the comparison intact, while a brittle one fires unevenly on wording that varies by
model and by rendering — precisely what the axes exist to surface. Where the two error
types trade off, take the false positive. Every forbidden phrase must be an assertion the
event unambiguously does not support; a phrase that a correct answer could plausibly
contain does not belong in the set.

Check 5 is deliberately negative only. Requiring the reason to *name* a specific fact would
have to be authored per rendering — the narrative form has no `poi_id` and no integers to
quote — and the axis would then measure the check rather than the model.

## The second turn — self-scoring

**Every item runs two conversational turns.**

- **Turn 1** is the classification, uncontaminated.
- **Turn 2** replays the model's own turn-1 output as an assistant message and asks it to
  reproduce the score the automated check will produce, with the judging criteria stated
  explicitly enough to make that possible.

The split is what preserves turn 1. Asking for a self-check inside turn 1 is itself a
reflection prompt: it would improve turn-1 performance and blunt the example-echo trap the
prompt axis exists to measure.

Turn 2's verdict is compared against the mechanical fraction by a `self_score_matches`
check. Matching is exact; a deviation fails. The check's `extract` is
`(?i)SELF_SCORE:\s*([0-9.]+)`.

**The turn-2 prompt requests a plain decimal — `SELF_SCORE: 0.6` — never a fraction, never
a percentage.** The six legal values are 0.0, 0.2, 0.4, 0.6, 0.8, 1.0, and the prompt lists
them. It also states, per item, what each of the five checks looks for, in the item's own
terms: which disposition, which weight or band, which `interrupt`, which `drive`, and that
the reason must not assert anything the event does not contain. If the model cannot tell
what is being checked, the item measures guesswork and the calibration check then fails
items for the wrong reason.

**This rewards honest failure over confident failure.** The calibration result is a check
rather than a gate: a model that fails mechanically and correctly reports that it failed
loses the mechanical checks but earns the calibration one, scoring above a model that fails
and reports success. Gating the item on both collapses those two cases to zero and destroys
exactly the signal the second turn exists to capture. The consequences follow from the
existing scorer without further work: a miscalibrated item never reaches 1.0, and
`aggregate` in `src/orchestration/run-challenge.ts` counts only items at `score === 1` as
passing, so a deviation fails at the attempt level too.

The denominator the self-score is compared against **excludes the calibration check
itself** — it is the fraction of the five mechanical checks that passed. The item's own
score is `passed / 6` over all six checks.

## P1 — harness

P1 is already specified and planned in
[`docs/superpowers/plans/2026-07-22-p1-harness-multiturn-calibration.md`](../plans/2026-07-22-p1-harness-multiturn-calibration.md),
which remains the authority on every step. Three changes; nothing else in the harness moves.
The axes ride in item names, so there is no report-contract grain change and no aggregation
work.

- **Multi-turn** via an **additive** optional `priorTurns` on `CompletionParams`
  (`readonly priorTurns?: ReadonlyArray<{ role: "assistant" | "user"; content: string }>`).
  `buildBody` becomes `[system, {user: userPrompt}, ...priorTurns]`. Reshaping to a
  `messages` array is rejected: it buys nothing the optional field does not and breaks
  every site naming the current scalar fields.
- **Turn 2 is issued from `executeOrCacheItem`** in `src/orchestration/run-challenge.ts` as
  a second `runPrompt` call, merged into `ItemResult` there — never onto `ExecutionResult`,
  which is decoded against legacy archives.
- **A nested optional `followUp` struct on `ItemResult`**, carrying the turn-2 output,
  reasoning, raw output, error and counters. This matches the file's own idiom (`scorerHash`
  and `breakdown` are both post-hoc optionals) and every existing `att-*.jsonl` decodes
  unchanged.
- **No `schemaVersion` bump.** Three consumers compare with exact equality and each fails
  silently on an unexpected version; house precedent is optional fields with no bump.
- **A cache turn-mode discriminator.** A cached row is reusable only when its turn mode
  matches the mode the item is being executed under, and the discriminator participates in
  the lookup rather than filtering the returned row. Without it a turn-1-only cached row
  returns forever with no `followUp`, producing a silently mixed archive.
- **Turn-1 metrics stay definitionally turn-1.** `generationTokens` / `wallTimeSec` /
  `generationTps` on `ItemResult` cover turn 1 only; turn-2 counters live inside `followUp`
  and never join the per-attempt aggregates, which feed the webapp's efficiency figure and
  scatter-plot X axis. `generationTps` is a rate and is never summed.
- **The `self_score_matches` check kind** in `src/schema/constraints.ts`, evaluated in
  `src/scoring/constraint-checks.ts` alongside the existing twenty. It is unlike its
  siblings in two respects, and both are the plumbing this change adds: it reads turn-2
  text, and it reads the other checks' results, so it **evaluates last** with a denominator
  that excludes itself. No new scorer type.
- **`extract` is compiled through `translateInlineFlags`** at load time and at scoring
  time. A bare `new RegExp` cannot compile the mandated leading `(?i)` form, and the
  resulting uniform failure would read as a finding rather than a bug.
- **The self-score is surfaced in the existing per-item drilldown**, following the exact
  path `breakdown` took in commit `11721f1`: computed during scoring, threaded onto
  `ItemResult`, emitted into the per-item payload in `src/report/write-details.ts`, consumed
  by `AttemptDetailItem` in `webapp/src/lib/use-attempt-detail.ts`, rendered in the
  drilldown UI. This is the only webapp surface touched.

## Prior art — what the logs establish

All of the following is the problem being solved. **None of it is behaviour to reproduce.**

Appraisal lives in `kind:"exchange"` records with `channel:"cortex"`, `step:"observe"`,
`meta.tier:"hindbrain"`, `meta.model:"mlx-community/Qwen3.5-2B-4bit"` — 422 records, the
only LLM step doing significance appraisal.

**The classifier never escalates.** Across 422 model calls: `escalate` emitted **0 times**,
`interrupt:true` emitted **0 times**. 77.5% of outputs are the single tuple
`discard · 0 · false · null`. Weights: 0 → 328, 1 → 7, 2 → 71, 3 → 11, 4 → 4, **5 → 0**.
Drives: null → 402, safety → 14, sustenance → 6, agency → 0. Two outputs are
self-contradictory (`accumulate` at `weight:0`). The prompt's own claim that 4–5 should be
"rare" is satisfied by never being produced.

**The model is barely consulted.** Of 1,590 appraisal decisions, **95.5% never invoked the
model at all.** A content-blind dedup fast-path handled 78.7% (1,252, reason
`duplicate of recent event (Nx)`); an "inert event" fast-path handled a further 50 and
silently killed 2 of the corpus's 3 `chat_message` events plus the only `crafting_update` —
despite every prompt version stating `A chat is ALWAYS kept.` The instruction is
unenforceable from where it sits. A third gate, a post-hoc control-plane clamp, rewrites the
model's answer after the fact
(`appraisal clamped: control-plane event (was w=4/accumulate/int=false, …)`).

**Worked examples are the dominant failure cause.** Three specific instances:

1. V1's only two examples describe an `api_error 429 quota exceeded` and a chat from an
   `"ally"`. **Neither event type exists in this system.** ~95 of 307 V1 outputs (31%)
   contain "successful API response", "quota exceeded", "market transaction" or "friendly
   chat message from an ally" — on `full_state` snapshots.
2. V2's `observation_update` example ends
   `"New station Halcyon Ring in-system — novelty, worth noting."`. 39 outputs then begin
   `"New station …"`, every one of them on an event about *pilots*.
3. V3 added `- Bad: "Hull damage taken — safety, must react."` as an explicit negative
   example. The string was subsequently emitted **8 more times**, including all three of
   the corpus's only escalations, on frames reading `"hull":100,"max_hull":100`. Adding it
   as a negative example made the model emit it more. A 2B model does not reliably carry
   polarity across a `- Bad:` prefix; every literal string in the prompt is a candidate
   output.

**Signal-to-noise.** `full_state` and `logged_in` blocks run 5,000–13,800 chars, and the
decision-relevant content is roughly **30 informative characters in 10,000** —
`"fuel":N`, `"hull":N`, `current_poi` — buried thousands of characters behind zero-valued
decoys (`"damage_taken":0`, `"ships_lost":0`, `"deaths_by_pirate":0`, `"in_combat":false`).
The `(seen Nx recently)` marker the prompt tells the model to key on is appended at the very
end, after the whole payload.

**The prompt grew by accretion**, 3,255 chars (V1) to 12,951 (V5), each version patching
observed failure text rather than the mechanism. V2's `## reason` "Bad" list literally
names the two phrases V1's output stream was dominated by. V5 forbids the words *attack,
threat, hostile, danger, damage, weapons, station* in a reason, and mandates that an
`observation_update` reason read `Pilots from <clan names> nearby.` and stop — which
hard-codes a blind spot into the only channel through which a hostile ship can arrive, and
produced degenerate outputs like `"Pilots from various factions nearby."` V3–V5 also state
a distribution prior on the *answer*, before the evidence, and only in the dismissal
direction: *"most of what arrives is repeats and unchanged frames → mostly discards"*, with
no counterweight for a model that discards everything.

## Interpretation caveats

- **`v5_verbatim` has a free pass on E5 and E8.** Its eight worked examples include
  `combat`/`weapons_fire` → escalate · safety · 5 · interrupt true, and `api_error 429` →
  escalate · sustenance · 4 · interrupt false — the exact answers to those two rows. The
  rebuilt example pool contains no escalation at all. A `v5_verbatim` win on E5/E8 must be
  read as example recall, not judgment; the comparison that carries information there is
  between the four non-V5 prompts.
- **`combat` and `api_error` are not real wire types.** The two rows that exercise the
  highest-stakes branches use type names that have never appeared on the wire, because the
  branches themselves have never appeared either. This is a property of the problem, not of
  the eval, and it is the strongest argument for constructing rather than replaying.
- **Each item runs once.** No repeats, no seeds, no variance recording. Every result is a
  directional reading: the operator reads scores in the webapp, revises the prompt, and
  re-runs.

## Out of scope

- Model lineup and hosted runtimes.
- Repeats, repeat seeds, variance recording.
- An LLM-judge scorer, and new scorer types generally. Everything is scored by the existing
  `constraint` scorer; `self_score_matches` is a check kind within it.
- **Analysis tooling of any kind.** No script that reads the archive to compute aggregates,
  no comparison grid, no new reporting surface. The operator is the analysis layer.
- The `data.js` contract, `WebappRecord`, `webapp/src/lib/pipeline.ts`,
  `webapp/src/lib/coverage.ts`. The per-attempt grain does not change. The one webapp
  surface in scope is the per-item drilldown.
- **The dismissal-prior lever** — a sixth prompt differing only in whether it states
  "most events are noise". Considered and deliberately excluded from v1: it would add 24
  items to isolate one sentence, and its effect is already visible in the contrast between
  `min_none` (no prior) and the three V-derived prompts (prior stated).
- System prompts. An LLM-config concern owned by `configs.yaml` → `system-prompts.yaml`,
  never inlined into a challenge.

## Review gates

- **R1** — This spec approved.
- **R2** — **The ground-truth table approved.** The operator's most important gate: eight
  rows, four fields each, two of them banded. Everything the eval reports is a mechanical
  consequence of these rows.
- **R3** — P1 merged, and every existing archive still loads.
- **R4** — One event rendered all 15 prompt/rendering ways, read by the operator. The
  renderings carry half the point of the set; if `narrative` leaks a fact that `raw` buries,
  the axis is measuring our prose.
- **R5** — Checks validated against hand-labelled model outputs. Skip this and the set
  measures its own regexes — in particular the forbidden-phrase sets, which are the only
  checks that can fail a correct answer.
- **R6** — Full run, read in the webapp.
