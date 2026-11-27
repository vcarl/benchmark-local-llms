# Effect-TS Rewrite: Requirements Specification

This document specifies the requirements for a ground-up rewrite of the LLM benchmarking system in TypeScript + Effect-TS. It is informed by the existing Python prototype but is not a 1:1 mapping — it incorporates the archival RunManifest design, fixes known architectural gaps, and leverages Effect's type system to eliminate error classes that the prototype silently swallows.

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Data Model](#2-data-model)
3. [Error Model](#3-error-model)
4. [Scoring Engine](#4-scoring-engine)
5. [Orchestration](#5-orchestration)
6. [JSONL I/O and Archival](#6-jsonl-io-and-archival)
7. [Report Generation](#7-report-generation)
8. [CLI Interface](#8-cli-interface)
9. [Python Interop](#9-python-interop)
10. [Webapp Data Contract](#10-webapp-data-contract)
11. [Migration](#11-migration)
12. [Testing Strategy](#12-testing-strategy)

---

## 1. Design Principles

### 1.1 Effect-TS Idioms

- **Typed error channels everywhere.** Every operation that can fail must declare its failure types in the `E` parameter of `Effect<A, E, R>`. No `try/catch` with `unknown`. No error strings where structured types belong.
- **Resource safety via `Scope`.** Every acquired resource (server process, file handle, HTTP connection, SSE stream) must be managed by `Effect.acquireRelease` or equivalent, guaranteeing cleanup on success, failure, and interruption.
- **`@effect/schema` at every boundary.** Data entering the system (YAML files, JSONL records, HTTP responses, SSE events, subprocess output) must pass through Schema decode. Data leaving the system (JSONL writes, data.js output) must pass through Schema encode.
- **`Stream` for event-driven flows.** SSE consumption, the prompt execution loop, and the orchestration pipeline are all streams, enabling backpressure, timeout, and interruption without the readline-blocks-forever class of bugs.
- **`Layer` for dependency injection.** Runtime-specific backends (llamacpp vs MLX), filesystem access, and subprocess spawning are provided as Layer services, enabling testing with mock layers.

### 1.2 Architectural Departures from Python Prototype

| Python Prototype | Effect-TS Rewrite |
|---|---|
| Flat `BenchmarkResult` dataclass, latest-wins overwrite | Immutable `RunManifest` per execution session with embedded prompt corpus |
| No timestamps, no run identity | Every result has `executedAt`, every run has `runId` + `startedAt`/`finishedAt` |
| Game events serialized to JSONL but lost on reload | Events retained on load; game scores recomputable from archive |
| `readline()` blocks forever on SSE | `Stream` with configurable idle timeout; wall-clock cutoff enforced by `Fiber` racing |
| Errors silently swallowed (SSE close = "completed", constraint exceptions = failed) | Every error path produces a typed error or an explicit `Option.none` |
| Scorer config is live closures (not serializable) | Scorer config is pure data (serializable Schema); evaluation is a separate function |
| System prompt key silently falls through to literal string | Unknown system prompt key is a `ConfigError` |
| Two distinct MLX modes (subprocess for prompts, HTTP server for games) | Single HTTP server mode for both; subprocess protocol eliminated |
| Runtime is a primary grouping axis (file naming, orchestration, webapp) | Runtime is metadata on a result, not a structural axis |
| Model config bundles multiple runtimes per logical model | Each model config entry is one artifact + one runtime; metadata derived from artifact |
| Prompt files are flat lists with many variants per file | One file per prompt variant; `style` dropped as a configured field |
| `--quick` and `--prompt` CLI flags for filtering | Removed; always run the full suite |
| Hardcoded Python dicts for models and system prompts | YAML config files for both |
| `code_exec` test code inline in prompt YAML | Companion `.test.py` file alongside prompt YAML |
| Hardcoded temperature (0.7) | Configurable temperature range; each temperature is a separate execution |
| Scenario markdown in external repo (`~/workspace/smbench/`) | Scenario markdown co-located with scenario YAML in the project |

### 1.3 Scope Boundaries

- **One-time migration only.** A migration tool converts existing Python prototype JSONL into the new archive format. After migration, the old format is not read or written. No ongoing backward compatibility, no deprecated fields, no dual-write.
- **Multi-user / distributed execution.** Out of scope. Single operator, single machine, sequential model runs.
- **Real-time dashboard.** Out of scope. The webapp remains a static report generated after runs complete.

---

## 2. Data Model

All types defined as `@effect/schema` Schemas, serving as both TypeScript types and runtime validators.

### 2.1 Enums (Tagged Literals)

```
Runtime        = "llamacpp" | "mlx"

ScorerType     = "exact_match" | "constraint" | "code_exec" | "game"

TerminationReason = "completed" | "wall_clock" | "tokens" | "tool_calls" | "error"

AgentEventType = "tool_call" | "tool_result" | "tool_error" | "turn_end" | "error" | "connection"

ConstraintCheck = "contains" | "contains_exact" | "not_contains_char" | "min_length"
                 | "regex" | "regex_count_min" | "valid_json" | "json_has_keys"
                 | "json_all_string_values" | "json_nested_is_object" | "json_nested_has_key"
                 | "json_field_equals" | "json_field_is_list" | "json_list_item_has"
                 | "numbered_lines" | "no_numbered_line" | "numbered_line_exists"
                 | "line_count" | "word_count_exact" | "all_lines_word_count"
```

Note: `PromptStyle` and `SizeClass` enums are removed. Style is not a configured field — it was
a cosmetic label in the Python prototype. If prompt variants exist, the variant identity is part of
the prompt name. Model size class is derived from the artifact metadata, not configured.

### 2.2 Prompt Corpus Types

These represent the **frozen** prompt configuration at execution time, embedded in the RunManifest.

#### SystemPrompt

A named system prompt. Defined in `prompts/system-prompts.yaml` alongside the prompt files.
The key-to-text resolution happens at load time; the corpus stores both.

```yaml
# prompts/system-prompts.yaml
direct: "You are a helpful assistant. Be concise. Answer with just the answer unless told otherwise."
cot: "You are a helpful assistant. Think step by step..."
code_direct: "You are a Python code generator. Output ONLY the function..."
# etc.
```

```
SystemPrompt {
  key: string          // e.g. "cot", "code_direct"
  text: string         // the full system prompt text
}
```

#### ScorerConfig (Discriminated Union)

The scorer configuration is pure data — no closures. Each variant carries its own config shape.

```
ExactMatchConfig {
  type: "exact_match"
  expected: string
  extract: string      // regex pattern with capture group
}

ConstraintConfig {
  type: "constraint"
  constraints: ConstraintDef[]
}

CodeExecConfig {
  type: "code_exec"
  testCode: string     // Python assertion code (resolved from companion .test.py file at load time)
}

GameScorerConfig {
  type: "game"
  gameScorer: string   // key into game scorer registry
  scorerParams: Record<string, unknown>
}

ScorerConfig = ExactMatchConfig | ConstraintConfig | CodeExecConfig | GameScorerConfig
```

#### ConstraintDef (Discriminated Union)

Each constraint check type is a distinct variant. This replaces the Python approach of passing raw dicts to `evaluate_constraint()`.

```
ContainsConstraint        { check: "contains", name: string, value: string }
ContainsExactConstraint   { check: "contains_exact", name: string, value: string }
NotContainsCharConstraint { check: "not_contains_char", name: string, char: string }
MinLengthConstraint       { check: "min_length", name: string, length: number }
RegexConstraint           { check: "regex", name: string, pattern: string, dotall?: boolean }
RegexCountMinConstraint   { check: "regex_count_min", name: string, pattern: string, min: number }
ValidJsonConstraint       { check: "valid_json", name: string }
JsonHasKeysConstraint     { check: "json_has_keys", name: string, keys: string[] }
JsonAllStringValuesConstraint { check: "json_all_string_values", name: string }
JsonNestedIsObjectConstraint  { check: "json_nested_is_object", name: string, key: string }
JsonNestedHasKeyConstraint    { check: "json_nested_has_key", name: string, parent: string, key: string }
JsonFieldEqualsConstraint     { check: "json_field_equals", name: string, key: string, value: Schema.JsonValue }
JsonFieldIsListConstraint     { check: "json_field_is_list", name: string, key: string }
JsonListItemHasConstraint     { check: "json_list_item_has", name: string, listKey: string, matchField: string, matchValue: Schema.JsonValue, checkField: string, checkValue: Schema.JsonValue }
NumberedLinesConstraint       { check: "numbered_lines", name: string, from: number, to: number }
NoNumberedLineConstraint      { check: "no_numbered_line", name: string, line: number }
NumberedLineExistsConstraint  { check: "numbered_line_exists", name: string, line: number }
LineCountConstraint           { check: "line_count", name: string, count: number }
WordCountExactConstraint      { check: "word_count_exact", name: string, word: string, count: number }
AllLinesWordCountConstraint   { check: "all_lines_word_count", name: string, min: number, max: number }

ConstraintDef = ContainsConstraint | ContainsExactConstraint | ... (union of all above)
```

#### PromptCorpusEntry

A single prompt definition, frozen at execution time. Contains everything needed to re-score.

```
PromptCorpusEntry {
  name: string                // unique prompt identity, e.g. "math_multiply_cot"
  category: string            // e.g. "code", "math", "constraint"
  tier: number                // 1, 2, or 3
  system: SystemPrompt        // resolved key + full text
  promptText: string          // the user message sent to the model
  scorer: ScorerConfig        // full scorer configuration as data
  promptHash: string          // SHA-256[:12] of promptText + system.text
}
```

The prompt `name` is the sole identity. There is no computed `_key` combining name+tier+style —
if a prompt has variants (e.g. chain-of-thought vs direct), each variant is a separate prompt
with a distinct name (e.g. `math_multiply_direct`, `math_multiply_cot`).

#### Prompt File Format

Each prompt is a single YAML file. The filename is `{name}.yaml` — name only, no tier or
category embedded. All metadata lives inside the file:

```yaml
# prompts/math_multiply_cot.yaml
name: math_multiply_cot
category: math
tier: 2
system: cot
prompt: "What is 47 * 89? Think step by step."
scorer: exact_match
expected: "4183"
extract: 'ANSWER:\s*(\d[\d,]*)'
```

For `code_exec` prompts, test code lives in a companion file:

```yaml
# prompts/code_is_palindrome.yaml
name: code_is_palindrome
category: code
tier: 1
system: code_direct
prompt: "Write a Python function `is_palindrome(s: str) -> bool`..."
scorer: code_exec
testFile: code_is_palindrome.test.py   # resolved relative to prompts/ directory
```

```python
# prompts/code_is_palindrome.test.py
assert is_palindrome("racecar") == True
assert is_palindrome("hello") == False
assert is_palindrome("A man a plan a canal Panama") == True
```

The `testFile` field replaces inline `testCode`. At load time, the file contents are read
and stored as `testCode` in the `CodeExecConfig`. The corpus snapshot embeds the resolved
test code text, not the filename.

#### ScenarioCorpusEntry

A frozen scenario definition.

```
ScenarioCorpusEntry {
  name: string
  fixture: string
  players: PlayerDef[]
  scorer: string              // game scorer registry key
  scorerParams: Record<string, unknown>
  cutoffs: CutoffConfig
  tier: number
  scenarioMd: string          // the directive markdown content (resolved from local file)
  scenarioHash: string        // SHA-256[:12] of fixture+scorer+params+players+cutoffs
}

PlayerDef {
  id: string
  controlledBy: "llm" | "npc"
}

CutoffConfig {
  wallClockSec: number
  totalTokens: number
  toolCalls: number
}
```

#### Scenario File Layout

Scenario YAML and their directive markdown live together in the project:

```
prompts/scenarios/
  bootstrap_grind.yaml
  bootstrap_grind.md          # directive markdown, co-located
  combat_pirate.yaml
  combat_pirate.md
```

The scenario YAML references the markdown by a `scenarioMd` field (filename, resolved
relative to the scenarios directory). The Python prototype stored these in an external
repo (`~/workspace/smbench/scenarios/`); the rewrite keeps everything local.

### 2.3 Execution Result Types

#### ExecutionResult

The per-prompt or per-scenario result, written to the archive.

```
ExecutionResult {
  runId: string               // back-reference to the RunManifest
  executedAt: string          // ISO-8601 timestamp
  promptName: string          // matches PromptCorpusEntry.name or ScenarioCorpusEntry.name
  temperature: number         // the temperature used for this execution

  // Model identity (denormalized for query convenience)
  model: string
  runtime: Runtime
  quant: string

  // Performance metrics
  promptTokens: number
  generationTokens: number
  promptTps: number
  generationTps: number
  peakMemoryGb: number
  wallTimeSec: number

  // Output
  output: string
  error: string | null

  // Cache
  promptHash: string          // for prompts
  scenarioHash: string | null // for scenarios

  // Game-specific (null for prompt runs)
  scenarioName: string | null
  terminationReason: TerminationReason | null
  toolCallCount: number | null
  finalPlayerStats: Record<string, unknown> | null
  events: AgentEvent[] | null
}
```

The cache key for cross-run deduplication is `(artifact, promptName, promptHash, temperature)`.
Same prompt at a different temperature is a separate result.

#### AgentEvent

```
AgentEvent {
  event: AgentEventType
  tick: number                // monotonic counter within the session
  ts: string                  // ISO-8601 timestamp from Admiral
  data: Record<string, unknown>
}
```

### 2.4 RunManifest

The top-level archival envelope. One per benchmark execution session.

```
RunManifest {
  schemaVersion: 1
  runId: string               // "{date}_{modelSlug}_{quant}_{shortId}"
  startedAt: string           // ISO-8601
  finishedAt: string | null   // null if run was interrupted
  interrupted: boolean

  // Model identity
  artifact: string            // HuggingFace repo ID or local path
  model: string               // display name (derived or overridden)
  runtime: Runtime            // how the model was served (metadata, not a grouping axis)
  quant: string               // quantization label (derived or overridden)

  // Environment fingerprint
  env: {
    hostname: string
    platform: string
    runtimeVersion: string    // llama.cpp version or mlx-lm version
    nodeVersion: string
    benchmarkGitSha: string
  }

  // Temperature configuration for this run
  temperatures: number[]        // e.g. [0.3, 0.7, 1.0]

  // Frozen corpora — everything needed to re-score this run
  promptCorpus: Record<string, PromptCorpusEntry>   // keyed by prompt name
  scenarioCorpus: Record<string, ScenarioCorpusEntry> // keyed by scenario name

  // Run statistics (populated at end)
  stats: {
    totalPrompts: number        // number of unique prompts
    totalExecutions: number     // prompts × temperatures
    completed: number
    skippedCached: number
    errors: number
    totalWallTimeSec: number
  }
}
```

### 2.5 Score Result (Transient, Not Persisted)

Scores are always recomputed. This type exists in memory during report generation.

```
ScoreResult {
  promptName: string
  score: number               // 0.0–1.0
  scoreDetails: string        // human-readable breakdown
  category: string
  tier: number
}
```

### 2.6 Model Config

Each entry in the model config represents a single model artifact served by a single runtime.
The same base model at different quants or runtimes are separate entries. Metadata (parameter
count, quant label, display name) is derived from the artifact string or HuggingFace metadata
where possible, with config overrides for anything the derivation gets wrong.

```yaml
# models.yaml
- artifact: "mlx-community/Qwen3-32B-4bit"
  runtime: mlx

- artifact: "Qwen/Qwen3-32B-GGUF"
  runtime: llamacpp
  ctxSize: 16384               # server config: context window override
  scenarioCtxSize: 32768       # separate ctx for game scenarios

- artifact: "mlx-community/DeepSeek-Coder-33B-Instruct-4bit"
  runtime: mlx
  name: "DeepSeek Coder 33B"   # override derived display name
```

```
ModelConfig {
  artifact: string            // HuggingFace repo ID or local path
  runtime: Runtime            // how to serve this artifact
  name?: string               // display name override (derived from artifact if absent)
  quant?: string              // quant label override (derived from artifact if absent)
  params?: string             // parameter count override (derived from artifact if absent)
  ctxSize?: number            // context window override for server
  scenarioCtxSize?: number    // separate ctx for game scenarios
  active?: boolean            // default true; set false to skip without removing
}
```

**Derivation strategy:** At config load time, attempt to derive `name`, `quant`, and `params`
from the artifact string. For MLX models, the repo name typically encodes these
(e.g. `Qwen3-32B-4bit` → name: "Qwen 3 32B", params: "32B", quant: "4bit"). For GGUF models,
the quant is in the filename pattern. If derivation fails or produces wrong values, the config
override takes precedence. Optionally, metadata can be fetched from the HuggingFace API at
config validation time.

---

## 3. Error Model

Every error in the system belongs to a typed hierarchy. No `catch (e: unknown)`. No swallowed exceptions.

### 3.1 Error Types

```
// Server lifecycle
ServerSpawnError       { _tag: "ServerSpawnError", runtime: Runtime, reason: string, logTail?: string }
HealthCheckTimeout     { _tag: "HealthCheckTimeout", url: string, timeoutSec: number }
PortConflict           { _tag: "PortConflict", port: number }

// LLM API
LlmRequestError        { _tag: "LlmRequestError", model: string, promptName: string, cause: string }
LlmTimeoutError        { _tag: "LlmTimeoutError", model: string, promptName: string, timeoutSec: number }
LlmMalformedResponse   { _tag: "LlmMalformedResponse", model: string, promptName: string, body: string }
LlmEmptyResponse       { _tag: "LlmEmptyResponse", model: string, promptName: string }

// SSE / streaming
SseConnectionError     { _tag: "SseConnectionError", profileId: string, cause: string }
SseIdleTimeout         { _tag: "SseIdleTimeout", profileId: string, idleSec: number }
SseParseError          { _tag: "SseParseError", profileId: string, rawLine: string }

// Game session
GameFixtureResetError  { _tag: "GameFixtureResetError", fixture: string, cause: string }
GameCredentialMismatch { _tag: "GameCredentialMismatch", expectedId: string, availableIds: string[] }
AdmiralApiError        { _tag: "AdmiralApiError", endpoint: string, status: number, body: string }
GameServerError        { _tag: "GameServerError", scenarioName: string, cause: string }

// Scorer
ScorerNotFound         { _tag: "ScorerNotFound", scorerName: string }
ConstraintEvalError    { _tag: "ConstraintEvalError", constraintName: string, check: string, cause: string }
CodeExecTimeout        { _tag: "CodeExecTimeout", timeoutSec: number }
CodeExecFailed         { _tag: "CodeExecFailed", exitCode: number, stderr: string }

// Configuration
ConfigError            { _tag: "ConfigError", path: string, message: string }
YamlParseError         { _tag: "YamlParseError", filePath: string, cause: string }
SchemaDecodeError      { _tag: "SchemaDecodeError", typeName: string, cause: ParseResult.ParseError }
UnknownSystemPrompt    { _tag: "UnknownSystemPrompt", key: string, availableKeys: string[] }
UnknownConstraintCheck { _tag: "UnknownConstraintCheck", check: string }

// I/O
JsonlCorruptLine       { _tag: "JsonlCorruptLine", filePath: string, lineNumber: number, rawLine: string }
FileIOError            { _tag: "FileIOError", path: string, operation: string, cause: string }

// Cutoff (these are expected terminations, not failures — modeled as values, not errors)
// CutoffTripped is a normal return value from the watchdog, not an error.
```

### 3.2 Error Handling Policies

| Situation | Python Prototype | Effect-TS Requirement |
|---|---|---|
| Single prompt HTTP failure | Catch, set `result.error`, continue | `Effect.catchTag("LlmRequestError", ...)` — record error result, continue stream |
| Server process dies mid-run | Subsequent prompts all fail with same error | Detect process exit via `Fiber`, fail fast for remaining prompts with `ServerSpawnError` |
| SSE connection closes unexpectedly | Silently treated as "completed" | `SseConnectionError` — session recorded with `terminationReason: "error"`, never "completed" |
| Unparseable SSE event | Silently dropped | `SseParseError` — logged, event skipped, counter incremented in run stats |
| Constraint check throws | Counted as "failed constraint" | `ConstraintEvalError` — distinguishable from a legitimately failed constraint in score_details |
| Unknown system prompt key | Falls through to using key as literal text | `UnknownSystemPrompt` — fail at YAML load time, before any execution |
| Unknown constraint check type | ValueError at score time, caught as failed constraint | `UnknownConstraintCheck` — fail at YAML load time |
| JSONL corrupt line | Crashes without identifying file | `JsonlCorruptLine` — includes file path and line number, skip the line, continue loading |
| readline() blocks forever | Hard hang, only Ctrl+C escapes | `Stream.timeout` on SSE idle + `Fiber.race` with wall-clock cutoff |

### 3.3 The SSE Timeout Solution

The most dangerous bug in the Python prototype is `readline()` blocking forever, preventing all cutoffs from firing. The Effect-TS design eliminates this structurally:

```
The SSE event stream is consumed as an Effect Stream<AgentEvent, SseConnectionError | SseParseError>.

The stream has an idle timeout (configurable, default 120s) applied via Stream.timeoutFail.
If no event arrives within the idle window, SseIdleTimeout is produced.

The wall-clock cutoff is enforced by racing the event-processing Fiber against
an Effect.sleep(wallClockSec) Fiber. Whichever completes first wins.
The sleep Fiber cannot be blocked by readline — it runs on its own fiber.

Token and tool-call cutoffs are checked after each event, same as the Python watchdog,
but they are reachable because the stream itself cannot block forever.
```

---

## 4. Scoring Engine

### 4.1 Thinking-Tag Stripping

Applied to all scorer types except `game`. Strips in this order:

1. **GPT-OSS Harmony channels:** Extract content from `<|channel|>final<|message|>...<|end|>` (or `<|return|>` or end-of-string). If found, replace entire text with extracted content, then strip remaining `<|...|>` tokens.
2. **DeepSeek think tags:** Strip from start of string through `</think>` plus trailing whitespace.
3. **Trim** leading/trailing whitespace.

### 4.2 exact_match Scorer

**Input:** cleaned output string, `ExactMatchConfig`
**Logic:**
1. `RegExp(config.extract, "g")` — find all matches.
2. Take the last match's first capture group.
3. Strip commas from extracted value.
4. Compare to `config.expected` (exact string equality, case-sensitive).
**Output:** `{ score: 0 | 1, details: string }`

### 4.3 constraint Scorer

**Input:** cleaned output string, `ConstraintConfig`
**Logic:**
1. For each `ConstraintDef` in `config.constraints`:
   - Dispatch on `def.check` to the appropriate evaluation function.
   - On success: record as passed.
   - On `ConstraintEvalError`: record as errored (distinct from failed).
2. `score = passedCount / totalCount`
3. `details` lists passed, failed, and errored constraints separately.
**Output:** `{ score: number, details: string }`

Each constraint check is a pure function `(output: string, def: ConstraintDef) => boolean`. The full check logic from the Python prototype is preserved:

- `contains`: case-insensitive substring
- `contains_exact`: case-sensitive substring
- `not_contains_char`: case-insensitive single-char absence
- `min_length`: `output.trim().length > def.length` (strictly greater)
- `regex`: `new RegExp(def.pattern, def.dotall ? "s" : "").test(output)`
- `regex_count_min`: count matches >= def.min
- `valid_json`: try `JSON.parse(output.trim())`, fallback to extracting first `{...}` block
- `json_has_keys`: parse JSON, check all keys present
- `json_all_string_values`: parse JSON, check all values are strings
- `json_nested_is_object`: parse JSON, check `obj[key]` is an object
- `json_nested_has_key`: parse JSON, check `obj[parent][key]` exists
- `json_field_equals`: parse JSON, check `obj[key] === value` (deep equality for objects)
- `json_field_is_list`: parse JSON, check `Array.isArray(obj[key])`
- `json_list_item_has`: parse JSON, find item in array matching both field conditions
- `numbered_lines`: both `from` and `to` line numbers present (regex `^N[.):\s]` multiline)
- `no_numbered_line`: line number absent
- `numbered_line_exists`: line number present
- `line_count`: count non-empty lines after trim, exact match
- `word_count_exact`: case-insensitive word-boundary regex, exact count
- `all_lines_word_count`: every non-empty line has word count in [min, max]

### 4.4 code_exec Scorer

**Input:** cleaned output string, `CodeExecConfig`
**Logic:**
1. Extract code from output:
   - Try markdown fence: `` ```python `` or `` ```py `` or bare `` ``` ``
   - Fall back to detecting `def`/`import`/`from` lines
   - Last resort: use entire output
2. Construct test harness: `extractedCode + "\n\n" + config.testCode + "\nprint('ALL_TESTS_PASSED')\n"`
3. Execute via Python subprocess with 10-second timeout (see Section 9).
4. Pass if exit code 0 AND stdout contains `ALL_TESTS_PASSED`.
**Output:** `{ score: 0 | 1, details: string }`

### 4.5 game Scorer

**Input:** `GameSessionResult` (events + finalPlayerStats), `GameScorerConfig`
**Logic:** Dispatch on `config.gameScorer` to a registry of scoring functions. Each scorer reads stats from `finalPlayerStats.stats` and computes tool metrics from events.

**Tool metrics helper:** From the event list:
- `totalToolAttempts = count(tool_call) + count(tool_error)`
- `toolErrors = count(tool_error)`
- `accuracy = count(tool_call) / totalToolAttempts` (0 if none)

**All 14 game scorers** compute a raw score on a 0-100 scale, then divide by 100. Each uses a weighted sum of components (activity, efficiency/accuracy, domain-specific stats). The exact formulas from the Python prototype are preserved:

| Scorer | Key Stats | Weight Distribution |
|---|---|---|
| `bootstrap_grind` | credits_earned | 40 credits + 20 efficiency + 20 activity + 20 earn_ratio |
| `navigation` | systems_explored | 50 exploration + 25 efficiency + 25 activity |
| `trading` | credits, credits_earned | 40 credits + 30 earned + 15 efficiency + 15 activity |
| `combat` | pirates_destroyed | 50 pirates + 25 efficiency + 25 activity |
| `generic` | (none) | 50 efficiency + 50 activity |
| `dock_and_sell` | ore_mined, times_docked, credits_earned | 25+25+30 domain + 20 accuracy |
| `refuel_loop` | times_docked, jumps_completed, deaths | 30+30 domain + 20 survival + 20 accuracy |
| `navigation_route` | systems_explored, jumps_completed | 40+30 domain + 30 accuracy |
| `market_buy_sell` | exchange_items_bought/sold, credits_earned | 30+30+20 domain + 20 accuracy |
| `equip_ship` | modules_installed | 60 domain + 20 accuracy + 20 activity |
| `craft_item` | items_crafted | 60 domain + 20 accuracy + 20 activity |
| `combat_pirate` | pirates_destroyed, battles_started, deaths | 40+20 domain + 6-20 survival + 20 accuracy |
| `storage_management` | ore_mined, times_docked | 25+25 domain + 30 accuracy + 20 activity |
| `scan_and_survey` | systems_explored, scans_performed | 35+35 domain + 30 accuracy |

Note: `trading` reads `credits` from the top level of `finalPlayerStats`, not from the `stats` sub-object. All other scorers read from `stats`.

### 4.6 Scoring Pipeline

Scoring is always deferred — never persisted to the archive. At report time:

1. Load archive manifest(s).
2. For each `ExecutionResult`, look up the corresponding `PromptCorpusEntry` or `ScenarioCorpusEntry` from the manifest's corpus.
3. Apply the scorer using the corpus entry's `ScorerConfig`.
4. For game results, reconstruct a minimal session from the stored `events` and `finalPlayerStats` — this is now possible because events are retained on load (unlike the Python prototype where they were dropped).

**Re-scoring modes:**
- **"As run"**: Score using the manifest's embedded corpus. Reproduces the exact scoring from the run's perspective.
- **"Current"**: Score using the current YAML prompt definitions. Shows how old results perform against new rubrics.

---

## 5. Orchestration

### 5.1 Resource Hierarchy

Resources form a strict hierarchy managed by nested `Scope`s:

```
RunScope (per model config entry)
  ├── LlmServer (llamacpp on :18080 or mlx-lm.server on :18081, per config)
  │     └── acquireRelease: spawn server → health check → (use) → SIGTERM → wait → SIGKILL
  ├── PromptLoop
  │     └── For each prompt: HTTP request with timeout → collect result → append to archive
  ├── AdmiralServer (on :3031, started only if scenarios exist)
  │     └── acquireRelease: bun run → health check → (use) → SIGTERM → wait → SIGKILL
  └── ScenarioLoop
        └── For each scenario:
              ScenarioScope
                ├── GameServer (ephemeral port)
                │     └── acquireRelease: allocate port → spawn → health check → (use) → SIGTERM → SIGKILL
                ├── AdmiralProfile
                │     └── acquireRelease: configure provider → create profile → connect → (use) → disconnect → delete
                └── SseStream
                      └── acquireRelease: open SSE connection → (consume events) → close
```

**Cleanup order is guaranteed by Scope nesting.** Inner scopes finalize before outer scopes. No manual cleanup sequencing needed.

### 5.2 Server Lifecycle

**LLM Server** (Effect service: `LlmServer`):

For both runtimes, the server is an HTTP server exposing an OpenAI-compatible `/v1/chat/completions` endpoint. The Python prototype's MLX subprocess mode (stdin/stdout JSON protocol) is eliminated — MLX always runs as `mlx_lm.server`.

- llamacpp: spawn `llama-server` on port 18080. Health check: `GET /health` with 300s timeout, 1s poll.
- MLX: spawn `python -m mlx_lm.server` on port 18081. Health check: `GET /health` with 300s timeout, 1s poll.

Both use the same `ChatCompletion` service interface:
```
ChatCompletion.send(system: string, user: string, maxTokens: number)
  => Effect<ChatCompletionResponse, LlmRequestError | LlmTimeoutError | LlmMalformedResponse>
```

**Process health monitoring:** A background Fiber polls the server process status. If the process exits unexpectedly, all pending requests fail immediately with `ServerSpawnError` rather than timing out individually. This eliminates the Python bug where a dead MLX subprocess causes every subsequent prompt to fail with the same broken-pipe error.

**Admiral Server:**
- Spawn: `bun run src/server/index.ts` on port 3031. Health check: `GET /api/health` with 30s timeout, 0.5s poll.
- Managed by `acquireRelease` — guaranteed cleanup even if scenario loop throws.

**GameServer:**
- Spawn per-scenario on an ephemeral port. Environment: `PORT`, `ADMIN_API_TOKEN` (random hex), `TICK_RATE=10`, `BENCHMARK_MODE=1`, `DATA_DIR`.
- Health check: `GET /health` with 30s timeout.
- Port allocation: bind-to-0, read port, close socket, pass to child. Same TOCTOU race as Python — acceptable for sequential execution.

### 5.3 Prompt Execution Flow

```
for each model config entry:
  load existing archive results for this artifact (cross-run cache)
  build prompt corpus from current YAML
  load temperature config (global)

  for each (prompt, temperature) pair:
    determine if execution needed (hash mismatch, invalid result, or --fresh)

  if nothing to run: skip

  within RunScope:
    start LlmServer (llamacpp or mlx, per model config)
    create RunManifest header, write to archive

    for each prompt (ordered by tier, then name):
      for each temperature:
        if cached and valid: record as skipped, continue
        send to LlmServer with 600s timeout, temperature param
        collect ExecutionResult (includes temperature)
        append to archive JSONL
        score in-memory for progress display

    if scenarios enabled:
      start AdmiralServer
      (if scenarioCtxSize differs from ctxSize, restart LlmServer)

      for each scenario:
        // scenarios run at a fixed temperature (first in the configured range),
        // not the full matrix — too expensive for multi-turn sessions
        within ScenarioScope:
          start GameServer
          reset fixture, get credentials
          create + connect Admiral profile
          consume SSE stream (with idle timeout + wall-clock race)
          capture final player stats
          collect ExecutionResult with events
          append to archive JSONL

    finalize RunManifest trailer (stats, finishedAt)
```

### 5.3.1 Temperature Configuration

Temperature is configured globally, not per-prompt. The config specifies a list of temperatures:

```yaml
# In run config or CLI
temperatures: [0.3, 0.7, 1.0]
```

Each prompt is executed once per temperature. Game scenarios are excluded from the temperature
matrix — they run at a single temperature (the first in the list) because multi-turn sessions
are too expensive to repeat.

### 5.3.2 Cross-Run Caching

By default, before starting a run, the system scans existing archives for results matching
this `(artifact, promptName, promptHash, temperature)`. If a valid result exists (no error,
non-empty output), the execution is skipped. This allows re-running to fill in
errors/failures without re-executing successful results.

With `--fresh`, all caching is disabled. Every prompt is executed regardless of prior results,
producing a complete standalone archive.

### 5.4 SSE Event Stream

The SSE stream from Admiral is consumed as:

```
Stream<AgentEvent, SseConnectionError | SseParseError | SseIdleTimeout>
```

**Event mapping** from Admiral log entries to `AgentEvent`:

| Admiral `type` | AgentEvent `event` | Notes |
|---|---|---|
| `tool_call` | `tool_call` | `tool` name extracted from detail |
| `tool_result` (success) | `tool_result` | |
| `tool_result` (error) | `tool_error` | status="error" or "error" in summary |
| `llm_call` | `turn_end` | cumulative token counts |
| `error` | `error` | |
| `connection` | `connection` | |
| `llm_thought` | (dropped) | |
| `notification` | (dropped) | |
| `system` | (dropped) | |
| `server_message` | (dropped) | |

**Deduplication:** Admiral replays historical events on stream open. Deduplicate by entry `id` using a Set.

**Idle timeout:** If no event arrives within 120s (configurable), the stream fails with `SseIdleTimeout`. This replaces the Python prototype's `STALL_WARN` that could never fire during a blocked `readline()`.

### 5.5 Cutoff Watchdog

The watchdog is a pure state machine, same as the Python prototype:

```
CutoffWatchdog {
  observe(event: AgentEvent): void
  tripped(): TerminationReason | null   // sticky once tripped
}
```

- `tool_call` → increment `toolCallCount`
- `turn_end` → update `totalTokens` from cumulative counts
- Check order: `tool_calls` > `tokens` > `wall_clock`
- All checks are exclusive (`>`, not `>=`)

**Critical difference from Python:** The wall-clock cutoff is ALSO enforced by a racing Fiber (see 3.3), so even if the watchdog's `tripped()` is never polled (because events stopped arriving), the session still terminates.

---

## 6. JSONL I/O and Archival

### 6.1 Archive File Format

```
benchmark-archive/
  {runId}.jsonl
```

- **Line 1:** `RunManifest` header (JSON object with `schemaVersion`, corpus, env, etc.)
- **Lines 2+:** `ExecutionResult` records (one per prompt/scenario executed in this run)
- **Last line:** `RunManifest` trailer (JSON object with `stats`, `finishedAt`, `interrupted`)

The trailer is a separate line (not a rewrite of line 1) to preserve append-only semantics.

### 6.2 Reading Archives

```
loadManifest(path: string)
  => Effect<{ manifest: RunManifest, results: ExecutionResult[] }, JsonlCorruptLine | SchemaDecodeError | FileIOError>
```

Every line is decoded through `@effect/schema`. Corrupt lines produce `JsonlCorruptLine` with the file path, line number, and raw content — a fix for the Python prototype's crash-without-context behavior.

---

## 7. Report Generation

### 7.1 Pipeline

1. Load archive manifests.
2. Score all results using either embedded corpus ("as run") or current YAML ("current").
3. Filter to scored results only (`score !== null`).
4. Serialize to the webapp data contract (Section 10).
5. Write `webapp/src/data/data.js` as `window.__BENCHMARK_DATA = [...];\n`.
6. Optionally trigger Vite build for static HTML report.

### 7.2 Aggregation

All aggregation happens in the browser. The backend emits one flat record per `(model, runtime, quant, promptName)` tuple. No pre-aggregation.

---

## 8. CLI Interface

### 8.1 Commands

```
llm-bench run [options]           # Execute benchmarks
llm-bench report [options]        # Generate report from existing data
llm-bench score [options]         # Re-score archives without running
llm-bench list-models             # Show configured models
llm-bench list-prompts            # Show loaded prompts with hashes
```

### 8.2 Run Options

```
--model-name <substring>          # Substring filter on model display name
--max-tokens <number>             # Max generation tokens (default 8096)
--scenarios <all|none|name>       # Scenario filter
--no-save                         # Don't write results to disk
--fresh                           # No cross-run caching; create a complete new run
--temperatures <list>             # Comma-separated temperatures (default: "0.7")
--idle-timeout <seconds>          # SSE idle timeout (default 120)
```

Note: `--runtime`, `--models`, `--quick`, and `--prompt` are removed. Runtime is per-model-config,
not a global flag. Model size filtering is unnecessary — run the models you've configured.
`--quick` and `--prompt` are removed; always run the full suite.

### 8.3 Report Options

```
--archive <path|glob>             # Specific archive(s) to report on
--scoring <as-run|current>        # Which corpus to use for scoring
--output <path>                   # Output directory for HTML report
```

---

## 9. Python Interop

Two components require Python subprocesses:

### 9.1 MLX Server

`python -m mlx_lm.server --model <id> --host 127.0.0.1 --port 18081`

Managed as a child process via `Effect.acquireRelease`. The TypeScript code communicates with it purely via HTTP (OpenAI-compatible API). No stdin/stdout protocol.

### 9.2 Code Execution Scorer

The `code_exec` scorer runs model-generated Python code:

```
Effect.tryPromise(() =>
  execFile("python", ["-c", combinedCode], { timeout: 10000 })
)
```

This is inherently a Python subprocess. The TypeScript scorer constructs the test harness string and invokes Python, same as the prototype. Pass/fail is determined by exit code + sentinel string in stdout.

### 9.3 llama.cpp Server

`llama-server -m <gguf> --host 127.0.0.1 --port 18080 ...`

Native binary, no Python involved. Managed as a child process.

---

## 10. Webapp Data Contract

The React webapp is NOT rewritten. It continues to consume `window.__BENCHMARK_DATA` with the existing TypeScript interface. The Effect-TS backend must produce byte-compatible output.

### 10.1 Record Shape

```typescript
interface BenchmarkResult {
  model: string;
  runtime: string;           // "llamacpp" | "mlx"
  quant: string;
  prompt_name: string;       // snake_case, NOT camelCase
  category: string;
  tier: number;
  temperature: number;       // the temperature used for this execution
  score: number;             // 0.0-1.0, never null
  score_details: string;
  prompt_tokens: number;
  generation_tokens: number;
  prompt_tps: number;        // rounded to 2 decimal places
  generation_tps: number;    // rounded to 2 decimal places
  wall_time_sec: number;     // rounded to 2 decimal places
  peak_memory_gb: number;    // rounded to 2 decimal places
  output: string;
  prompt_text: string;
}
```

**Critical:** The webapp field names use `snake_case` (matching the Python prototype's JSON serialization), not `camelCase`. The `@effect/schema` encode for the webapp output must produce snake_case keys.

Note: `style` is removed. The webapp will need to be updated to remove references to it.
This is acceptable — the webapp revision is a future phase and `style` was only used for
optional filtering.

### 10.2 Webapp-Derived Metadata

The webapp derives model metadata from the `model` string at runtime:
- **Family:** case-insensitive substring matching (deepseek, qwen/qwq, mistral/devstral/magistral, gemma, llama, phi, gpt, glm; fallback to first word)
- **Size:** regex `(\d+)B\b` on model name
- **Size buckets:** Under 10B, 10-25B, 25-40B, 40-80B, 80B+

The webapp hardcodes `"llamacpp"` and `"mlx"` as runtime values in `Leaderboard.tsx` and `colors.ts`.

### 10.3 Output Format

```javascript
window.__BENCHMARK_DATA = [{...}, {...}, ...];
```

- Plain JS assignment, not a module export.
- `JSON.stringify` with no indentation.
- File ends with `;\n`.
- Written to `webapp/src/data/data.js`.

---

## 11. Migration

### 11.1 One-Time Migration Tool

A CLI command `llm-bench migrate <source-dir>` reads the Python prototype's JSONL files from
`benchmark-execution/` and produces archive manifests in the new format.

**Input:** `benchmark-execution/{model}__{runtime}.jsonl` files. Each line is a flat JSON record
with the `_EXECUTION_FIELDS` from the prototype (see research notes for exact field set).

**Process:**
1. Read all JSONL files, deduplicate by `(model, runtime, quant, prompt_name)` (latest wins).
2. Group results by `(model, runtime, quant)` — each group becomes one RunManifest.
3. For each group:
   - Generate a `runId` with a synthetic timestamp (use file modification time or a fixed
     "migrated" marker).
   - Build the `promptCorpus` by loading current YAML prompts and matching by `prompt_name`.
     Prompts that no longer exist in current YAML are still included in the corpus with
     whatever metadata can be reconstructed (the prompt hash is preserved; the prompt text
     is not available from the JSONL and must come from current YAML or be marked as unknown).
   - Build the `scenarioCorpus` similarly for game results.
   - Write the archive manifest with all results.
4. Validate: re-score the migrated archive and compare scores against a fresh Python prototype
   `--report-only` run to confirm no data was lost.

**Limitations:**
- The prototype's JSONL does not store `prompt_text`, `category`, `tier`, or scoring fields.
  These are reconstructed from current YAML at migration time. If a prompt has been deleted
  or renamed since the result was generated, it cannot be matched and is migrated with
  incomplete corpus metadata.
- Game events may or may not be present in the JSONL (they were added later). Events are
  preserved if present; `null` if absent.
- No `executedAt` timestamp exists in prototype records. Migration uses the JSONL file's
  modification time as a synthetic timestamp for all results in that file.

### 11.2 Migration is Destructive-Safe

The migration tool reads from the old directory and writes to the new archive directory.
It never modifies or deletes the source files. The operator can verify the migration,
then manually remove the old files when satisfied.

---

## 12. Testing Strategy

### 12.1 Unit Tests

- **Constraint evaluators:** One test per constraint check type, covering pass and fail cases. Pure functions, no mocking needed.
- **Thinking-tag stripping:** Test all three patterns (DeepSeek, Harmony, combined) plus passthrough for clean output.
- **exact_match scoring:** Test regex extraction, last-match behavior, comma stripping, case sensitivity.
- **Code extraction:** Test markdown fences, raw code detection, and fallthrough.
- **Game scorers:** Test each scorer with known stat inputs, verify score ranges and component weights.
- **Prompt hash computation:** Verify hash stability (same input → same hash) and sensitivity (different system prompt → different hash).
- **Schema decode/encode:** Round-trip tests for every Schema type — encode to JSON, decode back, verify equality.

### 12.2 Integration Tests

- **JSONL round-trip:** Write a RunManifest + ExecutionResults, read them back, verify all fields.
- **Scoring pipeline:** Load a test archive, score with embedded corpus, verify scores match expected.
- **Report serialization:** Generate `data.js` from test data, verify the output matches the webapp contract exactly (field names, types, rounding).

### 12.3 E2E Tests (Manual or CI)

- **Prompt execution:** Run a single prompt against a small model, verify the archive file is well-formed.
- **Game scenario:** Run a single scenario, verify events are captured and game scorer produces a valid score.
- **Report generation:** Generate an HTML report from test data, open in browser, verify components render.

### 12.4 Test Infrastructure

- **vitest** as the test runner.
- **Effect `TestLayer`** for mocking services (subprocess spawning, filesystem, HTTP).
- **Fixture YAML files** in `test/fixtures/` for prompt and scenario loading tests.
- **Snapshot tests** for `data.js` output format stability.
