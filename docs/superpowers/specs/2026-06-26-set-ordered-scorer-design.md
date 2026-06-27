# Set & ordered-sequence scorers — design

## Problem

New benchmark challenges grade answers that are a **set** (e.g. which actors are
colluding, the members of a currency-arbitrage cycle) or an **ordered sequence**
(e.g. the order firms default in a contagion cascade, the strongest trust path
through a graph). The existing scorers grade a single token/number
(`exact_match`), boolean constraint checks (`constraint`), a Python subprocess
(`code_exec`), or game telemetry (`game`). None can grade a multi-entity answer,
and crucially none award **partial credit** — but a partially-correct set or a
nearly-correct ordering is genuinely informative and must score between 0 and 1.

## Decision: two scorer types, not one parameterized type

Add two new members to the `ScorerConfig` / `ChallengeItem` discriminated
unions: **`set_match`** and **`ordered_match`**.

Rejected alternative: a single `entity_match` type with a `mode: "set" |
"ordered"` field. Reasons to keep them separate:

- The whole codebase discriminates scorers by the `type`/`scorer` literal, and
  the `resolveScorer` (`src/config/challenges.ts`) and `scoreByConfig`
  (`src/scoring/dispatch.ts`) switches get compile-time exhaustiveness from it.
  Two literals is the idiomatic fit; a `mode` field re-introduces a second,
  hand-checked discriminator.
- The `expected` field carries different semantics: an **unordered set** vs an
  **ordered sequence**. Two types document that in the schema instead of in
  prose.
- Authored YAML reads as intent: `scorer: set_match` vs `scorer: ordered_match`.

The two scorers share extraction and matching logic — that is a *code-sharing*
concern (one shared `entities.ts` helper), not a schema-shape concern. The
schema stays explicit; the parsing is DRY.

## scorerParams contract (the config shape)

Both config structs use **typed fields**, matching `exact_match`/`constraint`
(typed) rather than `game`'s opaque `scorerParams: Record`. An untyped bag would
hide the vocabulary/expected contract from schema validation and from the
challenge-authoring docs. The fields are identical across the two types:

```
set_match | ordered_match:
  vocabulary:    string[]   # required, non-empty. The closed set of known
                            #   entity names. Extraction only ever recognises
                            #   tokens from this list, which makes parsing prose
                            #   robust to surrounding noise.
  expected:      string[]   # required, non-empty. The gold answer.
                            #   set_match:     the expected set (order ignored).
                            #   ordered_match: the expected sequence (order matters).
                            #   Every element must appear in `vocabulary`.
  caseSensitive: boolean    # optional, default false. Controls entity matching.
```

The on-disk (flat `ChallengeItem`) shape and the resolved (nested
`ScorerConfig`) shape are identical — there is no companion-file resolution as
with `code_exec`, so `resolveScorer` just copies the fields through.

### Load-time validation (fail loud, like `detectUnknownConstraintCheck`)

`resolveScorer` rejects a misconfigured item with `ConfigError` when:

- `vocabulary` is empty, or `expected` is empty;
- `expected` contains a duplicate;
- `expected` contains a token **not** in `vocabulary`.

The subset rule matters: an `expected` token outside the vocabulary can never be
matched in a response, so it would silently cap recall below 1 and make the item
**unwinnable** (no model could ever score 1.0). Failing at load surfaces the
authoring bug immediately.

## Answer extraction (prose → set / sequence)

The model emits prose. For each token in `vocabulary` we test whether it appears
in the response as a **whole word**, case-insensitively by default:

- The token is escaped and internal whitespace is relaxed to `\s+` (so
  `"Bank A"` matches `"Bank   A"` across a line break).
- The match is bounded by `(?<!\w) … (?!\w)` so a token never matches as a
  substring of a longer word (mirrors `wholeWordPattern` in
  `scripts/author/emit.ts`).
- Case-insensitive uses the JS `i` flag (the scorer controls its own `RegExp`,
  unlike the `constraint` scorer which only exposes `dotall`).

From the matches we derive:

- **set_match** → the **set** of vocabulary tokens that occur at least once.
- **ordered_match** → the **sequence** of vocabulary tokens ordered by the
  index of their **first occurrence** in the response; deduplicated keeping the
  first occurrence. This is how an order is recovered from prose.

A token the model names that is **not** in the vocabulary is ignored — the
vocabulary is the closed world. This is deliberate: it anchors parsing and keeps
the model from gaming the scorer with synonyms or noise.

## Partial credit — `set_match`: F1

Let `E` = expected set, `P` = predicted set (vocabulary tokens found),
`TP = |P ∩ E|`.

