# Configuration

The harness runs a **configuration** against a **challenge**. Both, plus the system-prompt registry the configurations reference, are declared in YAML and loaded at startup. Every YAML file is parsed and schema-decoded **fail-fast**: the first violation — a malformed file, a bad field, an unknown reference — aborts the load with a typed error and a pointer to the offending file. Nothing is run until all three inputs decode cleanly. See [GUARANTEES.md](./GUARANTEES.md#fail-fast-config).

There are three config inputs:

| File | What it declares | Loader |
|---|---|---|
| `configs.yaml` | The configurations under test (model + runtime + sampling + system prompt). | `src/config/configurations.ts` |
| `releases/<release>/challenges/*.yaml` | The versioned scored suites, one per file; each item is defined fully inline. | `src/config/challenges.ts` |
| `system-prompts.yaml` | The system-prompt registry (key → text), at the repo root. | `src/config/system-prompts.ts` |

Identity is content-addressed with full sha256 digests. A run's config digest is the sha256 of the bundle header's `config` object, and an item's identity is the release's prompt and scorer digests (`releases/<release>/release.json`); both are described in [ARCHIVE-FORMAT.md](./ARCHIVE-FORMAT.md). The 12-hex hashes (`configHash`, `promptHash`, `itemHash`, `challengeHash`, `scorerHash`) exist only for reading legacy archives and are computed in `src/legacy/identity.ts`.

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
| `id` | `string` | yes | Stable identifier; recorded as `configId` on every bundle. |
| `artifact` | `string` | yes | Model artifact: a Hugging Face repo id (`org/name`, resolved in the local hub cache), or — for `mlx`/`omlx` — a path to a model directory, written absolute, `~/`-relative, or `./`-relative. A path artifact ties the entry to one machine, and is what lands in the archive's `artifact` field. |
| `runtime` | `"llamacpp" \| "mlx" \| "omlx"` | yes | Server runtime that loads and serves the model. |
| `quant` | `string` | no | Quantization tag (e.g. `Q4_K_M`, `4bit`). |
| `temperature` | `number` | yes | Sampling temperature. |
| `systemPrompt` | `string` | yes | A key into `system-prompts.yaml`. |
| `maxTokens` | `number` | yes | Generation cap per item. |
| `ctxSize` | `number` | no | Context window override passed to the runtime. |
| `topP` | `number` | no | Nucleus sampling cutoff, sent as `top_p`. Omitted from the request when unset; when set, it joins the config digest. |
| `topK` | `number` | no | Top-k sampling cutoff, sent as `top_k`. Omitted from the request when unset; when set, it joins the config digest. |
| `minP` | `number` | no | Min-p sampling floor, sent as `min_p`. Omitted from the request when unset; when set, it joins the config digest. |
| `presencePenalty` | `number` | no | Presence penalty, sent as `presence_penalty`. Omitted from the request when unset; when set, it joins the config digest. |
| `presenceContextSize` | `number` | no | How many recent tokens `presencePenalty` considers. Requires `presencePenalty`. mlx sends `presence_context_size`; llamacpp sends `repeat_last_n`, which windows the repetition penalty too, so with both penalties set it must equal `repetitionContextSize`; rejected on omlx, which exposes no presence window. Omitted when unset; when set, it joins the config digest. See [the penalty window](#the-penalty-window). |
| `chatTemplateKwargs` | `Record<string, string \| number \| boolean>` | no | Extra chat-template variables (e.g. `reasoning_effort`, `enable_thinking`), sent as `chat_template_kwargs`. Omitted from the request when unset; when set, it joins the config digest (keys sorted). |
| `repetitionPenalty` | `number` | no | Sampler repetition penalty. Omitted from the request when unset; when set, it joins the config digest. |
| `repetitionContextSize` | `number` | no | How many recent tokens `repetitionPenalty` considers. Omitted when unset; when set, it joins the config digest. |
| `chatTemplate` | `string` | no | llamacpp only. Vendored template name, resolved to `templates/<name>.jinja` and passed as `--chat-template-file`. The file's content digest joins the config digest, so editing the template is a new identity. A missing file fails config load with a `ConfigError`. |
| `extraArgs` | `string[]` | no | mlx/omlx only. Extra server CLI args appended after the built-in flags (e.g. `--trust-remote-code`). |
| `active` | `boolean` | no | Marks the entry for selection by the runner. |

**Thinking mode: the model's preferred mode.** Every model runs in the mode its chat template selects by default, and its sampling (`temperature`, `topP`, `topK`, `minP`, `presencePenalty`) and `maxTokens` follow the model card's recommendation for that mode. Configurations of one model on different runtimes carry identical values for these knobs, so the runtime is the only variable. `mlx_lm.server` does not honor a template's default: when a request omits `enable_thinking`, it passes `enable_thinking=true` to any model whose vocabulary has a thinking token (`<think>`, `<|channel>`). A `runtime: mlx` entry whose template reads `enable_thinking` therefore sets `chatTemplateKwargs.enable_thinking` to the template's own default. llama.cpp and oMLX honor the template default and leave it unset. See [CHAT-TEMPLATES.md](./CHAT-TEMPLATES.md#thinking-mode-and-the-mlx_lm-override).

**Loader behavior.** The file decodes as an array of configurations. For each entry, the loader resolves `systemPrompt` to its literal text via the [system-prompt registry](#system-promptsyaml) — an unknown key fails with a `ConfigError` naming the entry and key. It then computes the digest of the template file, when `chatTemplate` is set.

A run's identity is the sha256 of the bundle header's `config` object (`src/orchestration/run-challenge.ts` `bundleConfig`, `src/store/bundle.ts`): `artifact`, `weightsDigest`, `runtime`, `quant`, `temperature`, `maxTokens`, the sampler knobs that are set (`topP`, `topK`, `minP`, `presencePenalty`, `presenceContextSize`, `repetitionPenalty`, `repetitionContextSize`), `chatTemplateKwargs`, the template file's digest, and the **resolved system-prompt text** (not its key, so identity is stable if the registry is reorganized). Knobs that are unset are absent from the object, so an entry without them digests the same either way. `id`, `ctxSize`, `extraArgs`, and `active` are not part of the digest; the bundle header records the server knobs as provenance (see [ARCHIVE-FORMAT.md](./ARCHIVE-FORMAT.md)).

**Ref:** schema `src/schema/configuration.ts` · loader `src/config/configurations.ts`.

### The penalty window

Model cards state presence and repetition penalties with vLLM/SGLang semantics: the penalty covers every token generated so far. The local runtimes apply each penalty over a sliding window of the most recent tokens instead, prompt tokens included, and default that window short: `mlx_lm` 20 tokens per penalty (`sample_utils.make_logits_processors`), llama.cpp 64 tokens shared by every penalty (`repeat_last_n`). `presenceContextSize` widens the presence window; an entry sized to `maxTokens` covers the whole generation (and, when the generation is shorter, the end of the prompt — no runtime can exclude prompt tokens). llama.cpp accepts no "whole context" value for `repeat_last_n` on a request (the server bounds it to `[0, INT32_MAX]`, and 0 disables the penalties), so the size is explicit. oMLX 0.6.3 forwards only `repetition_context_size` to `mlx_lm`, so its presence window stays at 20 and its entries cannot set the field.

A wider window is not a loop fix, and no entry sets one. A presence penalty subtracts the same amount from every token in the window; once the window spans most of a long trace, nearly every plausible token carries it, and the penalty stops separating the tokens just repeated from the rest. Measured on Qwen3.5-9B mlx in thinking mode (card sampling, `maxTokens` 12288, the 12 `dates` items, one sample each), loop aborts rose from 7 with the default 20-token window to 11 at 1024 and 10 at 12288, and passes fell from 2 to 0.

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
| `family` | `string` | no | Uncertainty cluster: items sharing a scenario share a family. Default: the item stands alone. Metadata only — enters no digest. See [SCORING.md § Uncertainty](./SCORING.md#uncertainty-and-statistical-ties). |
| `scope` | `core` \| `stretch` | no | Coverage tag. Default: `stretch` in `economics`, `financial`, `trust` and `chains`, `core` elsewhere. Metadata only — enters no digest. See [SCORING.md § Scope](./SCORING.md#scope). |
| `seed` | `number` | no | Generator seed of a seeded variant (named `<item>_s<seed>`). Provenance only — enters no digest. |

The `scorer` field selects one variant, each with its own required sibling fields:

| `scorer` | Fields | Becomes |
|---|---|---|
| `exact_match` | `expected`, `extract` (regex), optional `fallbackExtract` (regex), optional `nearMisses[]` (each `{ slip, credit, expected }`) | `{ type: exact_match, expected, extract, fallbackExtract?, nearMisses? }` |
| `constraint` | `constraints[]` (each `{ name, check, value, … }`), optional `nearMisses[]` (each `{ slip, credit, pattern }`) | `{ type: constraint, constraints, nearMisses? }` |
| `code_exec` | `testFile` (path, relative to the challenge file's directory); optional `submission: <lang>` | `{ type: code_exec, testCode, submission? }` — file read and embedded at load; `submission` binds the answer to `SUBMISSION` instead of running it ([SCORING.md](./SCORING.md#submission-mode)) |
| `game` | `gameScorer`, `scorerParams` | `{ type: game, gameScorer, scorerParams }` |

`nearMisses` declares specific wrong answers that earn partial credit: `credit` is strictly between 0 and 1, `slip` names the mistake. An absent `nearMisses` leaves the scorer config (and its digest) unchanged. See [SCORING.md § Near misses](./SCORING.md#near-misses). `fallbackExtract` is a looser regex read only when `extract` matches nothing; a correct answer it finds is a format flaw ([SCORING.md § Format flaws](./SCORING.md#format-flaws)). Absent, it likewise leaves the digest unchanged.

The full constraint-check and scorer catalogs are in [SCORING.md](./SCORING.md).

**Loader behavior.** Each item is decoded and resolved directly — no corpus lookup, no name-based join. For each item the loader:

- decodes against the `scorer`-discriminated input schema, so a missing per-scorer field (e.g. `exact_match` without `extract`) fails with a precise `SchemaDecodeError`;
- pre-validates constraint `check` discriminators against the known set before decode, so an unknown check fails with `UnknownConstraintCheck` rather than a generic decode error;
- for `code_exec`, reads the companion `testFile` — resolved relative to the challenge file's directory (it lives in the same `challenges/`) — and embeds its contents as `testCode`;
- leaves the system text empty, since the system prompt is a configuration concern, not an item one.

An item's identity is the release's prompt digest and scorer digest (`releases/<release>/release.json`, keyed `<challenge>/<item>`); editing an item's prompt or scorer changes its digest, and the release's item-set digest covers every item's pair.

The archive treats each `(id, version)` as its own challenge, so attempts never pool across versions. Within a version, every scorer edit, prompt edit, retired item, and added item is recorded in the release's `errata.yaml` and enforced against its release file ([ERRATA.md](./ERRATA.md)); `./bench score --dataset` grades existing executions under the edited scorer (see [ARCHIVE-FORMAT.md § Retired items](./ARCHIVE-FORMAT.md#retired-items)).

**Ref:** schema `src/schema/challenge.ts` · loader/resolution `src/config/challenges.ts` · scorer schemas `src/schema/scorer.ts`, `src/schema/constraints.ts`. Scorer config variants: [SCORING.md](./SCORING.md).

## `system-prompts.yaml`

A flat map from system-prompt key to its literal text, at the repo root (sibling of `configs.yaml`). Configurations select a persona by key via `systemPrompt:`; the system prompt is purely an LLM-config concern and is not part of any challenge or item definition. The loader resolves each key to its text so the resolved `{key, text}` pair is embedded into the config digest and stays stable.

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
