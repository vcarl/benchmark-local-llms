# Scoring

## Dispatch

`scoreExecution(result, entry)` picks a scorer by whether the corpus entry is a prompt or a scenario. Prompt entries carry a `ScorerConfig` discriminated union (`type`); scenario entries carry a bare `scorer` name resolved against the game scorer registry at scoring time.

Scorers read `result.output` directly — **the cleaning has already happened upstream** in `src/orchestration/run-prompt.ts::resolveOutputFields`, called immediately after the LLM response. By the time the result lands in a bundle, `output` is the final answer, `reasoning` carries the separated thinking body, and `rawOutput` preserves the original API content for audit. One rule is applied again at grading (`scoreFields`, `src/scoring/rules.ts`): an execution with `stopReason: "length"` whose `output` equals its `reasoning` (oMLX echoing unfinished thinking as content) is scored as no output, `thinking_truncated` ([erratum 0.6](../releases/0/errata.yaml)).

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
| `PromptCorpusEntry` | `custom` | `scoreCustom` |
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

The `[0, 1]` values above are **per-item** scores. The report and the webapp turn them into one pass rate per row. An item passes only when its score is exactly 1 (`passFraction` in `src/schema/attempt.ts`). Partial credit and execution errors both count as fails. `./bench report` selects each row's evidence ([Report rows](#report-rows)); the webapp sums the row's cells and never chooses evidence.

### Repeated samples

An item can hold several generations (samples) for one config — `./bench run --samples k`, optionally limited to some items with `--items` (see [ARCHIVE-FORMAT.md § Complete runs](./ARCHIVE-FORMAT.md#complete-runs)). A resampled item counts **once**, at its **pass fraction**: the share of its samples scoring exactly 1. A cell's passed count and each family's passed count add that fraction, so the pass rate is the mean over items of the per-item mean — unbiased, and lower-variance than one draw. An item with one sample contributes 0 or 1, exactly as a single-sample item. Cost (generation tokens, wall time) and near-miss credit likewise add the per-item mean over samples, so cost stays that of one execution of the challenge; failure kinds count sample lines. In the clustered SE below, a resampled item enters its family's `y_f` as its fraction; family clustering is unchanged.

The drilldown shows a resampled item once (its first sample) with `k/n samples` beside its score; the summary counts (`passed/items`) print to one decimal when fractional.

### The pass-rate formula

A row's pass rate is computed over the challenge set of its dataset, read from the challenge directory at report time:

```
                 Σ over set challenges c of passed(row, c)
pass rate   =   ───────────────────────────────────────────
                 Σ over set challenges c of items(c)
```

A challenge the row never ran, ran only at a stale content hash, or only interrupted, contributes 0 passed items while its items stay in the denominator. That is the coverage adjustment: a config cannot score higher by running fewer or easier challenges. The pass rate is item-weighted: a 40-item challenge moves it four times as much as a 10-item one.

The webapp ranks by this pass rate. An incomplete row also shows its **partial pass rate**, passed over the items of the challenges it ran, muted and with its completeness (`86% · 5/11`), so a higher displayed figure can sit below a lower one.

**Scope.** The webapp's scoring controls recompute every row from its cells: the dataset (chosen in the dataset column left of the scatter, which groups datasets under their release — the alpha challenge set (release 0), the pre-release draft, `YYYY.N` releases — and lists each one's title, execution dates, row and challenge counts, eval version, snapshot digest, and `alpha`/`legacy`/`unranked` tags), core or stretch items only, or a subset of challenges. The formula is the same over the selected cells and items; a challenge with no items in scope drops out. When the plotted points change, the scatter slides each point (matched across datasets by model, runtime and quant) and the axes to their new positions; points without a match fade in.

**Releases and disclosure.** The webapp opens on the newest release's dataset, the pre-release draft counting as newest (`set=<label>` selects another); a preset chip (`Alpha set`) switches to the newest dataset of another release. The column shows each dataset's current snapshot. Each release has a notes page (`#/release/<release>`: label, dates, item-set digest, challenge and item counts, the snapshots to cite with their full digests, and what a reader can verify: `./bench release verify <release>` over the published challenge files and blobs; a snapshot digest is a citation, and rebuilding a snapshot also needs the execution bundles, which are unpublished), and an errata page (`#/errata?release=<release>`) giving each erratum's measured `scoresChanged`. A challenge cell carries ✱ when a scoring erratum since `<release>.0` changed recorded scores on that challenge's items.

### Uncertainty and statistical ties

Items that share a scenario — one story, one set of numbers, one game — have correlated outcomes, so they are not independent draws; the sampling unit is the item **family** (Miller 2024, "Adding Error Bars to Evals": cluster only on a shared context). An item's family is its YAML `family`, or else its own `challengeId/name`; a multi-turn item's turns share the item's family. The generated batteries in `scripts/author/draft.ts` give every item of one scenario the same family, and a chain shares its scenario's family with the single-shot battery it decomposes, so a family can span challenges. Hand-written items stand alone unless their YAML declares one.

`family` is metadata: it enters no hash, so changing it never re-identifies an item, needs no erratum, and needs no re-score. The report reads families from the dataset's release (`releases/<release>/challenges/`); each cell carries `families`, the `[items, passed]` count per family, and `scopeFamilies`, the same split by scope (detail items carry `family`). An archived item the current challenges do not name stands alone.

`webapp/src/lib/stats.ts` treats each family `f` of the selected cells as a cluster with `n_f` items and `y_f` passed (0 in a non-scored cell), so `p = Σy / Σn` is exactly the score. Its standard error is the cluster-robust (CR1) variance of that ratio:

```
SE(p) = sqrt( F/(F−1) · Σ_f (y_f − p·n_f)² ) / Σ_f n_f        F = number of families
```

Two rows are compared **paired** over the families both rows **scored**: each family's clusters come from scored cells only and are keyed by the family and the challenges it was scored in, so a pair covers identical items (within one dataset a scored cell ran exactly the set's items). A family missing from either row, or scored in different challenges, drops out of the comparison rather than counting as a deficit; the headline `p` still counts missing items as fails. Then `d_f = y_A,f − y_B,f`, `D = Σd / Σn`, and `SE(D)` is the same formula applied to `d_f`. Pairing cancels the per-family difficulty both rows face, so the difference is far better resolved than two independent intervals would suggest.

