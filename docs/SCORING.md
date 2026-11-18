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
interface PromptScore {
  readonly score: number;
  readonly details: string;
  readonly breakdown?: ConstraintBreakdown;
  readonly failure?: "no_answer" | "scorer_error";
  readonly nearMiss?: string;
}

interface ConstraintBreakdown {
  readonly passed: ReadonlyArray<string>;
  readonly failed: ReadonlyArray<string>;
  readonly errored: ReadonlyArray<string>;
}
```

`score` is in `[0, 1]` for every scorer. `details` is a short human-readable string the report layer renders verbatim. `breakdown` is populated only by the constraint scorer so the report can render per-check pass/fail/error lists without re-running scoring. `failure` is the scorer's structured reason a zero is not an ordinary wrong answer: `no_answer` when extraction found nothing to grade (`exact_match` with no regex match; `set_match` / `ordered_match` naming no vocabulary token while some are expected), `scorer_error` when the scorer itself failed (see [Failure handling](#failure-handling)). `nearMiss` is the `slip` of the declared near miss that set the score (see [Near misses](#near-misses)).

Ref: `src/schema/scorer.ts`, `src/scoring/score-result.ts`.

## Per-execution score vs pass rate

The `[0, 1]` values above are **per-item** scores. The report and the webapp turn them into one pass rate per row. An item passes only when its score is exactly 1. Partial credit and execution errors both count as fails. `./bench report` selects each row's evidence ([Report rows](#report-rows)); the webapp sums the row's cells and never chooses evidence.

### The pass-rate formula

A row's score is computed over the challenge set of its dataset, read from the challenge directory at report time:

```
                 Σ over set challenges c of passed(row, c)
pass rate   =   ───────────────────────────────────────────
                 Σ over set challenges c of items(c)
```

A challenge the row never ran, ran only at a stale content hash, or only interrupted, contributes 0 passed items while its items stay in the denominator. That is the coverage adjustment: a config cannot score higher by running fewer or easier challenges. The pass rate is item-weighted: a 40-item challenge moves it four times as much as a 10-item one.

The webapp ranks by this score. An incomplete row also shows its **running score**, passed over the items of the challenges it ran, muted and with its completeness (`86% · 5/11`), so a higher displayed figure can sit below a lower one.

**Scope.** The webapp's scoring controls recompute every row from its cells: the dataset (when the report emits more than one), core or stretch items only (shown only when the challenge set tags items with a scope; it does not, so the control is hidden), or a subset of challenges. The formula is the same over the selected cells and items; a challenge with no items in scope drops out. When the plotted points change, the scatter slides each point (matched across datasets by model, runtime and quant) and the axes to their new positions; points without a match fade in.

### Uncertainty and statistical ties

The webapp's uncertainty is computed over **families**: clusters of items whose outcomes may be correlated. The report gives each cell `families`, the `[items, passed]` count per family. Every item is its own family (`challengeId/itemId`), so the clustered variance below reduces to the ordinary item-level one.

`webapp/src/lib/stats.ts` treats each family `f` of the selected cells as a cluster with `n_f` items and `y_f` passed (0 in a non-scored cell), so `p = Σy / Σn` is exactly the score. Its standard error is the cluster-robust (CR1) variance of that ratio:

```
SE(p) = sqrt( F/(F−1) · Σ_f (y_f − p·n_f)² ) / Σ_f n_f        F = number of families
```

Two rows are compared **paired** over the families they share with the same item count: `d_f = y_A,f − y_B,f`, `D = Σd / Σn`, and `SE(D)` is the same formula applied to `d_f`. Pairing cancels the per-family difficulty both rows face, so the difference is far better resolved than two independent intervals would suggest. The 95% interval is `D ± 1.96·SE(D)`. Both estimators return nothing below 5 clusters, where a clustered variance is too unstable to show.

The webapp surfaces these in three places:

- **List**: when sorted by score, the list is cut into **tiers**. A tier runs from its first entry (the head) until an entry whose paired 95% interval against the head excludes 0 — the head is significantly better — and that entry heads the next tier. A thin rule marks each boundary (`Tier 2 · below #1 at 95%`). Adjacent entries are almost never resolved from each other at this set's size (171 items), so marking every unresolved neighbour would mark nearly every rank; a boundary is drawn only where the data does separate entries. Hovering a score shows `± 1.96·SE`.
- **Scatter**: hovering a row (in the plot or the list) draws a vertical whisker over `p ± 1.96·SE`, clamped to the plotted range; the tooltip repeats it.
- **Drilldown**: the score carries `± 1.96·SE`; an entry's rank shows its tier and the paired difference (this − other, with its 95% interval) against the entry above and against the head it was tested against.

### Efficiency

Efficiency balances the score against what the row spent earning it: tokens, wall time, generation speed and memory.

