# Scoring

> _Last verified: 2026-04-19 against commit `eae465c`._

## Dispatch

`scoreExecution(result, entry)` picks a scorer by whether the corpus entry is a prompt or a scenario. Prompt entries carry a `ScorerConfig` discriminated union (`type`); scenario entries carry a bare `scorer` name resolved against the game scorer registry at scoring time.

Prompt output is passed through [`stripThinkingTags`](#exact_match) before any scorer sees it. Scenario scorers read structured event streams, not raw output, so no pre-processing applies.

| Entry type | Scorer variant | Handler |
|---|---|---|
| `PromptCorpusEntry` | `exact_match` | `scoreExactMatch` |
| `PromptCorpusEntry` | `constraint` | `scoreConstraints` |
| `PromptCorpusEntry` | `code_exec` | `scoreCodeExec` |
| `PromptCorpusEntry` | `game` | Degenerate — fails with `ScorerNotFound` |
| `ScenarioCorpusEntry` | (bare name) | `GAME_SCORERS[entry.scorer]`, or `ScorerNotFound` if missing |

A `game` scorer on a prompt entry is allowed by the union shape but has no meaning — `scoreExecution` short-circuits to `Effect.fail(ScorerNotFound)` rather than attempt a lookup.

Ref: `src/scoring/score-result.ts`.

## Score shape

```ts
interface Score {
  readonly score: number;
  readonly details: string;
  readonly breakdown?: ConstraintBreakdown;
}

interface ConstraintBreakdown {
  readonly passed: ReadonlyArray<string>;
  readonly failed: ReadonlyArray<string>;
  readonly errored: ReadonlyArray<string>;
}
```

`score` is in `[0, 1]` for every scorer. `details` is a short human-readable string the report layer renders verbatim. `breakdown` is populated only by the constraint scorer so the report can render per-check pass/fail/error lists without re-running scoring.

Ref: `src/schema/scorer.ts`, `src/scoring/score-result.ts`.

## Failure handling

Scorers return `Effect<Score, ScorerNotFound | CodeExecTimeout | CodeExecFailed, CommandExecutor>`. Errors do **not** become `Score` values inside the scorer — they propagate on the error channel. The layer above catches them and collapses them to a sentinel score:

- `src/report/aggregate.ts` wraps `scoreExecution` in `safeScore`, catching every tag and emitting `{ score: 0, details: "scorer error: <tag>" }`.
- `src/cli/commands/score.ts` uses `Effect.either` and prints `error: <string>` for the failing row.

Per-constraint evaluator errors are caught one level deeper: `scoreConstraints` wraps `evaluateConstraint` with `Effect.either` and routes thrown `ConstraintEvalError` into the `errored` bucket of the breakdown. The constraint scorer itself never fails on the error channel.

Execution-level errors (LLM failures, cutoffs with no output) are detected upstream by the report layer reading `result.error`; those rows skip scoring entirely and get `{ score: 0, details: "execution error: ..." }`.

Ref: `src/errors/scorer.ts`, `src/report/aggregate.ts`, `src/cli/commands/score.ts`.

## `exact_match`

1. Strip thinking/meta tokens from the output (`stripThinkingTags`): if a Harmony `<|channel|>final<|message|>...<|end|>` block exists, replace the text with its body; strip any remaining `<|...|>` control tokens; strip a leading `.*?</think>\s*` block (DeepSeek R1 style); trim.
2. Compile `config.extract` as a global regex and collect every match against the stripped output.
3. Take the **last** match (models commonly show work before the final answer). Prefer capture group 1; fall back to the whole match if the pattern has no group.
4. Strip commas from the extracted string (for `2,395,912`-style numerics).
5. Compare to `config.expected` with case-sensitive string equality. `1` on match, `0` otherwise.

No match and no-capture-group patterns both degrade to `score: 0` with a descriptive `details`; the scorer is total and has no failure channel.

The `extract` regex is defined by the `exact_match` scorer config in the prompt YAML (see [`CONFIG.md` § `prompts/*.yaml`](./CONFIG.md#promptsyaml)) and is only consulted by this scorer.

Ref: `src/scoring/exact-match.ts`, `src/scoring/strip-thinking.ts`.

## `constraint`

Iterate over `config.constraints`. For each, dispatch on the `check` discriminator to a pure predicate over the thinking-stripped output. Predicate → `true` adds the constraint's `name` to `passed`; `false` adds it to `failed`; a thrown exception (wrapped as `ConstraintEvalError`) adds it to `errored`. Final score is `passed.length / total`; an empty constraint list scores `0`.

`errored` is kept distinct from `failed` — an evaluator that throws (e.g. malformed regex pattern) is not the same signal as a predicate returning false. The distinction surfaces via `breakdown`.

### Check catalog

20 check variants, ordered as declared in the `ConstraintDef` union.

| `check` | Semantics |
|---|---|
| `contains` | Output (lowercased) contains `value` (lowercased). |
| `contains_exact` | Output contains `value` as a case-sensitive substring. |
| `not_contains_char` | Output (lowercased) does **not** contain `char` (lowercased). |
| `min_length` | Trimmed output length is strictly greater than `length`. |
| `regex` | `pattern` matches anywhere in the output; optional `dotall` toggles the `s` flag. |
| `regex_count_min` | Non-overlapping match count of `pattern` is at least `min`. |
| `valid_json` | Output parses as JSON, directly or via the first `{...}` block. |
| `json_has_keys` | Parsed JSON is an object and has every string in `keys`. |
| `json_all_string_values` | Parsed JSON is an object and every top-level value is a string. |
| `json_nested_is_object` | Parsed JSON is an object and `obj[key]` is itself an object. |
| `json_nested_has_key` | Parsed JSON is an object, `obj[parent]` is an object, and contains `key`. |
| `json_field_equals` | Parsed JSON is an object and `obj[key]` deep-equals `value`. |
| `json_field_is_list` | Parsed JSON is an object and `obj[key]` is an array. |
| `json_list_item_has` | Parsed JSON has a `listKey` array containing some item whose `matchField` deep-equals `matchValue` and whose `checkField` deep-equals `checkValue`. |
| `numbered_lines` | Output has a line starting with `from` **and** a line starting with `to` (followed by `.`, `)`, `:`, or whitespace), in multiline mode. |
| `no_numbered_line` | Output has **no** line starting with `line` followed by `.`, `)`, `:`, or whitespace. |
| `numbered_line_exists` | Output **has** a line starting with `line` followed by `.`, `)`, `:`, or whitespace. |
| `line_count` | Count of non-empty trimmed lines equals `count`. |
| `word_count_exact` | Case-insensitive `\b<word>\b` match count equals `count`. |
| `all_lines_word_count` | Every non-empty trimmed line has between `min` and `max` whitespace-separated words (inclusive). |

JSON-reading checks all use the same fallback parser: try `JSON.parse(text.trim())`; on failure, extract the first `{[^{}]*}` block and try that; return `null` otherwise. A `null` parse causes every JSON check to return `false` (not errored).

Ref: schema `src/schema/constraints.ts`, handlers `src/scoring/constraint-checks.ts`, dispatcher `src/scoring/constraint.ts`.

## `code_exec`

1. Extract a Python snippet from the thinking-stripped output (`extractCode`): prefer a ```` ```python ```` or ```` ```py ```` fenced block; otherwise collect lines starting from the first `def`/`import`/`from` up to a prose-looking stop line (`^[A-Z][a-z].*[.:]$`); otherwise fall back to the whole trimmed output.
2. Build a program: `<extracted>\n\n<testCode>\nprint('ALL_TESTS_PASSED')\n`.
3. Spawn `python3 -c <program>` via `@effect/platform` `Command.start`, inside an `Effect.scoped` block so the subprocess is torn down on interrupt.
4. Collect stdout, stderr, and exit code concurrently. Race the whole thing against a 10-second timeout (`DEFAULT_TIMEOUT_MS`).
5. Classify:
   - Exit code `0` **and** stdout contains `ALL_TESTS_PASSED` → `{ score: 1.0, details: "all tests passed" }`.
   - Timeout → fail with `CodeExecTimeout` (propagated; caught by report layer).
   - Subprocess launch failure → fail with `CodeExecFailed`.
   - Non-zero exit, no marker → `{ score: 0.0, details: "<classified failure>" }`, where the classifier inspects stderr for `AssertionError` / `SyntaxError` / `NameError` and reports the last stderr line (truncated to 120 chars), or falls back to a stdout snippet.

The scorer is the only one with a `R` requirement (`CommandExecutor.CommandExecutor`), propagated through `scoreExecution`'s signature.

Ref: `src/scoring/code-exec.ts`, `src/scoring/extract-code.ts`.

## `game`

Scenarios carry a `scorer: string` pointing into a static registry of scorer functions. The registry is a plain `Record<string, ScorerFn>`; lookup failure becomes `ScorerNotFound`. Each scorer reads two pieces of recorded scenario state:

- `result.events` — the normalized `AgentEvent` stream. `toolMetrics` counts `tool_call` vs `tool_error` events to derive `totalTools`, `errors`, and `accuracy`.
- `result.finalPlayerStats` — opaque `Record<string, unknown>`. Numeric counters live under the nested `stats` sub-record and are read via a `stat(key)` helper that returns `0` for missing values; a few scorers read top-level fields via `topStat`.

All scorers compute a raw score out of 100 by summing weighted clamped ratios, then divide by 100 to land in `[0, 1]`. Every scorer is a pure sync function (no Effect), returning `Score` directly — `scoreExecution` wraps the call in `Effect.sync`.

### Game scorer catalog

14 scorers, ordered as registered in `GAME_SCORERS`.

| Name | Semantics |
|---|---|
| `bootstrap_grind` | 40 pts for credits earned (up to 5000), 20 pts tool accuracy, 20 pts tool activity (up to 30 calls), 20 pts credits-per-tool efficiency (ratio up to 30). |
| `navigation` | 50 pts systems explored (up to 10), 25 pts tool accuracy, 25 pts tool activity (up to 20 calls). |
| `trading` | 40 pts final credits (up to 15000), 30 pts credits earned (up to 20000), 15 pts accuracy, 15 pts activity (up to 40 calls). |
| `combat` | 50 pts pirates destroyed (up to 3), 25 pts accuracy, 25 pts activity (up to 30 calls). |
| `generic` | 50 pts accuracy + 50 pts activity (up to 30 calls); used as a fallback with no game-specific stats. |
| `dock_and_sell` | 25 pts ore mined (up to 5), 25 pts times docked (up to 2), 30 pts credits earned (up to 50), 20 pts accuracy. |
| `refuel_loop` | 30 pts times docked (up to 3), 30 pts jumps completed (up to 2), 20 pts survival (all-or-nothing on zero deaths), 20 pts accuracy. |
| `navigation_route` | 40 pts systems explored (up to 3), 30 pts jumps completed (up to 2), 30 pts accuracy. |
| `market_buy_sell` | 30 pts each for at-least-one item bought / sold, 20 pts credits earned (up to 500), 20 pts accuracy. |
| `equip_ship` | 60 pts at-least-one module installed, 20 pts accuracy, 20 pts activity (up to 10 calls). |
| `craft_item` | 60 pts at-least-one item crafted, 20 pts accuracy, 20 pts activity (up to 10 calls). |
| `combat_pirate` | 40 pts at-least-one pirate destroyed, 20 pts at-least-one battle started, 20/6 pts binary survival bonus (no deaths vs any), 20 pts accuracy. |
| `storage_management` | 25 pts ore mined (up to 5), 25 pts times docked (up to 2), 30 pts accuracy, 20 pts activity (up to 15 calls). |
| `scan_and_survey` | 35 pts systems explored (up to 2), 35 pts at-least-one scan performed, 30 pts accuracy. |

All thresholds, weights, and division constants are byte-exact ports of the Python prototype's `game_scorers.py`; re-scoring a migrated archive must produce identical numbers.

Ref: `src/scoring/game.ts`.
