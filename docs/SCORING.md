# Scoring

> _Last verified: 2026-05-06 against commit `8c88551`._

## Dispatch

`scoreExecution(result, entry)` picks a scorer by whether the corpus entry is a prompt or a scenario. Prompt entries carry a `ScorerConfig` discriminated union (`type`); scenario entries carry a bare `scorer` name resolved against the game scorer registry at scoring time.

Scorers read `result.output` directly — **the cleaning has already happened upstream** in `src/orchestration/run-prompt.ts::resolveOutputFields`, called immediately after the LLM response. By the time the result lands in the archive (and again when `./bench score` re-reads it), `output` is the final answer, `reasoning` carries the separated thinking body, and `rawOutput` preserves the original API content for audit.

Why the split lives in orchestration, not scoring:

- **Structured runtime signals must not be re-stripped.** When the runtime returns `reasoning_content` as its own API field, `output` is already clean. Running `stripThinkingTags` over it again would corrupt answers that legitimately contain `<think>`-shaped or `<|...|>`-shaped substrings.
- **`thinking_truncated` is an execution-level outcome, not a scoring one.** If a `<think>` opener never closes, the budget was exhausted before the model produced an answer. That fact belongs on the result line (`error: "thinking_truncated"`, `output: ""`) so the report layer treats it like any other LLM failure, instead of being re-derived by every scorer.
- **The scoring catalog stays presentation-free.** Channel parsers, control-token regexes, and DeepSeek-R1 quirks are concerns of the LLM/runtime layer. Scorers express semantics ("does this match the expected answer?"); they don't re-parse model output formats.

Scenario scorers read structured event streams (`result.events`, `result.finalPlayerStats`), not raw output, so no pre-processing applies.

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

## Per-execution score vs webapp pass rate

The `[0, 1]` values above are **per-execution** scores. The webapp aggregates them into a 0–100 pass rate per displayed cell. Two binary rules govern the math:

```ts
// webapp/src/lib/constants.ts
export const isPass = (score: number): boolean => score === 1;
```

A run "passes" only when its score is exactly 1. Partial credit and execution errors both count as fails.

### What's a "challenge"?

A **challenge** is one prompt (or scenario) attempted at one temperature in a benchmark run. Each `./bench run` invocation gets a `run_id`; the run's challenge set is the union of `(prompt_name, temperature)` pairs every variant in that run attempted.

### The pass-rate formula

For a displayed cell at `(model, runtime, quant, temperature, run_id)`:

```
                     count of distinct prompt_names this variant passed
pass rate (0..1)  =  ──────────────────────────────────────────────────────
                     count of distinct prompt_names attempted in the run
                     at this temperature, by ANY variant in the dataset
```

Both sides count distinct prompt names, not records. The denominator is computed once per `(run_id, temperature)` slice and reused for every variant in it — which is the whole point: a flaky variant that crashed at prompt 30 of 50 divides by 50 (assuming any variant in the run completed the corpus), not by 30. A model can't look better by running fewer challenges.

The aggregation lives in `webapp/src/lib/pipeline.ts`:

- `buildChallengeIndex(data)` — builds the `(run_id, temperature) → distinct prompt count` lookup.
- `countPassingChallenges(runs)` — counts distinct prompt names this variant passed.
- `aggregateForScatter`, `aggregateForRunList`, `computeVariants` — divide one by the other per variant cell.

Variant grouping keys include `run_id`. Two runs of the same `(model, runtime, quant, temperature)` produce two cells, one per `run_id`, rather than collapsing into a single average — pass rates are only meaningful relative to a single run's challenge set.

### Why these choices

**Why binary `score === 1` instead of a mean.** Constraint scorers produce arbitrary partial credit (`passed.length / total`); averaging those with `exact_match`'s `{0, 1}` outputs would weight prompts unequally and reward "almost right" on a 4-constraint prompt the same as "fully right" on a 1-constraint one. The benchmark question is "did the model solve this?", not "how close did it get?" — partial credit is useful for diagnosing _why_ a run failed (the `breakdown` field) but not for ranking models. Inverted pass rates also stay interpretable: a model that's correct 25% of the time on a tier-3 prompt is meaningfully different from one that scrapes 0.6 partial-credit on every run; a mean would smear those together.

