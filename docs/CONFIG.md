# Configuration

> _Last verified: 2026-06-20 against `9a651b2`._

The harness runs a **configuration** against a **challenge**. Both, plus the system-prompt registry the configurations reference, are declared in YAML and loaded at startup. Every YAML file is parsed and schema-decoded **fail-fast**: the first violation — a malformed file, a bad field, an unknown reference — aborts the load with a typed error and a pointer to the offending file. Nothing is run until all three inputs decode cleanly. See [GUARANTEES.md](./GUARANTEES.md#fail-fast-config).

There are three config inputs:

| File | What it declares | Loader |
|---|---|---|
| `configs.yaml` | The configurations under test (model + runtime + sampling + system prompt). | `src/config/configurations.ts` |
| `challenges/*.yaml` | The versioned scored suites, one per file; each item is defined fully inline. | `src/config/challenges.ts` |
| `system-prompts.yaml` | The system-prompt registry (key → text), at the repo root. | `src/config/system-prompts.ts` |

Identity is content-addressed: configurations, items, and challenges each carry a 12-hex `shortSha256` hash over their decoded inputs. The hash catalog and how the hashes nest is in [ARCHIVE-FORMAT.md](./ARCHIVE-FORMAT.md#hashing).

## `configs.yaml`

A YAML array of configuration entries. Each entry is the full set of knobs a user sets when submitting a model: a model artifact, a runtime, sampling settings, and a system prompt selected from the registry by key.

```yaml
- id: smoke-config
  artifact: Qwen/Qwen2.5-0.5B-Instruct-GGUF
  runtime: llamacpp
  quant: Q4_K_M
  temperature: 0.0
  systemPrompt: concise
  maxTokens: 128

- id: qwen2.5-7b-mlx
  artifact: mlx-community/Qwen2.5-7B-Instruct-4bit
  runtime: mlx
  quant: 4bit
  temperature: 0.7
  systemPrompt: default
  maxTokens: 2048
```

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | yes | Stable identifier; recorded as `configId` on every attempt. |
| `artifact` | `string` | yes | Model artifact: a Hugging Face repo id (`org/name`, resolved in the local hub cache), or — for `mlx`/`omlx` — a path to a model directory, written absolute, `~/`-relative, or `./`-relative. A path artifact ties the entry to one machine, and is what lands in the archive's `artifact` field. |
| `runtime` | `"llamacpp" \| "mlx" \| "omlx"` | yes | Server runtime that loads and serves the model. |
| `quant` | `string` | no | Quantization tag (e.g. `Q4_K_M`, `4bit`). |
| `temperature` | `number` | yes | Sampling temperature. |
| `systemPrompt` | `string` | yes | A key into `system-prompts.yaml`. |
| `maxTokens` | `number` | yes | Generation cap per item. |
| `ctxSize` | `number` | no | Context window override passed to the runtime. |
| `active` | `boolean` | no | Marks the entry for selection by the runner. |

**Loader behavior.** The file decodes as an array of configurations. For each entry, the loader resolves `systemPrompt` to its literal text via the [system-prompt registry](#system-promptsyaml) — an unknown key fails with a `ConfigError` naming the entry and key. It then computes the configuration's identity:

```
configHash = shortSha256(artifact | runtime | quant | temperature | maxTokens | systemPromptText)
```

The hash folds in the **resolved system-prompt text**, not the key, so identity is stable even if the registry is reorganized. `ctxSize` and `active` are not part of the hash.

**Ref:** schema `src/schema/configuration.ts` · loader/hashing `src/config/configurations.ts`.

## `challenges/*.yaml`

One challenge per file — a named, versioned scored suite (a quiz/exam). A challenge lists items, and each item carries its **full definition inline**: the prompt text, its metadata, and the scorer that grades the model's answer. There is no separate prompt corpus and no ID dereferencing — the loader reads each item directly.

```yaml
id: constraint
version: 1
passThreshold: 0.8
items:
  - name: constraint_keywords_direct
    category: constraint
    tier: 1
    prompt: Write one paragraph about space exploration. You MUST include the words 'rocket', 'orbit', and 'gravity'. Output only the paragraph, no extra text.
    scorer: constraint
    constraints:
      - name: contains 'rocket'
        check: contains
        value: rocket
    tags:
      - instruction-following
  - name: constraint_json
    category: constraint
    tier: 2
    prompt: Output a JSON object with keys "name" and "age". No prose.
    scorer: constraint
    constraints:
      - name: valid JSON
        check: json_valid
```

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | yes | Challenge identifier. |
| `version` | `number` | yes | Suite version. A different version is a distinct challenge. |
| `passThreshold` | `number` | yes | Fraction of items scoring perfect for the attempt to pass. |
| `items` | `array` | yes | Ordered list of inline scored items. |

Each entry in `items` is a complete item:

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | yes | Item name; unique within the challenge. |
| `category` | `string` | yes | Grouping label. |
| `tier` | `number` | yes | Concept-difficulty tier. |
| `prompt` | `string` | yes | The user-message text sent to the model. |
| `scorer` | enum | yes | Scorer discriminator (see below); the matching per-scorer fields are siblings of `scorer`. |
| `tags` | `string[]` | no | Free-form labels. |

The `scorer` field selects one variant, each with its own required sibling fields:

| `scorer` | Fields | Becomes |
|---|---|---|
| `exact_match` | `expected`, `extract` (regex) | `{ type: exact_match, expected, extract }` |
| `constraint` | `constraints[]` (each `{ name, check, value, … }`) | `{ type: constraint, constraints }` |
| `code_exec` | `testFile` (path, relative to the challenge file's directory) | `{ type: code_exec, testCode }` — file read and embedded at load |
| `game` | `gameScorer`, `scorerParams` | `{ type: game, gameScorer, scorerParams }` |

The full constraint-check and scorer catalogs are in [SCORING.md](./SCORING.md).

**Loader behavior.** Each item is decoded and resolved directly — no corpus lookup, no name-based join. For each item the loader:

- decodes against the `scorer`-discriminated input schema, so a missing per-scorer field (e.g. `exact_match` without `extract`) fails with a precise `SchemaDecodeError`;
- pre-validates constraint `check` discriminators against the known set before decode, so an unknown check fails with `UnknownConstraintCheck` rather than a generic decode error;
- for `code_exec`, reads the companion `testFile` — resolved relative to the challenge file's directory (it lives in `challenges/`) — and embeds its contents as `testCode`;
- computes `promptHash = shortSha256(promptText | "")` — the system text is empty, since the system prompt is a configuration concern, not an item one.

Identity is then computed per item and rolled up:

```
itemHash      = shortSha256(promptHash | scorerKey)
challengeHash = shortSha256( join("|", [ promptHash + ":" + scorerKey  for each item, in order ]) )
```

where `scorerKey` is the canonical key-sorted JSON of the scorer config. Because `challengeHash` covers the ordered list of resolved items, reordering items or editing an item's prompt or scorer produces a different challenge.

A published version is **never mutated in place** — edit a challenge by bumping `version`. The archive treats each `(id, version)` as its own challenge, so attempts never pool across versions.

**Ref:** schema `src/schema/challenge.ts` · loader/resolution/hashing `src/config/challenges.ts` · scorer schemas `src/schema/scorer.ts`, `src/schema/constraints.ts`. Scorer config variants: [SCORING.md](./SCORING.md).

## `system-prompts.yaml`

A flat map from system-prompt key to its literal text, at the repo root (sibling of `configs.yaml` and `models.yaml`). Configurations select a persona by key via `systemPrompt:`; the system prompt is purely an LLM-config concern and is not part of any challenge or item definition. The loader resolves each key to its text so the resolved `{key, text}` pair is embedded into the configuration's identity hash and stays stable.

```yaml
default: "You are a helpful assistant."
concise: "You are a helpful assistant. Be concise. Answer with just the answer unless told otherwise."
cot: "You are a helpful assistant. Think step by step to solve problems."
```

| Concept | Description |
|---|---|
| Key | The string referenced by `systemPrompt:`. |
| Text | The literal system-prompt content sent to the model. |

**Loader behavior.** The file decodes as a `Record<string, string>` — any non-string value fails with a `SchemaDecodeError`. The decoded map is published as the `SystemPromptRegistry` service, which the configuration loader consumes to resolve its `systemPrompt:` key references. A configuration applies its one chosen system prompt uniformly across every challenge item.

**Ref:** loader `src/config/system-prompts.ts`.