```
E = S^1.70 · g_wall^0.50 · g_tps^0.60 · g_tokens^0.70 · g_mem^0.10
```

- `S` is the coverage-adjusted score above, under the current scope, so running fewer challenges never raises it.
- Inputs, per row over its scored cells with cost: `wall` is wall seconds per item, `tps` the generation tokens per second (unweighted mean over those cells), `tokens` the generation tokens per item, `mem` the peak memory in GB (maximum over those cells). Per-item figures divide by all items of those cells.
- Each `g = ε + (1 − ε)·u` with `ε = 0.05`. `u` is the input's log-min–max position over the pool, `(ln x − ln min) / (ln max − ln min)`, and is flipped to `1 − u` for the lower-is-better inputs (wall, tokens, mem); `tps` is higher-is-better. The floor keeps a worst-in-pool input from zeroing the product. When every row in the pool has the same value of an input, that input can't discriminate and is neutral (`g = 1`).
- The pool is the in-scope rows of the selected dataset (rows with a scored challenge under the current scope), before the row filters. Filtering never changes a row's efficiency; changing the scope or the dataset does, because min and max move.
- A row missing any cost input has no efficiency: it is not in the pool, shows `—`, and sorts last.

The webapp shows `E × 100` (`eff`) and sorts by it (the **Efficient** preset).

**Hardware.** Wall time and generation speed belong to the machine and runtime, not the model. The current data comes from one machine, so they are comparable. Once rows from several machines sit side by side, wall and tok/s rank hardware as much as models; whether to normalize them per machine, drop them, or pool by `hardwareId` is the main open question. Tokens per item and the score are machine-independent, and memory is nearly so.

**Re-tuning.** The exponents and `ε` were chosen with `scripts/efficiency-lab/`, an interactive page over the report rows (several formula families, sensitivity readouts, presets) plus its reference implementation `core.cjs`. Regenerate its data from `./bench report` and re-tune there as dependable data accumulates; see its README.

Ref: `withEfficiency` in `webapp/src/lib/model.ts`; `scripts/efficiency-lab/core.cjs`.

### Why binary `score === 1`

Constraint scorers produce arbitrary partial credit (`passed.length / total`); averaging those with `exact_match`'s `{0, 1}` outputs would reward "almost right" on a 4-constraint prompt the same as "fully right" on a 1-constraint one. The benchmark question is "did the model solve this?", not "how close did it get?". Partial credit stays in the archive and in `breakdown` for diagnosing why an item failed, but it never counts toward the pass rate.

Ref: `src/report/rows.ts`, `webapp/src/lib/model.ts`, `webapp/src/lib/stats.ts`.

## Report rows

`./bench report` writes `globalThis.__BENCHMARK_ROWS` (`src/report/rows.ts`) to `data.js`: the rows selected in the report step, one entry per **dataset**, so a consumer only sums and displays. A dataset is an archive directory scored against a challenge directory, labelled `main` for `challenges/`, else by the directory name. The report emits one dataset; its `release` is `null` and its `errata` empty (no release baseline or errata exist). Rows never mix datasets.

**Challenge set.** The set is every challenge loadable from `--challenges-dir` at report time, with its current version, hash, and items. It is never inferred from the records.

**Rows.** A row is one `configHash` on one machine (`hardwareId`). Attempt archives do not record the machine, so every row's `hardwareId` is `unknown` and the dataset's `hardware` map is empty.

**Selection.** For each row and set challenge, the report pools the item lines of every completed attempt with the same `(configHash, challengeId, challengeVersion)` whose `itemHash` equals the set item's current hash. Per item it keeps the line with the latest `executedAt`. This is the cache's rule, so a row is what `./bench run` would serve: a replay collapses into its original. A line's **executor** is the earliest-started attempt holding the identical line that started no later than the line's `executedAt`; the executor's header supplies its runtime version and git sha (`unknown` when no executor is found).

**Cells.** Each set challenge gets a cell with a status:

| Status | Meaning |
|---|---|
| `scored` | Every set item has a counted line |
| `stale_hash` | No full coverage at the current item hashes, but a completed attempt of the challenge exists |
| `interrupted` | Only interrupted attempts exist |
| `not_run` | No attempt exists |

A cell carries its items, passed, `families` counts, its cost (generation tokens and wall time summed over items, peak memory, mean generation speed; scored cells only), its execution date range, runtime versions, git shas, executing attempts, and whether any executor was re-stamped. A non-`scored` cell counts 0 passed, and its items stay in every denominator. The contract also carries fields the archives cannot fill yet, at fixed values: `scopes` and `scopeFamilies` are empty, `failureKinds` is empty, `nearMissCredit` is 0, and `samples` is `[1, 1]` on a scored cell (one line per item).