95% intervals use the Student-t critical value with `C − 1` degrees of freedom, `C` the number of clusters behind the estimate: `p ± t·SE(p)` and `D ± t·SE(D)`. With few clusters a normal 1.96 is far too narrow (t₄ = 2.776 at the 5-cluster minimum); `t` approaches 1.96 as `C` grows. Both estimators return nothing below 5 clusters, where a clustered variance is too unstable to show.

The webapp surfaces these in three places:

- **List**: when sorted by score, the list is cut into **tiers**. A tier runs from its first entry (the head) until an entry whose paired 95% interval against the head excludes 0 — the head is significantly better — and that entry heads the next tier. A thin rule marks each boundary (`Tier 2 · below #1 at 95%`). Adjacent entries are almost never resolved from each other at this set's size (182 items, 10–20-point paired intervals), so marking every unresolved neighbour would mark nearly every rank; a boundary is drawn only where the data does separate entries. Hovering a score shows `± t·SE`.
- **Scatter**: hovering a row (in the plot or the list) draws a vertical whisker over `p ± t·SE`, clamped to the plotted range; the tooltip repeats it.
- **Drilldown**: the score carries `± t·SE`; an entry's rank shows its tier and the paired difference (this − other, with its 95% interval) against the entry above and against the head it was tested against.

### Efficiency

Efficiency balances the pass rate against what the row spent earning it: tokens, wall time, generation speed and memory.

```
E = S^1.70 · g_wall^0.50 · g_tps^0.60 · g_tokens^0.70 · g_mem^0.10
```

