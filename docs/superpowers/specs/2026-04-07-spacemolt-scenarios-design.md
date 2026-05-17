# SpaceMolt Scenarios in testbench/llms

**Status:** Approved design, pre-implementation
**Date:** 2026-04-07

## Goal

Extend testbench/llms (Python, currently single-turn prompt benchmark for local LLMs via llama.cpp) to run SpaceMolt game scenarios end-to-end: spawn the gameserver, seed it to a known state, drive it with a local LLM, enforce world-level cutoffs, and score the result with the existing reporting pipeline.

## Approach

Per-scenario, testbench spawns two subprocesses: the Go SpaceMolt gameserver (`~/workspace/sm-plans`) and the TypeScript `commander` agent loop (`~/workspace/commander`). Commander's pi-ai model resolver is configured via env vars to point at testbench's existing llama.cpp HTTP server on port 18080 (OpenAI-compatible endpoint). Testbench reads commander's JSONL event stream from stdout, enforces cutoffs, and on termination scores the run using a Python port of smbench's scenario scorers.

Rejected alternatives:
- **Port commander's loop to Python** — load-bearing piece, already works in TS, rewrite is the riskiest part with the least payoff.
- **Declarative goal predicates** — would require a predicate language and a generic world-state read API. Parallel project; out of scope.
- **Parameterized world state from YAML** — would require extending the gameserver's reset endpoint (Go, lives in another repo). Fixture-by-name is sufficient for the first cut.

## New Components

### `game_runner.py` (new)

Owns one game session end-to-end. Responsibilities:

- **Gameserver lifecycle** — port of smbench's `server-lifecycle.ts:71-118`. Spawn, health-poll, SIGTERM → SIGKILL cleanup.
- **Admin HTTP client** — port of smbench's `admin-client.ts:9-43`. Methods: `reset(fixture_name)`, `get_player_stats()`, `get_event_log()`. Bearer token auth.
- **Commander subprocess management** — `bun run` from a configurable path. Env vars wire pi-ai's local provider to `http://localhost:18080/v1` and select the active testbench model.
- **Event stream reader** — line-buffered stdin reader, parses JSONL events (`tool_call`, `tool_error`, `turn_end`, etc.) into Python dicts.
- **Cutoff watchdog** — trips on first of: wall-clock seconds, total tokens (summed from `turn_end` events), or `tool_call` event count. Sends SIGTERM to commander, records `termination_reason`.
- **Returns `GameSessionResult`** — events list, final player stats, final event log, termination reason, durations, token totals, tool-call count.

Port allocation: each session gets a random high port to avoid collisions across parallel runs; passed to both subprocesses via env.

### `prompts/scenarios/*.yaml` (new directory and schema)

```yaml
name: bootstrap_grind
fixture: s1-bootstrap-grind        # passed to gameserver /admin/benchmark/reset
players:
  - id: alice
    controlled_by: llm             # only one llm player supported in first cut
scorer: bootstrap_grind            # name → game_scorers registry entry
scorer_params:
  target_credits: 1000
cutoffs:
  wall_clock_sec: 600
  total_tokens: 100000
  tool_calls: 200
commander:
  max_turns: 250                   # commander's own guard rail; looser than tool_calls
```

### `common.py` extension

New `Scenario` dataclass and YAML loader, parallel to the existing prompt loader at `common.py:355-379`. Loaded from `prompts/scenarios/`.

### `game_scorers.py` (new)

Registry mapping scorer name → function `(GameSessionResult, params) -> (score: float, details: dict)`. Initial entries ported 1:1 from smbench's `scorer.ts:18-99`:

- `bootstrap_grind` (s1)
- `navigation` (s2)
- additional smbench scenarios as they exist

Each scorer is a pure function over `GameSessionResult` — no I/O, no gameserver calls.

### `runner.py` extension