**Row figures.** `passRate = Σ passed / Σ set items` — the formula above, so a missing or stale challenge counts as failed. `se` is the CR1 standard error over the row's families (`null` below 5). `completeness` counts scored challenges and their items; `freshness` is the execution date range of the counted lines; `provenance` lists runtime versions, git shas, submitters (always `local`), samples per item, and re-stamped cells, and sets `mixed` when the counted lines span more than one runtime version, more than one git sha (`unknown` counts), or more than 7 days. `variant` holds only the fields that differ among rows of the same `artifact` — runtime, quant, temperature, max tokens, system prompt — and `variantLabel` joins them (`t0.7 · quant 8bit`). Sampler knobs are not in the attempt header, so configs of one artifact that differ only there share a label. `modelKey` groups the builds of one model: the artifact's last path segment, lower-cased, without an uploader's `org_` prefix or packaging tokens (`GGUF`, `MLX`, `4bit`, `MXFP4`, `Q4_K_M`…); a `configs.yaml` entry's `modelKey` overrides it for that artifact. `modelName` is the same name with case kept.

## Item audit

`./bench audit` is a read-only check on the items themselves, not the models. It loads completed attempts from `--archive-dir`, keeps each config's latest attempt (by `startedAt`) per challenge, and treats an item as passed when its score is exactly 1. Per item it prints the number of configs `n`, pass rate `p`, Bernoulli spread `p(1-p)`, discrimination, flags, and the most common wrong answers.

- **Discrimination** is the point-biserial correlation between the item's pass/fail and each config's pass rate on all other items. High values mark items that separate strong configs from weak ones.
- **`suspect-key`**: `p <= 0.05` with `n >= --min-n` (default 8). A cluster of identical wrong answers is the signature of a wrong answer key. Wrong answers are normalized to the last number in the output (commas stripped), else the lowercased first 40 characters; empty output shows as `(empty)`.
- **`edge`**: the `--edge-top` (default 20) items with the highest discrimination among items with `n >= --min-n`. These are the candidates for targeted multi-sample re-runs; spending samples only on them keeps compute bounded.
- **`saturated`**: `p >= 0.95` among configs whose overall pass rate is above the median.
- **`zero-failure`**: `p = 1` — every config's latest result passed. Pruning removes these items (except the `smoke` challenge, which tests harness plumbing) and records a `retired` erratum ([ERRATA.md](./ERRATA.md)).

Lines of retired items (`retiredItems` on the manifest) are not observed.

Rows are sorted by discrimination, then spread. `--challenge` restricts to one challenge id, `--flag` to rows carrying a flag, and `--json` emits the rows as JSON. The pure statistics are in `src/audit/stats.ts`.

Ref: `src/cli/commands/audit.ts`, `src/audit/stats.ts`.

## Near misses

