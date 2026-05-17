# Spacemolt Scenarios: Design and Intent

This benchmark tests LLMs along two complementary axes. **Prompts** measure single-turn capability — can the model produce a correct answer to a well-formed question? **Scenarios** measure something different: agentic behavior. Given a goal, a set of tools, and an open-ended environment, what does the model actually do?

This document describes the intent behind how spacemolt scenarios are shaped today. It is not a how-to guide for adding a new scenario; for that, read the YAML schema in `src/schema/scenario.ts` and the corpus loader in `src/config/scenario-corpus.ts`.

## What scenarios test that prompts can't

A prompt scorer can verify *correctness* — exact match, constraint satisfaction, code that passes a test. It cannot verify *judgment* under uncertainty. A model that can complete a four-step recipe doesn't tell us whether it can recover from a tool error, prioritize between competing goals, or stop and reassess when a strategy isn't working. Those behaviors only emerge over many turns in an environment that doesn't tell the model what to do next.

Spacemolt scenarios put the model into exactly that environment: a game server with a dozen tools (navigation, mining, market, missions, combat) and an objective that requires composing them. Every interaction generates an `AgentEvent` — tool calls, results, errors, turn boundaries, and the model's own reasoning text. Those events become the diagnostic record.

## The tier ladder

Scenarios are grouped into three tiers. The tiers measure *concept difficulty* — what kind of agentic behavior is being exercised — not *LLM difficulty*. A tier-1 scenario might be harder for some models than tier 3 if their tool-calling is brittle; a tier-3 sandbox might be trivially "won" by a model that converges on a single high-yield strategy. We use the tiers to map capability frontiers, not to rank models.

- **Tier 1: dock/undock.** Can the model issue and complete the most basic spatial action? Today this is exercised by `dock_and_sell`, which is broader than strict dock/undock — it also covers a basic mine-and-sell loop — but the spine is tier-1 behavior.
- **Tier 2: accept → travel → complete → return.** Can the model carry out a multi-step quest loop with a defined success condition? Today this is `accept_complete_mission`.
- **Tier 3: freeform sandbox.** Given only a goal, can the model construct its own strategy? Today this is `sandbox`.

The two tier-1/tier-2 scenarios are kept as **smoke tests** for the harness itself. Their purpose is to verify that the SSE plumbing, watchdog, and scoring pipeline behave deterministically against simple, scripted gameplay. They are not the interesting ground.

## The freeform sandbox

The interesting ground is tier 3. The sandbox scenario gives the model a single paragraph of orientation — "you are an admiral, maximize your score before your token budget runs out, the galaxy has missions and markets and pirates, how you spend your time is up to you" — and then steps back. There is no recipe to follow, no rubric to optimize against beyond a single number returned by the game server.

Three design choices make this work:

**1. Token budget, not turn count or wall clock.** Different models burn tokens at very different rates. A turn-count budget penalizes models that prefer compact reasoning; a wall-clock budget penalizes slower runtimes. A token budget normalizes the *amount of cognitive work* the model is allowed to perform, regardless of how many turns or seconds that takes. We set the budget at 500 000 tokens — enough for substantial strategy and recovery, capped before any single run becomes prohibitively expensive. Tool-call and wall-clock cutoffs exist as runaway-loop backstops; expected exit is on tokens.

**2. The score comes from the game server, not the harness.** The game server already computes a canonical score for each player (a function of credits, kills, missions completed, exploration, and so on, weighted in ways that are deliberately opaque to the agent). We read that number once, post-termination, via `/api/admin/benchmark/player-stats` and use it directly as the scenario's value. No client-side normalization, no `[0, 1]` coercion, no rubric inferring intent from telemetry. The server is the source of truth, and the scoring field is configurable per scenario YAML so future variants can target `leaderboard_rank` or any other gameserver-computed value.

**3. Pass-rate is not a scenario concept.** A prompt either matches its expected answer or it doesn't — `score === 1` means pass. A scenario produces a raw integer with no upper bound. There is no meaningful threshold for "passing" a sandbox run; what matters is the distribution of values across models and runs. The webapp shows scenario scores as raw numbers; pass-rate columns are prompt-only.

## Scoring along the prompt/scenario seam

This split is reflected in the type system. `Score` was originally a single shape — `{ score: number ∈ [0, 1], details, breakdown? }` — shared by both lanes. That shape lied for scenarios: their score isn't `[0, 1]`-bounded, and the rubric metadata that prompts carry (constraint breakdowns, exact-match diffs) is meaningless for an agent run.

The current shape is a discriminated union: `PromptScore | ScenarioScore`. Prompts keep their `[0, 1]` semantics. Scenarios carry a raw `value: number` and a `scoreField: string` recording which key on the gameserver response was read (default `"score"`, but configurable per scenario YAML). Downstream — `aggregate.ts`, the webapp record builder — the same union flows through, narrowing on `kind` at consumer sites that care.

The benefit is honesty. A prompt scorer cannot accidentally produce a scenario-shaped result; a scenario scorer cannot pretend to a `[0, 1]` rubric it doesn't have. Pass-rate aggregations enforce `kind === "prompt"` at the type level. When we add new scenario scoring fields (a leaderboard rank tracker, say, or a survival timer) the union absorbs them without disturbing prompt scoring.

## Why we capture everything the model emits

Freeform play makes diagnostic capture non-negotiable. When a scripted scenario fails, the failure mode is usually visible in the tool trace ("model called `accept_mission` but didn't follow up with `complete_mission`"). When a sandbox scenario produces a low score, the trace alone isn't enough. *Why* did the model spend 200 000 tokens mining iron ore when a single combat mission would have returned more credits? The answer is in the model's reasoning between tool calls, and that text was — until very recently — silently discarded by the Admiral SSE filter.

The current archive captures every `AgentEvent` in order:

- `tool_call` events with full arguments
- `tool_result` and `tool_error` events with full payloads
- `turn_end` events with cumulative token totals *and* the full `llm_call` detail body
- `llm_thought` events preserving the model's reasoning text
- `error` and `connection` events for SSE-level diagnostics

Plus the post-termination `finalPlayerStats` snapshot from the game server. Together, the archive is meant to answer "what did the model see, what did it think, what did it do, and what did it end up with" — for any run, after the fact, without re-running. That property is what makes a freeform scenario a useful diagnostic instrument instead of a black box.

## What this design is not

It is not an attempt to define an objective ranking of "agent quality." Two models with identical sandbox scores may have arrived there by completely different routes; one strategy may be more robust than the other against perturbations the gameserver hasn't yet introduced. The score is a single signal, useful in aggregate; the trace is what makes individual runs interpretable.

It is also not a closed system. The tiers will grow. New scenarios at the existing tiers will exercise dimensions the current scripted smoke tests don't cover — error recovery, tool composition under partial information, multi-agent interactions if the gameserver gains support for them. The freeform sandbox itself will likely spawn variants that target different `scoreField` values to surface different optimization pressures. The shape of the system — typed score union, gameserver-as-truth, full diagnostic capture — is meant to absorb that growth without rework.