- `S` is the pass rate above, under the current scope, so running fewer challenges never raises it.
- Inputs, per row over its scored cells with cost: `wall` is wall seconds per item, `tps` the generation tokens per second (Σ tokens / Σ decode seconds over those cells, a cell's decode seconds being its tokens / its tok/s; a cell with no measured speed drops out), `tokens` the generation tokens per item, `mem` the peak memory in GB (maximum over those cells). Per-item figures divide by all items of those cells; cost is not split by core/stretch.
- Each `g = ε + (1 − ε)·u` with `ε = 0.05`. `u` is the input's log-min–max position over the pool, `(ln x − ln min) / (ln max − ln min)`, and is flipped to `1 − u` for the lower-is-better inputs (wall, tokens, mem); `tps` is higher-is-better. The floor keeps a worst-in-pool input from zeroing the product. When every row in the pool has the same value of an input, that input can't discriminate and is neutral (`g = 1`).
- The pool is the in-scope rows of the selected dataset (rows with a scored challenge under the current scope), before the row filters. Filtering never changes a row's efficiency; changing the scope or the dataset does, because min and max move.
- A row missing any cost input has no efficiency: it is not in the pool, shows `—`, and sorts last.

The webapp shows `E × 100` (`eff`) and sorts by it (the **Efficient** preset). On the default dataset the top of the ranking is gpt-oss-20b, gemma-4-26b-a4b-it and Cyber-Tiel-Coder-35B-A3B.

**Hardware.** Wall time and generation speed belong to the machine and runtime, not the model. The current data comes from one machine, so they are comparable. Once rows from several machines sit side by side, wall and tok/s rank hardware as much as models; whether to normalize them per machine, drop them, or pool by `hardwareId` is the main open question. Tokens per item and the score are machine-independent, and memory is nearly so.

**Re-tuning.** The exponents and `ε` were chosen with `scripts/efficiency-lab/`, an interactive page over the report rows (several formula families, sensitivity readouts, presets) plus its reference implementation `core.cjs`. Regenerate its data from `./bench report` and re-tune there as dependable data accumulates; see its README.

Ref: `withEfficiency` in `webapp/src/lib/model.ts`; `scripts/efficiency-lab/core.cjs`.

### Scope

Each item is `core` (short, practical work close to how local models are used) or `stretch` (solver-backed multi-step reasoning). An item's scope is its YAML `scope`, else `stretch` for the `economics`, `financial`, `trust` and `chains` challenges and `core` for every other challenge. Like `family` it is metadata: it enters no hash, and the report reads it from the dataset's release (`releases/<release>/challenges/`). Each cell carries `scopes`, the `[items, passed]` count per scope.

The default score counts both scopes; the Items control scores one. The drilldown shows `core X% · stretch Y%` over the selected cells.

### Failure kinds

Each cell carries `failureKinds`, the count of its sample lines per `failureKind` (see [Failure kind](#failure-kind)); passes are not counted. The drilldown sums them over the selected cells into a one-line "Failures" breakdown, most frequent first.

### Why binary `score === 1`

Constraint scorers produce arbitrary partial credit (`passed.length / total`); averaging those with `exact_match`'s `{0, 1}` outputs would reward "almost right" on a 4-constraint prompt the same as "fully right" on a 1-constraint one. The benchmark question is "did the model solve this?", not "how close did it get?". Partial credit stays in the archive and in `breakdown` for diagnosing why an item failed, but it never counts toward the pass rate.

Ref: `src/legacy/rows.ts`, `webapp/src/lib/model.ts`, `webapp/src/lib/stats.ts`.

## Report rows

`./bench report` selects the rows of each dataset (`src/legacy/rows.ts`, `src/report/v4-rows.ts`) into that dataset's snapshot, so a consumer only sums and displays. A dataset is what its manifest (`datasets/<name>.yaml`) lists, scored against its release's challenges at its eval version; it carries the release, the eval version, and the release's errata up to that version. Rows never mix datasets ([ARCHITECTURE.md § Report pipeline](./ARCHITECTURE.md#report-pipeline)).

**Challenge set.** The set is every challenge loadable from `releases/<release>/challenges/` at report time, with its current version, hash, and items. It is never inferred from the records.

**Rows.** A legacy row is one `configHash` on one machine (`hardwareId`). An item line belongs to the machine of the attempt that executed it. Attempts without a hardware profile (before schemaVersion 3) belong to the manifest's `legacy.hardware`. A v4 row is one config digest × hardwareId × contributor: rows from different contributors never merge.

**Selection (v4).** An execution counts only when its prompt is current: its `messagesDigest` equals the digest of the messages built from the release's prompt blob, the bundle's system prompt and the gold history (the check `./bench verify` makes). Any other execution is stale: it is not graded and never reaches a detail file. A dataset expresses complete runs: a cell (row × challenge) counts the executions of exactly one complete bundle, one run of the config on the challenge, never items pooled across runs, so a run that failed an item never borrows another run's success. A bundle is complete when it holds a current execution of every item of the challenge with the full sample set 0..k-1; the cell counts the row's most recently started complete bundle of the challenge (`run.startedAt`), a tie going to the lower bundle digest, with every sample it holds. An incomplete bundle (an interrupted run, or one with a stale execution) never counts, and with no complete bundle the cell is `not_run`. Each counted execution's score is our score record under the scorer digest in effect at the eval version. `sourceAttempts` holds the one bundle digest.

**Run skip.** `./bench run` skips a whole cell only when one sealed bundle in the store already holds, with no harness failure (an `error` other than the token-limit outcomes `context_exceeded` and `thinking_truncated`, which are held as results), every item × sample 0..k-1 under the current config digest, `hardwareId` and prompt (`messagesDigest`); nothing is pooled across bundles. Otherwise it runs the whole cell into a new bundle (or resumes the cell's open file, [ARCHIVE-FORMAT.md § Lifecycle](./ARCHIVE-FORMAT.md#lifecycle-open-to-sealed)), so a bundle's measurements are always those of one real run on one machine. `--no-skip` runs every cell (`src/store/store-index.ts`).

**Selection (legacy).** For each row and set challenge, the report pools the item lines of every completed attempt with the same `(configHash, challengeId)` whose `promptHash` equals the set item's current one, dropping retired lines: membership is by prompt, so a scorer change never makes a line stale. Per `(item, sample)` it keeps the line with the latest `executedAt`, preferring any executed line over an errored one (`error` set), then a copy graded by the item's current scorer over its original; an errored line counts only when the item has no executed line. The kept line is graded as [Legacy lines](#scorer-digest-and-score-records) describes. A replay collapses into its original, and a later single-sample replay cannot drop resamples. A line's **executor** is `cachedFrom.attemptId` when set, else the earliest-started attempt holding the identical line that started no later than the line's `executedAt`; the executor's header supplies its runtime version, git sha, and contributor (`submitter`; `unknown` when the header has none).

**Cells.** Each set challenge gets a cell with a status:

| Status | Meaning |
|---|---|
| `scored` | Every set item has a counted line |
| `stale_hash` | Legacy: no full coverage at the current item prompts, but a completed attempt of the challenge exists |
| `interrupted` | Legacy: only interrupted attempts exist (v4 has no such status: a challenge without a complete bundle is `not_run`) |
| `not_run` | No attempt exists |

A cell carries its items, passed (pass fractions), `families`, `scopes` and `scopeFamilies` counts, its cost (item-mean generation tokens and wall time summed, peak memory, generation speed as Σ generated tokens / Σ decode seconds over its sample lines, where a line's decode seconds are its tokens / its tok/s and a line with no measured speed — an error or aborted stream, recorded as 0 tok/s — contributes nothing; scored cells only), near-miss credit, failure kinds (per sample line), min/max samples per item, execution date range, runtime versions, git shas, executing attempts, and whether any executor was re-stamped. A non-`scored` cell counts 0 passed, and its items stay in every denominator.

**Row figures.** `passRate = Σ passed / Σ set items` — the formula above, so a missing or stale challenge counts as failed. `se` is the CR1 standard error over the row's families (`null` below 5); `scopes` gives the core/stretch split over the same denominator. `completeness` counts scored challenges and their items; `freshness` is the execution date range of the counted lines; `provenance` lists runtime versions, git shas, contributors (`submitters`), samples per item, and re-stamped cells, and sets `mixed` when the counted lines span more than one runtime version, more than one git sha (`unknown` counts), or more than 7 days. `variant` holds only the fields that differ among rows of the same `artifact` — runtime, quant, temperature, max tokens, system prompt, sampler knobs, template kwargs, chat template, weights digest (first 12 hex, `unknown` when unrecorded), machine — and `variantLabel` joins them (`t0.7 · topK 20`). The webapp shows each row's meta line as `runtime · quant · temp · <fields that differ among sibling configs>` (`omlx · 4bit · t0.7 · maxTokens 8192`), with the artifact and full line on hover (`VARIANT_FIELDS` in `src/legacy/rows.ts`, `webapp/src/lib/variant-line.ts`). `modelKey` groups the builds of one model: the artifact's last path segment, lower-cased, without an uploader's `org_` prefix or packaging tokens (`GGUF`, `MLX`, `4bit`, `MXFP4`, `Q4_K_M`…); a `configs.yaml` entry's `modelKey` overrides it for that artifact. `modelName` is the same name with case kept.

**Config versions.** A configId whose config changed has one row per config hash. The webapp shows each in the model's group as a variant row whose variant names what differs (`maxTokens 8192` vs `maxTokens 32768`); every version is listed and ranked.

**Ranked.** A dataset whose manifest sets `ranked: false` is listed without rank numbers or tiers.

## Item audit

`./bench audit` is a read-only check on the items themselves, not the models. It loads the completed attempts of a legacy archive from `--archive-dir`, keeps each config's latest attempt (by `startedAt`) per challenge, and scores each config's observation of an item as its pass fraction over that config's samples (0 or 1 with one sample; a sample passes when its score is exactly 1). Per item it prints the number of configs `n`, pass rate `p` (the mean of those fractions), Bernoulli spread `p(1-p)`, discrimination, flags, and the most common wrong answers over all failed samples. `--json` adds `samples` (sample lines across configs) and `passAllK` (pass^k: the fraction of configs with two or more samples that passed every one; `null` when no config resampled the item).

- **Discrimination** is the point-biserial correlation between the item's pass (or pass fraction) and each config's pass rate on all other items. High values mark items that separate strong configs from weak ones.
- **`suspect-key`**: `p <= 0.05` with `n >= --min-n` (default 8). A cluster of identical wrong answers is the signature of a wrong answer key. Wrong answers are normalized to the last number in the output (commas stripped), else the lowercased first 40 characters; empty output shows as `(empty)`.
- **`edge`**: the `--edge-top` (default 20) items with the highest discrimination among items with `n >= --min-n`. These are the candidates for targeted multi-sample re-runs; spending samples only on them keeps compute bounded: `./bench audit --flag edge --json` lists them, and `./bench run --samples k --items FILE` resamples just those.
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
| A correct tool call that passes an optional argument explicitly at its declared default | `0.75` — built into [`tool_calls`](#tool_calls), slip `explicit-default` |
| A correct answer in the wrong answer format, recovered only by a looser fallback reading (no `ANSWER:` marker; a submission outside its ```` ```<lang> ```` block) | `0.75` — a [format flaw](#format-flaws), slip `format-flaw` |

For generated challenges the solvers in `scripts/author/` compute each near-miss value from the same inputs as the key, and the generator refuses a near-miss pattern that matches the prompt text itself. Hand-written challenges declare them directly in YAML. A near miss changes scores, so adding one to an item of a frozen release is a scorer change and needs an erratum ([ERRATA.md](./ERRATA.md)); draft items change freely until the release is cut.

The headline pass rate stays binary — a near miss is not a pass (`score === 1` only). Partial credit is reported separately: the item line carries `failureKind: "near_miss"` and the `slip` in `nearMiss`, and each cell carries `nearMissCredit`, the sum of near-miss credit over its items. The drilldown shows the total over the selected cells; the list does not show it.

Ref: `src/schema/scorer.ts` (`ExactNearMiss`, `PatternNearMiss`), `src/scoring/exact-match.ts`, `src/scoring/constraint.ts`.

### Format flaws

A format flaw is a correct answer the scorer finds only through a looser fallback reading of the output than the prompt asked for. It earns `FORMAT_FLAW_CREDIT` (`0.75`) and carries `nearMiss: "format-flaw"`, so its `failureKind` is `near_miss` and it adds to `nearMissCredit` like any other near miss. A fallback never lifts a wrong answer: a fallback reading that is not fully correct leaves the primary result. One helper, `asFormatFlaw` (`src/scoring/score-result.ts`), applies the credit and tag for every scorer that has a fallback:

- `exact_match` with `fallbackExtract` — the answer without its marker (see [`exact_match`](#exact_match)).
- `code_exec` submission mode — a submission outside its ```` ```<lang> ```` block (see [Submission mode](#submission-mode)).

Answer markers are matched case-insensitively at full credit (`(?i)ANSWER:`): `Answer: 300` is the format asked for.

## Multi-turn items

A challenge item with `turns:` is a conversation of incremental questions. Each turn has its own prompt, scorer (`exact_match` or `constraint`), and `answer` — the gold assistant message. A turn may declare `nearMisses` exactly like a single-shot item. The loader expands the item into one scored unit per turn, `name#k`, and every unit is scored, audited, and counted toward the pass rate exactly like a single-shot item.

Turn `k` is sent with turns `1..k-1` and their **gold** answers as conversation history, never the model's own answers, so each turn measures one step and an early miss does not cascade. Loading fails if any gold answer does not score 1 under its own turn's scorer. The report detail file marks each turn with `prior_turn_passed` — whether the model's own answer to the previous turn passed in the same attempt — so recovery after a miss is visible.

Chains are draft content in `releases/draft/challenges/chains.yaml`, generated by `scripts/author/draft.ts` from the same solvers and scenarios as the single-shot batteries they decompose. Design: `docs/superpowers/specs/2026-11-16-multiturn-challenges-design.md`.

## Failure handling

Scorers return `Effect<PromptScore, ScorerNotFound | CodeExecTimeout | CodeExecFailed | ScorerSpawnFailed, CommandExecutor>` (`code_exec` absorbs its own `CodeExecTimeout`: a timeout of submitted code is the model's failure, scored 0). Errors do **not** become scores inside the scorer — they propagate on the error channel. Every score record goes through `scoreOrFold` (`src/scoring/dispatch.ts`) inside `scoreFields` (`src/scoring/rules.ts`), which folds an error into `{ score: 0, details: "scorer error: <tagged error>", failure: "scorer_error" }`.

Per-constraint evaluator errors are caught one level deeper: `scoreConstraints` wraps `evaluateConstraint` with `Effect.either` and routes thrown `ConstraintEvalError` into the `errored` bucket of the breakdown. The constraint scorer itself never fails on the error channel.

An item whose execution recorded an `error` is not scored; it records `score: 0`.

### Failure kind

Every scored item records a `failureKind` alongside its `score` — `null` on a full pass, otherwise why it fell short. `classifyFailure` (`src/scoring/failure-kind.ts`) derives it from the item's stored `error`, `stopReason`, `output`, and `reasoning` plus the scorer's `failure`; first matching rule wins:

| `failureKind` | Detected by |
|---|---|
| `thinking_truncated` | `error: "thinking_truncated"` (an inline `<think>` never closed), or `stopReason: "length"` with empty `output` and non-null `reasoning` (a split-reasoning runtime spent the budget thinking) |
| `context_exceeded` | `error: "context_exceeded"` — the server rejected the prompt as longer than the context window: llama-server HTTP 400 `exceed_context_size_error`, or oMLX HTTP 400 "Prompt too long: N tokens exceeds max context window of M tokens" (`stringifyLlmError`, `src/orchestration/run-prompt.ts`). The prompt is never truncated; the model cannot take it, so the item fails. It is held as a result, so the cell can be skipped (see Run skip); `--no-skip` reruns it, for example after raising `ctxSize` |
| `execution_error` | any other non-null `error` — transport failure, timeout, malformed or empty response |
| `near_miss` | a declared near miss set the score (`nearMiss`), however generation ended; the item line records the `slip` in `nearMiss` |
| `loop` | `stopReason: "loop"` — the repetition detector cancelled the stream |
| `length_cutoff` | `stopReason: "length"` otherwise — the answer was cut off by `maxTokens` |
| `scorer_error` | the scorer failed (`failure: "scorer_error"`) |
| `no_answer` | empty `output`, or the scorer found nothing to extract (`failure: "no_answer"`) |
| `wrong` | everything else, including partial credit |

The score is unaffected — every kind scores 0 (or its partial credit; `near_miss` scores its declared credit); `failureKind` records only why. Because the inputs are all on the execution line, a score record is a pure function of the execution and the scorer blob. Legacy archives that predate `stopReason` classify a cutoff with empty output as `no_answer`.

Ref: `src/errors/scorer.ts`, `src/scoring/dispatch.ts`, `src/scoring/failure-kind.ts`.

### Scoring rules version

`SCORING_RULES` (`src/scoring/rules.ts`) versions everything between an execution and its score that is not the item's own scorer config: output cleaning (an output that only echoes truncated reasoning is dropped), errored executions left unscored, scorer failures folded to `scorer_error`, and failure-kind classification. It enters every scorer blob (`{ config, rules, runner? }`, `runner` = the sandbox image for `code_exec` and `custom`), so a bump changes every scorer digest and needs an erratum covering every item of a frozen release. Rules 1 produced the alpha scores; rules 2 adds format-flaw partial credit and `fallbackExtract`, scores a `code_exec` timeout as a runtime failure, classifies `context_exceeded`, and runs code scorers in the sandbox.

The golden corpus `src/scoring/__fixtures__/rules-golden.json` guards it: `src/scoring/rules-golden.test.ts` runs each case (an execution plus a pure scorer config) through `scoreFields` and requires the results to equal the recorded `results`, and `history[SCORING_RULES]` to equal the SHA-256 of their `stableStringify`. To change the rules:

1. Bump `SCORING_RULES` and describe the new version in its doc comment and here.
2. Run `UPDATE_RULES_GOLDEN=1 npx vitest run src/scoring/rules-golden.test.ts`, which rewrites `results` and records the new `history` entry. It refuses to overwrite a recorded version's entry unless the earlier results are unchanged (cases only appended), so adding cases needs no bump.
3. Review the `results` diff and record an erratum for each frozen release ([ERRATA.md](./ERRATA.md)).

## Scorer digest and score records

**Scorer blob and digest.** An item's scorer is identified by the bytes of its scorer blob, `stableStringify({ config, rules, runner? })` (`scorerBlob`, `src/scoring/rules.ts`), and its **scorer digest** is the SHA-256 of those bytes. `config` is the item's scorer config; a `custom` scorer's config carries its script source inline (`source`), so editing the script changes the digest. `rules` is `SCORING_RULES`. `runner` is `SANDBOX_IMAGE` and appears only for `code_exec` and `custom`, so a new sandbox image changes exactly the code items' digests. A release keeps every scorer blob it has used in `releases/<release>/blobs/<digest>`, so any eval version can be re-scored without git history.

**Eval versions.** An eval version is `<release>.<n>`: the release plus its first n errata ([ERRATA.md § Versions](./ERRATA.md#versions) owns the numbering). The scorer digest that grades an item at eval version n is the one recorded by the latest erratum ≤ n that names the item, else `release.json`'s (`scorerDigestAt`, `src/release/release.ts`); a draft has no eval version and grades with `release.json`'s. Every scorer-changing erratum records `scorers: { "<challenge>/<item>": <scorerDigest> }`, and `npm test` fails when an item's latest recorded digest differs from the one its challenge resolves to ([ERRATA.md](./ERRATA.md)).

**Score records.** A score record is `{ execution, scorer, score, failureKind, details, nearMiss, breakdown, harnessGitSha, scoredAt }`: our grade of one execution (by its execution digest) under one scorer digest, appended to `store/scores/<bundleDigest>.jsonl` ([ARCHIVE-FORMAT.md § Score log](./ARCHIVE-FORMAT.md#score-log)). It is a pure function of the execution and the scorer blob (`scoreRecord`), so recomputing it gives the same grade; two records for one (`execution`, `scorer`) that disagree on any graded field mean a nondeterministic scorer, and the snapshot build fails naming the item. Grading never edits a bundle and never rewrites a record: a rules or scorer change adds records under a new scorer digest beside the old ones.

**`./bench run`** scores each sealed bundle's executions with the challenge's current scorers and appends the records.

**`./bench score --dataset <name>`** appends, for every bundle a v4 manifest lists, the records its eval version needs and the log lacks, and prints how many it appended and how many were already present. Each execution is graded by the blob `scorerDigestAt` names in the manifest's release; a blob whose `rules` differ from this harness's `SCORING_RULES`, a blob that does not re-hash to its digest, a bundle of another release, and an item the release does not hold are errors. The snapshot build needs a record for every execution at the dataset's eval version and fails naming `./bench score --dataset <name>` otherwise.

**Legacy lines.** A counted legacy line is graded through the score log, `<store>/scores/legacy.jsonl`, keyed by its legacy execution digest, the SHA-256 of `stableStringify({ configHash, challengeId, itemId, promptHash, sample, executedAt, output, reasoning, error, stopReason })` (`src/legacy/regrade.ts`); every copy of one execution shares it. Alpha is the legacy dataset (the draft is v4, converted under [Provenance before reuse](./GUARANTEES.md#provenance-before-reuse)). Alpha is closed and archival: a line whose 12-hex `scorerHash` is its item's current one keeps its stored `score` and `failureKind` (Rules 1), any other is graded by the item's current scorer config, and the manifest's `rowsDigest` fails any build that would change alpha's rows. `./bench score --dataset <legacy name> [--legacy-root <dir>]` appends the records a dataset's counted lines lack, and `./bench report` fails on a missing one. Detail files show the graded score and the grading scorer. Release 0 is closed at eval version `0.7` (`closed: "0.7"` in its `release.json`): no further `0.n` errata, no new bundles.

Ref: `src/scoring/rules.ts`, `src/store/scores.ts`, `src/cli/commands/score.ts`, `src/release/release.ts`.

## `exact_match`

Operates on `result.output` (already cleaned of `<think>` and Harmony control tokens upstream — see [Dispatch](#dispatch)).

1. Compile `config.extract` as a global regex (a leading Python inline-flag group such as `(?i)` becomes a JS flag, as for constraint patterns) and collect every match against the output.
2. Take the **last** match (models commonly show work before the final answer). Prefer capture group 1; fall back to the whole match if the pattern has no group.
3. Strip commas from the extracted string (for `2,395,912`-style numerics).
4. Compare to `config.expected` with case-sensitive string equality. `1` on match.
5. Otherwise, the first `config.nearMisses` entry whose `expected` equals the extracted string scores its `credit` and names its `slip`; no entry matching scores `0`.

6. When `config.extract` matches nothing and `config.fallbackExtract` is set, steps 1–5 run with the fallback regex: a fully correct answer scores as a [format flaw](#format-flaws); anything else keeps the `no_answer` 0. The fallback is never consulted when `extract` matches.

No match and no-capture-group patterns both degrade to `score: 0` with a descriptive `details`; the scorer is total and has no failure channel.

The `extract` regex is defined by the `exact_match` scorer config on the inline challenge item (see [`CONFIG.md` § `challenges/*.yaml`](./CONFIG.md#challengesyaml)) and is only consulted by this scorer. Whole-number items use `(-?\d[\d,]*)(?:\.0+(?!\d))?` (`INT_EXTRACT` in `scripts/author/emit.ts`), behind a `(?i)ANSWER:` or JSON-key anchor where the prompt asks for one (an `ANSWER:` anchor pairs with the bare pattern as `fallbackExtract`): the capture spans thousands separators and a leading minus, and a zero decimal tail (`$1,331.00`) is consumed so the last match stays the integer. A bare `(\d+)` would read `1,331` as `331` and `1331.00` as `00`.

Ref: `src/scoring/exact-match.ts`. Reasoning extraction (the upstream pre-process this scorer relies on): `src/orchestration/run-prompt.ts::resolveOutputFields` and `src/scoring/strip-thinking.ts`.

## `constraint`

Iterate over `config.constraints`. For each, dispatch on the `check` discriminator to a pure predicate over `result.output` (already cleaned upstream — see [Dispatch](#dispatch)). Predicate → `true` adds the constraint's `name` to `passed`; `false` adds it to `failed`; a thrown exception (wrapped as `ConstraintEvalError`) adds it to `errored`. Final score is `passed.length / total`; an empty constraint list scores `0`.

When that score is below 1, each `config.nearMisses` entry is tried in order: the first whose `pattern` matches the output (same semantics as the `regex` check) and whose `credit` exceeds the score sets the score to `credit` and names its `slip`. The breakdown still lists the constraints as evaluated.

`errored` is kept distinct from `failed` — an evaluator that throws (e.g. malformed regex pattern) is not the same signal as a predicate returning false. The distinction surfaces via `breakdown`.

### Check catalog

21 check variants, ordered as declared in the `ConstraintDef` union.

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
| `json_matches` | The answer JSON deep-equals `value` (see [`json_matches`](#json_matches)). |
| `tool_calls` | The answer is a list of tool calls matching `value` as a multiset; may earn partial credit (see [`tool_calls`](#tool_calls)). |
| `numbered_lines` | Output has a line starting with `from` **and** a line starting with `to` (followed by `.`, `)`, `:`, or whitespace), in multiline mode. |
| `no_numbered_line` | Output has **no** line starting with `line` followed by `.`, `)`, `:`, or whitespace. |
| `numbered_line_exists` | Output **has** a line starting with `line` followed by `.`, `)`, `:`, or whitespace. |
| `line_count` | Count of non-empty trimmed lines equals `count`. |
| `word_count_exact` | Case-insensitive `\b<word>\b` match count equals `count`. |
| `all_lines_word_count` | Every non-empty trimmed line has between `min` and `max` whitespace-separated words (inclusive). |

JSON-reading checks other than `json_matches` all use the same fallback parser: try `JSON.parse(text.trim())`; on failure, the first fenced block; on failure, the first balanced `{...}` or `[...]` block (string-literal aware) that parses; return `null` otherwise. A `null` parse causes every JSON check to return `false` (not errored).

### `json_matches`

Grades a whole structured answer against a key (`value`), for extraction and reshaping items.

1. **Extract** the answer: the whole trimmed output if it parses; else the **last** fenced block (any language tag) that parses; else the **last** top-level balanced `{...}` or `[...]` block that parses (a parsed block's inner blocks are skipped). Last, like `exact_match`'s last match: a model that drafts or echoes a schema first states its answer at the end.
2. **Compare** by JSON deep equality:
   - Object key order is ignored; the key sets must be equal — a missing or extra key fails.
   - Array order matters.
   - Numbers compare by value after `JSON.parse`, so `12.5`, `12.50` and `1.25e1` are equal.
   - No type coercion: `"5"` ≠ `5`, `"true"` ≠ `true`, `null` ≠ `""`, and `null` ≠ a missing key.
   - Strings compare exactly — case, whitespace and Unicode form all count. Prompts state any canonical form (ISO dates, upper-case codes) the key uses.
3. A parsed JSON `null` is treated as no answer, so `value: null` is never a valid key.

It declares no near misses: a partial record is a wrong record. A pattern near miss on the item still applies as for any constraint item.

Ref: schema `src/schema/constraints.ts`, handlers `src/scoring/constraint-checks.ts`, dispatcher `src/scoring/constraint.ts`.

### `tool_calls`

Grades a tool-calling answer: the list of calls the model would make, or none. The prompt shows the tools as JSON Schema and asks for a JSON array of `{"name": ..., "arguments": {...}}` calls, or `[]` when no tool fits or a required value is missing.

```yaml
constraints:
  - name: calls
    check: tool_calls
    value:                                   # [] means: make no call
      - name: get_weather_forecast
        arguments:
          location: { oneOf: ["London", "London, UK"] }   # alternatives; a bare value is the only one
          days: 3
        optional: { units: celsius }          # unstated optionals and their declared defaults
        unordered: [fields]                   # array arguments compared as multisets
```

1. **Extract** the answer as `json_matches` does. Nothing parseable scores 0 with `failure: no_answer`; it is never a correct abstention. A bare call object counts as a one-element list. Anything else that is not a list of objects with exactly the keys `name` (a string) and `arguments` (an object) is a wrong answer.
2. **Abstention.** A `[]` key passes `[]` and fails any call.
3. **Count.** The number of calls must equal the key's.
4. **Match each call** against an expected one: the name is equal; every key argument is present and deep-equals the bare value or one of its `oneOf` alternatives; an argument outside the key's `arguments` must be in `optional` and equal its default; nothing else is allowed. Values compare as in `json_matches`: no string normalization and no type coercion (`"5"` ≠ `5`). Arrays are ordered unless the argument is listed in `unordered`.
5. **Assign.** Calls match as a multiset: a full search over assignments of expected to actual calls, never greedy, so overlapping alternatives cannot fail a correct answer. Among full matches the one with the fewest explicit defaults counts.
6. **Score.** `1` for a full match with no optional argument passed. `0.75` (`EXPLICIT_DEFAULT_CREDIT`) when the only departure is optional arguments passed explicitly at their defaults: the result carries `nearMiss: explicit-default`, so `failureKind` is `near_miss`, and the details name each such argument. `0` otherwise. The headline pass rate counts only 1.

`details` names each expected call's outcome: `matched`, `matched (explicit default <arg>)`, `wrong-arg <arg>=<value>`, `missing-arg <arg>`, `unexpected-arg <arg>`, or `missing`, plus `unexpected <name>` for a call to a tool the key never names, and the call counts when they differ.

Ref: `src/scoring/tool-calls.ts`; generated items in `scripts/author/next/toolcall.ts`.

## `code_exec`

1. Extract a Python snippet from `result.output` via `extractCode` (output is already cleaned upstream — see [Dispatch](#dispatch)): prefer a ```` ```python ```` or ```` ```py ```` fenced block; otherwise collect lines starting from the first `def`/`import`/`from` up to a prose-looking stop line (`^[A-Z][a-z].*[.:]$`); otherwise fall back to the whole trimmed output.
2. Build a program: `<extracted>\n\n<testCode>\nprint('ALL_TESTS_PASSED')\n`.
3. Run the program as `python3 -` (program on stdin) in the [isolated runner](#isolated-runner), with a 10-second limit (`DEFAULT_TIMEOUT_MS`).
4. Collect stdout, stderr, and exit code concurrently.
5. Classify:
   - Exit code `0` **and** stdout contains `ALL_TESTS_PASSED` → `{ score: 1.0, details: "all tests passed" }`.
   - Timeout (the in-container limit fired) → `{ score: 0.0, details: "timed out after <sec>s" }`, a runtime failure of the submitted code like an exception (`failureKind` `wrong`).
   - Runner unavailable → fail with `ScorerSpawnFailed`; any other launch failure → `CodeExecFailed`.
   - Exit `137` (killed: memory limit, or a program that ignored the timeout's SIGTERM) → `{ score: 0.0, details: "killed: …" }`.
   - Non-zero exit, no marker → `{ score: 0.0, details: "<classified failure>" }`, where the classifier inspects stderr for `AssertionError` / `SyntaxError` / `NameError` and reports the last stderr line (truncated to 120 chars), or falls back to a stdout snippet.

The typed failures — harness faults only — reach `scoreOrFold`, which folds them into a `scorer_error` 0. `code_exec` and `custom` are the only scorers with an `R` requirement (`CommandExecutor.CommandExecutor`), propagated through `scoreExecution`'s signature.

### Submission mode

An item with `submission: <lang>` (e.g. `sql`, `regex`) grades a non-Python answer. Step 1 becomes: take the first ```` ```<lang> ```` fenced block and bind it verbatim (trimmed) as the Python string `SUBMISSION`. Without one, the scorer reads, in order, the text after the tag on a ```` ```<lang> ```` fence line through the closing fence (```` ```regex ^PO-\d{6}$ ```` then ```` ``` ````), the first unlabeled ```` ``` ```` fence, or the whole trimmed output; a pass read any of these ways is a [format flaw](#format-flaws). The program is `SUBMISSION = "<answer>"` followed by the test code and the marker; the answer is never executed as Python. The test code decides pass or fail with assertions over `SUBMISSION` — for SQL it builds an in-memory `sqlite3` database and compares the submission's result set with the reference query's; for regex it runs `re.fullmatch` over held-out cases. Steps 2–5 are unchanged: same subprocess, timeout, and classification. A catastrophically backtracking regex times out, which scores 0 like any other timeout.

Ref: `src/scoring/code-exec.ts`, `src/scoring/extract-code.ts`.

## `custom`

A challenge-supplied Python scorer script (`script: <path>`, relative to the challenge file). Loading the challenge reads the script into the scorer config as `source`, so editing the script changes the scorer digest. The source runs in the [isolated runner](#isolated-runner) as `python3 -c <source>`; no file is mounted, so a scorer script is self-contained: it imports nothing beyond the Python 3.9 standard library and no sibling files. The harness writes `{ output, ...meta }` as JSON to stdin; the script prints `{ score, breakdown? }` JSON to stdout. The score is clamped to `[0, 1]`. Non-zero exit or unparseable stdout fails with `CodeExecFailed`; a timeout fails with `CodeExecTimeout` (the script is harness code, so it folds to `scorer_error`), and runner failures fail as for `code_exec`.

Ref: `src/scoring/custom.ts`.

## Isolated runner

`code_exec` programs and `custom` scripts are untrusted code — model output, or scorer scripts from a contributed archive — so they never run on the host. Each scorer call runs in a throwaway Docker container (`src/scoring/sandbox.ts`):

```
docker run --rm -i --name bench-scorer-<uuid> --network none --read-only
  --tmpfs /tmp:rw,size=16m --memory 256m --memory-swap 256m --cpus 1
  --pids-limit 64 --cap-drop ALL --security-opt no-new-privileges
  --user 65534:65534 [-v <script>:/scorer/score.py:ro] <SANDBOX_IMAGE>
  sh -c 'echo __SANDBOX_STARTED__ >&2; exec timeout -k 1 "$0" "$@"' <sec> python3 …
```

| Limit | Value |
|---|---|
| Network | none |
| Filesystem | read-only root; 16 MB writable `/tmp` tmpfs |
| Memory | 256 MB, no swap |
| CPU | 1 core |
| Processes | 64 |
| User | `nobody` (65534), all capabilities dropped, `no-new-privileges` |
| Time | in-container `timeout`: SIGTERM at the limit, SIGKILL 1 s later |

- **Image.** `SANDBOX_IMAGE` pins `python:3.9-slim` by digest (`python@sha256:2d97f6910b16bd338d3060f261f53f144965f755599aab1acda1e13cf1731b1b`, Python 3.9.25). Python 3.9 is the interpreter series that graded the archived scores. The image is pulled on first use; `docker pull` it ahead of a scoring run to keep the pull out of the time budget.
- **No host fallback.** The container prints a start sentinel to stderr before the payload runs. If the sentinel is missing — no `docker` binary, daemon unreachable, image unavailable — the scorer fails with `ScorerSpawnFailed`.
- **Time.** The limit is enforced inside the container, so container start-up does not consume it; `timeout` exit `124` becomes `CodeExecTimeout`. A host-side backstop of the limit plus 5 s (the in-container limit never fired) is a sandbox fault and yields `CodeExecFailed`. On host timeout or fiber interruption the container is force-removed (`docker rm -f`), so nothing outlives the scorer.
- **Output.** stdout and stderr are each captured up to 1 MB; the rest is drained and dropped.
- **Overhead.** Container start-up adds roughly 100–150 ms per call (about 130 ms per `code_exec` call against 18 ms for a bare host `python3`), more under concurrent load.

Ref: `src/scoring/sandbox.ts`.

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

All thresholds, weights, and division constants are byte-exact ports of the Python prototype's `game_scorers.py`, so they produce identical numbers.

Ref: `src/scoring/game.ts`.
