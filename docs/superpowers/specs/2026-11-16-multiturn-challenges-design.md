# Multi-turn challenges

A multi-turn item is a short conversation: an ordered list of turns, each with its own prompt and scorer. Complex math problems are decomposed into incremental questions ("show your work" by the structure of the questions), and each later turn tests whether the model can build on the correct answer to the earlier one.

## Schema

A challenge item carries either the single-shot fields (`prompt` + `scorer` + scorer config) or `turns`:

```yaml
- name: financial_amort_chain
  category: financial
  tier: 4
  tags: [financial-model, amortization, chain]
  turns:
    - prompt: "<scenario> … What is the scheduled monthly payment? …"
      answer: "386.66"            # gold assistant message
      scorer: constraint
      constraints: [{ name: equals 386.66, check: regex, pattern: "…" }]
    - prompt: "What is the outstanding balance immediately after the 12th payment? …"
      answer: "15230.33"
      scorer: constraint
      constraints: [...]
    - prompt: "In which month is the loan fully paid off? …"
      answer: "47"
      scorer: exact_match
      expected: "47"
      extract: "(\\d+)"
```

- `turns` has at least two entries. Each turn takes the `exact_match` or `constraint` scorer fields exactly as a single-shot item does.
- `answer` is the gold assistant message for that turn: the answer alone, in the format the turn asks for — never a fabricated chain of thought.
- Load fails unless every turn's `answer` scores `1` under that turn's own scorer. A gold message the scorer would reject is an authoring bug, and it would silently poison every later turn's history.
- `name`, `category`, `tier`, and `tags` belong to the item and apply to every turn.

## Expansion into scored units

The loader expands a multi-turn item into one resolved item per turn. Turn `k` (1-based) of item `name` resolves to:

| Field | Value |
|---|---|
| `itemId` / prompt `name` | `name#k` |
| `parentItemId` | `name` |
| `turn` | `k` |
| prompt `history` | turns `1..k-1` as alternating `user` (turn prompt) / `assistant` (gold `answer`) messages |
| prompt `promptText` | turn `k`'s prompt |

Every downstream consumer — runner, cache, archive, `bench score`, `bench audit`, the report — sees ordinary items. A turn is scored independently by its own scorer, and the headline pass rate stays binary per scored unit (`score === 1`), pooled over all units in the attempt.

## History construction (gold history)

Before turn `k` the request carries the system prompt, then turns `1..k-1` with the **gold** assistant answers, then turn `k`'s prompt:

```
system · user(t1) · assistant(gold a1) · user(t2) · assistant(gold a2) · … · user(tk)
```

The model's own earlier answers are never fed back. Each turn measures one step, and an early miss does not cascade into later scores. Because the history is gold, it is fixed at load time — the turns of a chain are independent requests and need no runtime state between them.

## Identity and cache

- **Turn 1** has no history; its `promptHash` is the ordinary `computePromptHash(prompt, systemText)`.
- **Turn k > 1** hashes the full conversation it is conditioned on: the conversation text is `stableStringify(messages)` over `[...history, { role: "user", content: prompt }]`, and `promptHash = computePromptHash(conversationText, systemText)`.
- `itemHash`, `challengeHash`, and `scorerHash` are derived from `promptHash` and the scorer exactly as for single-shot items.

Editing an earlier turn's prompt or gold answer therefore changes the `promptHash` (and `itemHash`) of every later turn. The cross-attempt cache — keyed by `itemHash` — can never serve a turn recorded under different history, and `bench score` treats the edit as prompt drift for those later turns.

## Archive shape

Each turn is one `ItemResult` line. Two optional fields mark turn units; single-shot lines omit both:

| Field | Type | Description |
|---|---|---|
| `parentItemId` | `string?` | The multi-turn item's `name`. |
| `turn` | `number?` | 1-based turn index. |

The prompt blob `content/prompts/<promptHash>.txt` holds exactly the hash preimage's prompt part: the plain prompt for turn 1, the conversation JSON (`stableStringify(messages)`) for later turns. The store stays self-sufficient: reconstruction recovers the full conversation a turn was asked under.

## Report treatment

- `data.js` is unchanged: `item_count` / `passed_items` / `score` count turn units like any other item.
- The per-attempt detail file carries `parent_item_id` and `turn` on turn units, plus `prior_turn_passed`: whether the model's own answer to turn `k-1` in the same attempt scored `1` (`null` on turn 1 and single-shot items). It is derived from the archived scores at report time rather than stored, so it always agrees with the current (possibly re-scored) scores. "Recovered from own mistake" is `prior_turn_passed === false && score === 1`.