A near miss is a specific wrong answer that earns partial credit. Each is declared per item as an alternative accepted value with a `credit` in `(0, 1)` and a named `slip` — never a numeric tolerance window. `exact_match` declares `{ slip, credit, expected }`, `constraint` declares `{ slip, credit, pattern }` (see [CONFIG.md](./CONFIG.md#challengesyaml)).

| Answer | Credit |
|---|---|
| Pure formatting: comma grouping, `$`, trailing zeros, the sign of a payment whose magnitude is right | Full — the primary pattern normalizes it |
| Rounding or precision slip on multi-step math: unrounded vs cent-rounded, rounding at the end vs per step, truncating instead of rounding | `0.5` |
| Right value in the wrong unit or form: a percent where a decimal was asked, cents for dollars | `0.5` |
| A conceptual error (e.g. a monthly rate where an annual one was asked) | `0` |

For generated challenges the solvers in `scripts/author/` compute each near-miss value from the same inputs as the key, and the generator refuses a near-miss pattern that matches the prompt text itself. Hand-written challenges declare them directly in YAML. A near miss changes scores, so adding one is a scorer change and needs an erratum ([ERRATA.md](./ERRATA.md)).

The headline pass rate stays binary — a near miss is not a pass (`score === 1` only). Partial credit is reported separately: the item line carries `failureKind: "near_miss"` and the `slip` in `nearMiss`, and each report record carries `near_miss_credit`, the sum of near-miss credit over its items.

Ref: `src/schema/scorer.ts` (`ExactNearMiss`, `PatternNearMiss`), `src/scoring/exact-match.ts`, `src/scoring/constraint.ts`.

## Multi-turn items

A challenge item with `turns:` is a conversation of incremental questions. Each turn has its own prompt, scorer (`exact_match` or `constraint`), and `answer` — the gold assistant message. A turn may declare `nearMisses` exactly like a single-shot item. The loader expands the item into one scored unit per turn, `name#k`, and every unit is scored, cached, audited, and counted toward the pass rate exactly like a single-shot item.

Turn `k` is sent with turns `1..k-1` and their **gold** answers as conversation history, never the model's own answers, so each turn measures one step and an early miss does not cascade. Loading fails if any gold answer does not score 1 under its own turn's scorer. The report detail file marks each turn with `prior_turn_passed` — whether the model's own answer to the previous turn passed in the same attempt — so recovery after a miss is visible.

Design: `docs/superpowers/specs/2026-11-16-multiturn-challenges-design.md`.

## Failure handling

Scorers return `Effect<PromptScore, ScorerNotFound | CodeExecTimeout | CodeExecFailed | ScorerSpawnFailed, CommandExecutor>`. Errors do **not** become scores inside the scorer — they propagate on the error channel. Every caller that records a score goes through `scoreOrFold` (`src/scoring/dispatch.ts`), which folds an error into `{ score: 0, details: "scorer error: <tagged error>", failure: "scorer_error" }`: the run (`run-challenge.ts`) and re-scoring (`bench score`) both use it.

Per-constraint evaluator errors are caught one level deeper: `scoreConstraints` wraps `evaluateConstraint` with `Effect.either` and routes thrown `ConstraintEvalError` into the `errored` bucket of the breakdown. The constraint scorer itself never fails on the error channel.

An item whose execution recorded an `error` is not scored; it records `score: 0`.

### Failure kind

Every scored item records a `failureKind` alongside its `score` — `null` on a full pass, otherwise why it fell short. `classifyFailure` (`src/scoring/failure-kind.ts`) derives it from the item's stored `error`, `stopReason`, `output`, and `reasoning` plus the scorer's `failure`; first matching rule wins:

| `failureKind` | Detected by |
|---|---|
| `thinking_truncated` | `error: "thinking_truncated"` (an inline `<think>` never closed), or `stopReason: "length"` with empty `output` and non-null `reasoning` (a split-reasoning runtime spent the budget thinking) |
| `execution_error` | any other non-null `error` — transport failure, timeout, malformed or empty response |
| `near_miss` | a declared near miss set the score (`nearMiss`), however generation ended; the item line records the `slip` in `nearMiss` |
| `loop` | `stopReason: "loop"` — the repetition detector cancelled the stream |
| `length_cutoff` | `stopReason: "length"` otherwise — the answer was cut off by `maxTokens` |
| `scorer_error` | the scorer failed (`failure: "scorer_error"`) |
| `no_answer` | empty `output`, or the scorer found nothing to extract (`failure: "no_answer"`) |
| `wrong` | everything else, including partial credit |

The score is unaffected — every kind scores 0 (or its partial credit; `near_miss` scores its declared credit); `failureKind` records only why. Because the inputs are all on the stored line, `bench score` recomputes `failureKind` (and `scoreDetails`) for any archive it re-scores. Archives that predate `stopReason` classify a cutoff with empty output as `no_answer`.

Ref: `src/errors/scorer.ts`, `src/scoring/dispatch.ts`, `src/scoring/failure-kind.ts`.

## `exact_match`

Operates on `result.output` (already cleaned of `<think>` and Harmony control tokens upstream — see [Dispatch](#dispatch)).

1. Compile `config.extract` as a global regex and collect every match against the output.
2. Take the **last** match (models commonly show work before the final answer). Prefer capture group 1; fall back to the whole match if the pattern has no group.
3. Strip commas from the extracted string (for `2,395,912`-style numerics).
4. Compare to `config.expected` with case-sensitive string equality. `1` on match.
5. Otherwise, the first `config.nearMisses` entry whose `expected` equals the extracted string scores its `credit` and names its `slip`; no entry matching scores `0`.

No match and no-capture-group patterns both degrade to `score: 0` with a descriptive `details`; the scorer is total and has no failure channel.

The `extract` regex is defined by the `exact_match` scorer config on the inline challenge item (see [`CONFIG.md` § `challenges/*.yaml`](./CONFIG.md#challengesyaml)) and is only consulted by this scorer.

Ref: `src/scoring/exact-match.ts`. Reasoning extraction (the upstream pre-process this scorer relies on): `src/orchestration/run-prompt.ts::resolveOutputFields` and `src/scoring/strip-thinking.ts`.

## `constraint`

Iterate over `config.constraints`. For each, dispatch on the `check` discriminator to a pure predicate over `result.output` (already cleaned upstream — see [Dispatch](#dispatch)). Predicate → `true` adds the constraint's `name` to `passed`; `false` adds it to `failed`; a thrown exception (wrapped as `ConstraintEvalError`) adds it to `errored`. Final score is `passed.length / total`; an empty constraint list scores `0`.

When that score is below 1, each `config.nearMisses` entry is tried in order: the first whose `pattern` matches the output (same semantics as the `regex` check) and whose `credit` exceeds the score sets the score to `credit` and names its `slip`. The breakdown still lists the constraints as evaluated.

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