**Why the denominator is "challenges in the run", not "records observed".** Every variant in a run is supposed to attempt the same corpus. A variant that completed only 30 of 50 prompts (interrupt, crash, OOM) used to divide by 30, which made it indistinguishable from a variant that ran all 50 successfully — the pass rate hid coverage. Anchoring the denominator to the run's challenge count makes flaky and complete variants directly comparable. The implicit precondition: at least one variant in each `(run_id, temperature)` slice attempted every challenge — otherwise that challenge is invisible to the union and the denominator silently undercounts. In practice at least one model finishes; if that ever stops being true we'd ship the manifest's planned corpus through `data.js` to anchor the count exogenously.

**Why distinct prompt names on both numerator and denominator.** Defends against pathological inputs where duplicate records exist for the same prompt — record-count math could drive pass rate above 1.0. Set-based math collapses any duplicates to one challenge.

**Why `run_id` is in the variant key.** Without it, two separate `./bench run` invocations of the same variant collapse into one cell and there's no single `(run_id, temperature)` denominator to look up. Splitting cells by `run_id` keeps every displayed pass rate honestly attributable to one benchmark run.

Per-execution scores in `[0, 1)` still flow into the archive — the webapp just doesn't count them as wins. See `webapp/src/lib/constants.ts::isPass` and the `score: number; // 0..100` comments in `pipeline.ts`.

Capability tags (`computeCapability` in `pipeline.ts`) are a display filter, not a pass-rate denominator — they show "of the records carrying tag T, what fraction passed?" and intentionally do not anchor to a per-tag run challenge count.

Ref: `webapp/src/lib/constants.ts`, `webapp/src/lib/pipeline.ts`, `src/report/webapp-contract.ts`.

## Failure handling

Scorers return `Effect<Score, ScorerNotFound | CodeExecTimeout | CodeExecFailed, CommandExecutor>`. Errors do **not** become `Score` values inside the scorer — they propagate on the error channel. The layer above catches them and collapses them to a sentinel score:

- `src/report/aggregate.ts` wraps `scoreExecution` in `safeScore`, catching every tag and emitting `{ score: 0, details: "scorer error: <tag>" }`.
- `src/cli/commands/score.ts` uses `Effect.either` and prints `error: <string>` for the failing row.

Per-constraint evaluator errors are caught one level deeper: `scoreConstraints` wraps `evaluateConstraint` with `Effect.either` and routes thrown `ConstraintEvalError` into the `errored` bucket of the breakdown. The constraint scorer itself never fails on the error channel.

Execution-level errors (LLM failures, cutoffs with no output) are detected upstream by the report layer reading `result.error`; those rows skip scoring entirely and get `{ score: 0, details: "execution error: ..." }`.

Ref: `src/errors/scorer.ts`, `src/report/aggregate.ts`, `src/cli/commands/score.ts`.

## `exact_match`

Operates on `result.output` (already cleaned of `<think>` and Harmony control tokens upstream — see [Dispatch](#dispatch)).

1. Compile `config.extract` as a global regex and collect every match against the output.
2. Take the **last** match (models commonly show work before the final answer). Prefer capture group 1; fall back to the whole match if the pattern has no group.
3. Strip commas from the extracted string (for `2,395,912`-style numerics).
4. Compare to `config.expected` with case-sensitive string equality. `1` on match, `0` otherwise.

No match and no-capture-group patterns both degrade to `score: 0` with a descriptive `details`; the scorer is total and has no failure channel.

The `extract` regex is defined by the `exact_match` scorer config in the prompt YAML (see [`CONFIG.md` § `prompts/*.yaml`](./CONFIG.md#promptsyaml)) and is only consulted by this scorer.

Ref: `src/scoring/exact-match.ts`. Reasoning extraction (the upstream pre-process this scorer relies on): `src/orchestration/run-prompt.ts::resolveOutputFields` and `src/scoring/strip-thinking.ts`.

## `constraint`

Iterate over `config.constraints`. For each, dispatch on the `check` discriminator to a pure predicate over `result.output` (already cleaned upstream — see [Dispatch](#dispatch)). Predicate → `true` adds the constraint's `name` to `passed`; `false` adds it to `failed`; a thrown exception (wrapped as `ConstraintEvalError`) adds it to `errored`. Final score is `passed.length / total`; an empty constraint list scores `0`.

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

1. Extract a Python snippet from `result.output` via `extractCode` (output is already cleaned upstream — see [Dispatch](#dispatch)): prefer a ```` ```python ```` or ```` ```py ```` fenced block; otherwise collect lines starting from the first `def`/`import`/`from` up to a prose-looking stop line (`^[A-Z][a-z].*[.:]$`); otherwise fall back to the whole trimmed output.
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
