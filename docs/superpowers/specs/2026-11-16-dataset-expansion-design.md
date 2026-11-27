# Dataset expansion

> Design record (2026-11-16). Not maintained; current behavior is in [docs/](../../) — see [SCORING.md § Scope](../../SCORING.md#scope) and [CONFIG.md](../../CONFIG.md).

## Scope

This benchmark measures how well a model, served locally on one workstation, does the bounded and checkable text work people hand to local models. That work is pulling structure out of text, following format rules, transforming data, writing small pieces of code, SQL and regex, and doing arithmetic over dates and units. A smaller stretch tier of multi-step quantitative reasoning exercises frontier models. Every item is graded programmatically, with no LLM judge.

The ranking reflects these priorities and this item mix. It is one general-purpose eval, not an authoritative ordering of models. It does not measure open-ended writing quality, breadth of world knowledge, safety, or agentic work in a live environment. Native tool calling through a runtime's API is also out of scope, because it measures the runtime as much as the model. Results describe a model on a stack (backend, quantization, template), not the model alone.

Expansion favours **breadth**: each category below gets enough families that its pass rate means something. Items are not selected by how well they separate the top configs.

## Coverage map

*Core* items are the local-model sweet spot: short, practical, and close to how these models are used. *Stretch* items are solver-backed reasoning that frontier models still miss. Each item carries a `core` or `stretch` tag. The headline counts both, and the report shows the pass rate per tag.

| Category | Tier | Measures | Grader | Generator (exact key) | Near misses | Today |
|---|---|---|---|---|---|---|
| Structured extraction | core | Pull fields from messy prose (invoice, email, ticket) into a given JSON schema | `constraint` + new `json_matches` check | Seeded record → templated prose. The key is the record. | None at launch | `constraint_json*` (3 items, hand-written) |
| Verifiable instructions | core | IFEval-style stacked format rules | `constraint`, existing 20 checks | Seeded composer draws 2–4 compatible checks with parameters and screens out conflicts | None. The constraint fraction is already reported. | `constraint.yaml` (10, hand-written) |
| Data transformation | core | Aggregate, filter or reshape CSV, JSON and log text | `exact_match` for scalars, `ordered_match` for ranked lists, `json_matches` for reshaped output | Seeded table and log generator. A TS reference computes the key. | None. Window edges and header rows are stated, so a miss is conceptual. | Missing |
| Code edits | core | Fix a bug so the given tests pass | `code_exec` | Seeded single mutation (operator, bound, default) of a reference function in `challenges/code_*`. Screened so the mutant fails at least one test. | None | `code.yaml` (12, hand-written) |
| SQL | core | Write a query against a stated schema | `code_exec` in submission mode | Seeded SQLite schema and rows. The test code runs the model's query and the reference query on the same DB and compares rows, so no key is stored. | None | Missing |
| Regex authoring | core | Write a pattern from a spec and examples | `code_exec` in submission mode | Seeded pattern family (dates, IDs, IPs). The prompt shows labeled cases, and held-out cases live only in the test code. | None | Missing |
| Function-call formatting | core | Choose a tool from given schemas and emit `{name, arguments}` | `json_matches` | Seeded tool catalog with distractor tools, plus request templates. The key is the sampled call. | None at launch | Missing |
| Date and unit arithmetic | core | Day counts, business days, weekday offsets, exact conversions | `exact_match` | Seeded dates and quantities. The key comes from UTC `Date` math or rational conversion. | Rounding slip 0.5 | Partial (`math_*`) |
| Classification | core | Label text against a fixed label set | `exact_match`, or `set_match` for multi-label | The label is the generator's input. Each label has a template pool, screened so that no single keyword decides the label. | None | Missing |
| Long-context retrieval | core at 8K, stretch at 32K | Find or count facts in a generated haystack, including NoLiMa-style questions with no lexical overlap | `exact_match` | Seeded filler records with needles at sampled depths. The key is the planted fact or count. | None | Missing |
| Multi-turn follow-ups | core | Incremental edits ("now sort by date", "drop rows where…") | Per-turn `exact_match` or `constraint` | Chains over data-transformation and extraction items, built from gold history | Per turn | `chains.yaml` (3, stretch) |
| Economics, financial, trust | stretch | Equilibria, waterfalls, amortization, belief updating | `exact_match` | `econ.ts`, `financial.ts`, `repeated.ts`, `webOfTrust.ts` | Existing slips | 87 items |
| Chains | stretch | Multi-step quantitative state | Per turn | `draft.ts` | Per turn | 3 chains |
| New hard scenarios | stretch | Stackelberg leadership, two-period waterfall with OC diversion, adjustable-rate amortization, Bayesian trust with decay, grim trigger with detection lag | `exact_match`, plus chains | Solvers in `econ.ts`, `financial.ts` and `repeated.ts` (closed forms already derived) | Round-at-end 0.5, truncated 0.5. A conceptual slip earns 0. | Missing |

**Irrelevant-clause axis.** Every sampler can add one numeric but irrelevant sentence. The solver confirms that the key is unchanged. Variants with and without the clause share a family, so robustness to the clause shows up as a within-family contrast (GSM-NoOp).

**Existing suites outside the map.** `logic` and `math` are classic puzzles with a high contamination risk. They stay under the retirement rule but are not expanded, and the date and unit generators replace their growth. `factual` measures recall and `effect-ts` measures recall of a library API that changes between versions. Both stay as they are, with hand-written keys and no expansion. `smoke` is unchanged.

### Minimal grader additions

- **`json_matches` constraint check.** It parses the output as a whole, or else the last fenced `json` block, or else the last balanced `{…}` or `[…]` block, and deep-equals the result to `value`. Key order is ignored, and types are compared strictly. The existing JSON fallback only finds flat `{[^{}]*}` blocks, so it cannot read nested records.
- **`code_exec` submission mode.** `submission: <lang>` binds the first fenced `<lang>` block to the Python string `SUBMISSION` instead of executing it. One mode covers both SQL (`sqlite3` is in the Python stdlib) and regex (`re`). Pass, fail and timeout keep their current semantics.

Each addition is a scorer change, and it ships with its erratum and tests.

## Seeded variants

Every generated family in `scripts/author/` is a **sampler** paired with a screen. `sample(rng) → params` draws over the family's variation axes. `screen(params) → reason | null` rejects degenerate draws: the existing interior and uniqueness checks for solvers, and mutants that pass every test or haystacks where the needle collides with the filler for the new categories. Each new core category is one author module, emitted through `emit.ts` from `draft.ts`.

- **Seeds.** `mulberry32(hash(family, seed))`. A rejected draw redraws from the same stream, so a seed always yields the same item. Seed `0` is today's item under today's name, which preserves history. A variant is named `<item>_s<seed>` and carries `family: <scenario>` and `seed: <n>` as metadata outside every hash. The family is the clustering unit for uncertainty.
- **Answer screens.** The key must differ from every number in the prompt. Each near miss must differ from the key, from the other near misses, and from the prompt text.
- **Determinism.** A test regenerates every family at its pinned seeds and expects an empty `git diff challenges/`.
- **Errata.** Variants are ordinary items. New seeds are `added` errata (`pending-next-release`) and dropped seeds are `retired`. A generator change that alters a prompt is prompt drift, which the coverage check catches. A wrong solver key is one `answer-key` erratum listing every affected variant.

## Retirement

Keep any item with at least one failure across the tested configs. Drop only zero-failure items, found with `./bench audit --flag zero-failure`, each with a `retired` erratum. `smoke` is exempt. Saturation alone does not retire an item, because items that only the lower half fails still describe the lower half.

## What the statistics can and can't tell you

Uncertainty is CR1 clustered by family and paired between configs. Today the median paired SE is 3.4 points and 66 of 67 adjacent pairs are statistically tied. The confidence intervals separate **tiers** of models, such as frontier, strong local and small local, but not adjacent ranks. More families shrink the SE roughly as 1/√(independent families), so breadth also tightens the tiers. A family's 4th and 5th variants add little, so new families beat new seeds of an old family. There is no item-count target. Coverage drives growth, and close neighbours keep showing as `≈N`.

## Pilot workflow and sequencing

1. **Build.** Write the samplers, screens and the two grader additions. Seed 0 must regenerate byte-identically.
2. **Pilot.** Generate into `releases/draft/challenges/` and run `./bench run` on about 5 fast configs that span the tiers. The draft is the complete upcoming release: every kept release-0 suite, carried unchanged, plus the new sets. A cell the store already holds a complete, prompt-current bundle for is skipped; every other cell runs whole, and the `draft` dataset scores the full set.
3. **Screen per family.** Every gold answer must score 1 under its own grader. Hand-label a sample of about 20 outputs per new grader to measure false passes and false fails. A family that every config passes stays: the benchmark measures how well models do this work, not how often they can be made to fail. Families every config fails go through `./bench audit` for suspect keys. If the key is sound, the failure stands.
4. **Release.** Draw **fresh** public seeds for the surviving families, so the pilot's selection does not carry into released items. Add the `added` and `retired` errata and cut the release with `./bench release commit`. A release changes challenge hashes and costs one full sweep, so additions are batched.

## First pilot batch

The batch is 8 sets, 3 seeds per family unless noted, about 80 items in total. On 5 fast configs that is about 400 calls, a few hours including 32K prefill.

| # | Set | Tier | Families | Items |
|---|---|---|---|---|
| P1 | Extraction to JSON | core | invoice, contact card, ticket triage (4 seeds) | 12 |
| P2 | IFEval composer | core | 2-, 3- and 4-constraint stacks, plus format-switch (4 families) | 12 |
| P3 | Log and CSV transformation | core | status-code counts per endpoint, group-by sum, top-k ranked list (4 seeds) | 12 |
| P4 | SQL by execution | core | filter + aggregate, join, group-by + having | 9 |
| P5 | Regex authoring | core | ISO dates, order IDs, IPv4 | 9 |
| P6 | Date and unit arithmetic | core | days between, add N business days, exact unit conversion (4 seeds) | 12 |
| P7 | Long-context retrieval | core and stretch | literal needle, non-lexical needle + count; 8K and 32K (2 seeds) | 8 |
| P8 | Stretch scenarios | stretch | Stackelberg leadership, grim trigger with detection lag | 6 |

## Second pilot batch

The second batch reuses the first batch's graders. It is 4 core sets of 4 families × 3 seeds, plus 3 more stretch scenarios.

| # | Set | Tier | Families | Items |
|---|---|---|---|---|
| Q1 | Function-call formatting (`toolcall`) | core | required arguments, near-duplicate tools, optional arguments left out, type fidelity | 12 |
| Q2 | Classification (`classify`) | core | ticket intent, sentiment with mixed cues, topic tags (`set_match`), priority from stated facts | 12 |
| Q3 | Code edits (`codefix`) | core | binary search, max window sum, merge intervals, paginate; single-token mutants of fresh reference functions | 12 |
| Q4 | Multi-turn follow-ups (`followups`) | core | invoice, orders, sessions, access log; 3-turn chains from gold history | 12 |
| Q5 | Stretch scenarios | stretch | Bayesian trust with decay, adjustable-rate amortization, two-period waterfall with OC diversion; 2 seeds and 1 chain each | 9 |

- **Classification screens.** Each item includes a cue for a label it doesn't have, and is redrawn until counting cue words gives the wrong label. That baseline's answer is the item's planted wrong answer.
- **Code-edit screens.** A mutant is kept only if it compiles, finishes within the time limit, and fails a shown test. The reference must pass every shown and held-out test. The screen runs in the scorer's sandbox, so regenerating `codefix` needs Docker.
- **Code-edit references.** They are written fresh rather than taken from `challenges/code_*`, so the draft doesn't overlap release 0.