```
precision = TP / |P|            (0 when |P| = 0)
recall    = TP / |E|            (0 when |E| = 0)
F1        = 2·TP / (|P| + |E|)  (1 when |P| = |E| = 0)
score     = F1
```

`F1 = 1` **iff** `P == E` — exactly the "all and only" full-credit rule. Naming
an extra wrong entity lowers precision; missing an expected one lowers recall;
F1 balances the two. The closed-form `2·TP / (|P| + |E|)` is used directly and
cleanly handles the empty-prediction case (`TP = 0 → 0`).

Chosen over **Jaccard** (`TP / |P ∪ E|`): both hit 1 iff the sets are equal and
0 iff disjoint, but F1 is the standard set-retrieval partial-credit metric, is
slightly more forgiving in the middle, and decomposes into precision/recall for
a legible `details` string.

### Worked examples (E = {A, B, C})

| Response yields P | TP | precision | recall | F1 |
|---|---|---|---|---|
| {A, B, C} | 3 | 1.00 | 1.00 | **1.00** |
| {A, B} | 2 | 1.00 | 0.67 | **0.80** |
| {A, B, C, D} (D extra) | 3 | 0.75 | 1.00 | **0.857** |
| {A, D} | 1 | 0.50 | 0.33 | **0.40** |
| {} (empty answer) | 0 | 0 | 0 | **0.00** |
| {D, E} (all wrong) | 0 | 0 | 0 | **0.00** |

## Partial credit — `ordered_match`: LCS ratio

Let `P`, `E` be the predicted and expected **sequences**, and `LCS(P, E)` the
length of their longest common (order-preserving, not necessarily contiguous)
subsequence.

```
score = |LCS(P, E)| / max(|P|, |E|)      (1 when |P| = |E| = 0)
```

`score = 1` **iff** `P == E` exactly (all and only, in order). The `max`
denominator penalizes **both** failure modes: missing expected elements shrink
the LCS, and extra/wrong predicted elements grow the denominator.

Chosen over **Kendall-tau** and **fraction-of-correct-adjacent-pairs** because
prose extraction routinely yields a predicted sequence that is **not a clean
permutation** of `expected` (it can miss elements or include extras). Kendall-tau
is defined only over a shared element set / permutations and is awkward
otherwise; adjacent-pair fraction is degenerate for length-1 answers and doesn't
cleanly express "all and only". LCS handles unequal-length sequences natively.

### Worked examples (E = [A, B, C, D], |E| = 4)

| Predicted P | LCS | max(\|P\|,\|E\|) | score |
|---|---|---|---|
| [A, B, C, D] | 4 | 4 | **1.00** |
| [A, B, D] (missing C) | 3 | 4 | **0.75** |
| [A, C, B, D] (one swap) | 3 | 4 | **0.75** |
| [D, C, B, A] (reversed) | 1 | 4 | **0.25** |
| [A, B, C, D, X] (extra) | 4 | 5 | **0.80** |
| [] (empty answer) | 0 | 4 | **0.00** |
| [B, A] (subset, wrong order) | 1 | 4 | **0.25** |

## Edge cases (both scorers)

- **Empty answer** (no vocabulary token found): `P` is empty → F1 = 0 / LCS
  ratio = 0 (against a non-empty `E`).
- **Duplicates in the response**: collapsed to set membership (`set_match`) or
  first-occurrence (`ordered_match`); a repeated entity counts once.
- **Non-vocabulary token named**: ignored (closed-world vocabulary).
- **Ties in first-occurrence index** (`ordered_match`): each token has a single
  first-occurrence index; two *distinct* tokens cannot share a start index, so
  ordering is total. If matching is ever ambiguous, vocabulary order is the
  stable tiebreak.
- **Both sides empty** (degenerate, blocked by load-time validation but defined
  anyway): score = 1.

## Files touched

- `src/schema/enums.ts` — add `set_match`, `ordered_match` to `ScorerType`.
- `src/schema/scorer.ts` — `SetMatchConfig`, `OrderedMatchConfig`; extend
  `ScorerConfig` union.
- `src/schema/challenge.ts` — `SetMatchItem`, `OrderedMatchItem`; extend
  `ChallengeItem` union.
- `src/config/challenges.ts` — two `resolveScorer` cases + load-time validation.
- `src/scoring/entities.ts` — shared extraction (prose → set / sequence).
- `src/scoring/set-match.ts` — F1 scorer.
- `src/scoring/ordered-match.ts` — LCS-ratio scorer.
- `src/scoring/dispatch.ts` — two `scoreByConfig` cases.
- `scripts/author/emit.ts` — `setItem`, `orderedItem` author helpers.
- Tests alongside each new module.
```
