# Configuration

> _Last verified: 2026-04-19 against commit `eae465c`._

All YAML config is loaded and decoded at startup (see [`GUARANTEES.md` § Fail-fast config](./GUARANTEES.md#fail-fast-config)). Any decode error aborts before any LLM call is made.

## `models.yaml`

Registry of models the harness can run. Top-level is a YAML array; each element is a `ModelConfig`.

```yaml
- artifact: mlx-community/Qwen2.5-7B-Instruct-4bit
  runtime: mlx
  name: Qwen 2.5 7B Instruct
  quant: 4bit
  params: 7B
  active: false
```

| Field | Required | Notes |
|---|---|---|
| `artifact` | yes | Repo/path passed to the runtime. Part of the cache key. |
| `runtime` | yes | `"llamacpp"` or `"mlx"`. |
| `name` | no | Display name; falls back to derivation from `artifact`. |
| `quant` | no | Quantization tag (e.g. `Q4_K_M`, `4bit`); derived when omitted. |
| `params` | no | Parameter count tag (e.g. `32B`, `80B-A3B`); derived when omitted. |
| `ctxSize` | no | `--ctx-size` flag for the prompt phase. |
| `scenarioCtxSize` | no | `--ctx-size` flag for the scenario phase. If different from `ctxSize`, the server restarts between phases. |
| `active` | no | Defaults to `true`; set `false` to skip without deleting the entry. |

Explicit `name` / `quant` / `params` always win over artifact-derived values. Cross-run cache validity is keyed on `(artifact, promptName, promptHash, temperature)`; `runtime` and `quant` are denormalized into each `ExecutionResult` but are not part of the cache key.

Ref: schema `src/schema/model.ts`, loader `src/config/models.ts`.

## `prompts/*.yaml`

One file per prompt. Every `*.yaml` directly under `prompts/` (excluding `system-prompts.yaml` and the `scenarios/` subdir) is loaded as a single entry. The on-disk shape is flat; the loader nests it into a `PromptCorpusEntry` with a discriminated-union `scorer`.

```yaml
name: math_multiply_direct
category: math
tier: 1
system: direct
prompt: What is 47 * 89? Reply with just the number.
scorer: exact_match
expected: '4183'
extract: (\d[\d,]*)
```

| Field | Required | Notes |
|---|---|---|
| `name` | yes | Unique across the corpus. Becomes the row's `promptName`. |
| `category` | yes | Free-form grouping label (e.g. `math`, `code`, `constraint`). |
| `tier` | yes | Integer difficulty tier. |
| `system` | yes | Key into `system-prompts.yaml`; resolved to full text at load. |
| `prompt` | yes | User-message text shown to the model. |
| `scorer` | yes | One of `exact_match`, `constraint`, `code_exec`, `game`. Each variant pulls additional required fields (see below). |

Per-scorer extras, all required for their variant:

- `exact_match` — `expected: string`, `extract: string` (regex with one capture group).
- `constraint` — `constraints: ConstraintDef[]` (each has `check`, `name`, plus per-check payload).
- `code_exec` — `testFile: string` (path relative to `prompts/`; file contents are read and embedded as `testCode`).
- `game` — `gameScorer: string`, `scorerParams: Record<string, unknown>`.

**Loader behavior:**
- `promptHash` is computed as `sha256(prompt + "|" + resolvedSystemText)[:12]` and embedded in the corpus entry; changing either the prompt text or the resolved system prompt invalidates the cross-run cache.
- Unknown `system:` key fails with `UnknownSystemPrompt` (surfaces available keys).
- For `scorer: constraint`, unknown `check:` discriminators are pre-validated against the 20-literal `ConstraintCheck` set *before* schema decode, so the error is `UnknownConstraintCheck` rather than a generic `SchemaDecodeError`.
- Files are processed in sorted filename order; duplicate `name` across two files fails fast with `ConfigError` citing both paths.
- `code_exec` `testFile` is resolved relative to the `prompts/` directory and read at load time; a missing file fails with `ConfigError`.

Ref: schema `src/schema/prompt.ts`, `src/schema/scorer.ts`, `src/schema/constraints.ts`; loader `src/config/prompt-corpus.ts`. For the 20 constraint checks and the 14 game scorers, see [`SCORING.md`](./SCORING.md).

## `prompts/scenarios/*.yaml`

One file per scenario. Every `*.yaml` under `prompts/scenarios/` is loaded as a `ScenarioCorpusEntry`. Each file has a companion `.md` directive file referenced by `scenarioMd`.

```yaml
name: market_buy_sell
fixture: benchmark
scenarioMd: market_buy_sell.md
players:
  - id: bench_trader
    controlledBy: llm
scorer: market_buy_sell
scorerParams: {}
tier: 1
cutoffs:
  wallClockSec: 300
  totalTokens: 100000
  toolCalls: 150
```

| Field | Required | Notes |
|---|---|---|
| `name` | yes | Unique across the scenario corpus. |
| `fixture` | yes | Game-engine fixture key. |
| `scenarioMd` | yes | Filename (relative to `prompts/scenarios/`); contents embedded as `scenarioMd` in the corpus entry. |
| `players` | yes | Array of `{ id, controlledBy: "llm" \| "npc" }`. |
| `scorer` | yes | Game scorer registry key; resolved at scoring time, not load time. |
| `scorerParams` | yes | Per-scorer record; `{}` when the scorer takes none. |
| `tier` | yes | Integer difficulty tier. |
| `cutoffs` | yes | `{ wallClockSec, totalTokens, toolCalls }` — all three enforced by the cutoff watchdog; `wallClockSec` is also raced by a fiber. |

**Loader behavior:**
- `scenarioHash` is computed at load time as `sha256(fixture|scorer|sortedScorerParams|players|cutoffs)[:12]`; `name` is deliberately excluded so renaming a scenario does not invalidate historical cache entries.
- Duplicate `name` across files fails fast with `ConfigError` citing both paths.
- Missing or unreadable `scenarioMd` fails with `ConfigError` carrying the resolved path.
- Unlike prompts, there is no registry validation for `scorer:` at load time — the string is resolved against the scorer registry when a run starts.

Ref: schema `src/schema/scenario.ts`, loader `src/config/scenario-corpus.ts`. Game scorer names are cataloged in [`SCORING.md`](./SCORING.md).

## `prompts/system-prompts.yaml`

Flat map from system-prompt key to literal text. Referenced by `system:` in every `prompts/*.yaml`.

```yaml
direct: "You are a helpful assistant. Be concise. Answer with just the answer unless told otherwise."
cot: "You are a helpful assistant. Think step by step ..."
code_direct: "You are a Python code generator. Output ONLY the requested function. ..."
```

Schema is `Record<string, string>`; no nesting, no metadata. Any non-string value fails with `SchemaDecodeError`. The decoded map is published as a `SystemPromptRegistry` service so `loadPromptCorpus` declares the dependency in its `R` channel — load ordering is enforced by the type system. Each `PromptCorpusEntry` embeds the resolved `{ key, text }` pair, so the `RunManifest` is self-contained and re-scoring never re-reads this file.

Ref: loader `src/config/system-prompts.ts`.