- New branch in `score_result()` (currently `runner.py:124`) for `scorer_type: game` that dispatches to `game_scorers`.
- New `run_game_scenario(model, runtime, scenario) -> BenchmarkResult` parallel to `run_llamacpp_prompt`. Owns the `GameRunner` lifecycle for one scenario × model run.

### `benchmark.py` extension

Main loop iterates scenarios alongside prompts. New `--scenarios` filter mirrors existing `--category` / `--tier` filters. Same outer model/runtime loops; same cache-or-execute pattern at `benchmark.py:262-266`.

### `BenchmarkResult` extension (`common.py:402-423`)

New optional fields:
- `scenario_name: str | None`
- `termination_reason: str | None` — `completed` | `wall_clock` | `tokens` | `tool_calls` | `error`
- `tool_call_count: int | None`
- `final_state_summary: dict | None`

Existing `score_details` field already accommodates per-scorer breakdown.

## Data Flow (per scenario × model run)

```
testbench: allocate port; start gameserver subprocess; health-check
testbench: admin POST /benchmark/reset { fixture: <name> }
testbench: spawn commander subprocess
           env: MODEL_URL=http://localhost:18080/v1, MODEL_NAME=<testbench model>,
                SCENARIO=<path>, GAMESERVER_URL=<port>
loop:
    read JSONL event from commander.stdout
    append to event log; update token + tool_call counters
    if any cutoff hit → SIGTERM commander; record termination_reason
    if commander exits cleanly → break with reason=completed
testbench: admin GET /player-stats, /event-log → final state snapshot
testbench: dispatch to game_scorers[scenario.scorer](result, scenario.scorer_params)
testbench: write BenchmarkResult to benchmark-execution/{model}__{runtime}.jsonl
testbench: tear down commander + gameserver (SIGTERM → SIGKILL)
```

## Cutoff Enforcement

Testbench is authoritative — these are world limits, not guard rails. Commander's own `max_turns` etc. stay configured but looser, as a defensive backstop. Cutoff types:

- **wall_clock_sec** — measured by testbench from commander spawn
- **total_tokens** — summed from `turn_end` event token fields
- **tool_calls** — counted from `tool_call` events in the stream

First cutoff to trip wins; its name is recorded as `termination_reason`.

## Caching

Same hash-key strategy as today (`common.py:447-508`), extended with `scenario_name`. A cached run skips the entire subprocess dance.

## Configuration

New `[paths]` section in testbench config:
- `commander_dir` — defaults to `~/workspace/commander`
- `gameserver_binary` — defaults to built binary in `~/workspace/sm-plans`

Both overridable for CI / alternate checkouts.

## Out of Scope (first cut)

- Multi-LLM scenarios (only one `controlled_by: llm` player)
- Declarative goal predicates — named Python scorers only
- Parameterized fixtures beyond name — no novel world states from YAML
- MLX runtime for game scenarios — llama.cpp only (commander speaks OpenAI-compatible HTTP)
- Parallel scenario execution within one benchmark run — sequential first; port-allocation design leaves room for parallelism later

## Open Items Resolved by Assumption

- Commander invocation: `bun run` from configurable directory
- Gameserver invocation: built binary at configurable path
- pi-ai local provider selection: use the existing OpenAI-compatible / Ollama-style provider with `baseUrl` override; exact provider name to be confirmed during implementation by reading `commander/src/model.ts:45-110`

## File Touch List

| File | Change |
|---|---|
| `game_runner.py` | new — gameserver + commander lifecycle, event stream, cutoffs |
| `game_scorers.py` | new — Python ports of smbench scorers |
| `prompts/scenarios/*.yaml` | new directory; one file per scenario |
| `common.py` | add `Scenario` dataclass + loader; extend `BenchmarkResult` |
| `runner.py` | add `game` scorer branch + `run_game_scenario` |
| `benchmark.py` | add scenario iteration to main loop; `--scenarios` filter |
| testbench config | add `[paths]` section |
