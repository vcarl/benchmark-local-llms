# Standardize the model roster on `configs.yaml`; remove `models.yaml`

> Status: design approved 2026-06-24.

## Problem

`configs.yaml` is the only roster the harness runs. `./bench run` loads it via `loadConfigurations` (`src/config/configurations.ts:39`), `selectConfigs` (`src/config/select.ts:17`) honors each entry's `active` flag, and the report/score/export pipeline and the webapp downstream of it never touch `models.yaml`.

`models.yaml` is read by exactly one consumer: the `list-models` CLI command (`src/cli/commands/list.ts:112`, via `loadModels` at `src/config/models.ts:23`). No other code path reads it. The integration smoke test loads it (`src/__tests__/integration-smoke.test.ts:39`) purely to assert the loader works.

Because the two files share no loader, they have drifted:

- **20 conflicting `active` flags.** A `models.yaml` entry's `active: false` (or its absence) has no effect on what runs — only the matching `configs.yaml` entry's flag does. The flag in `models.yaml` is a silent no-op. This silent no-op is the bug.
- **24 artifacts exist only in `models.yaml`.** They appear in `list-models` output but cannot be run, scored, or reported, because no `configs.yaml` entry exists for them.

The fix makes `configs.yaml` the single source of truth so a model's presence and its `active` flag mean one thing everywhere.

## Goal / target state

`configs.yaml` is the single roster. Every model the harness knows about is a `configs.yaml` entry, and a config's `active` flag governs both what `list-models` reports and what `./bench run` executes. `models.yaml`, its loader, and its schema do not exist. `list-models` reads `configs.yaml`.

## Changes

### a. Add 24 `active: false` entries to `configs.yaml`

Twenty-four `(artifact, runtime, quant)` combinations live only in `models.yaml`. Each becomes a `configs.yaml` entry with `active: false`, preserving the catalog in one file.

Field derivation:

- `id` follows the existing convention (`<model-slug>-<runtime>`, e.g. `qwen2.5-7b-mlx`, `deepseek-coder-v2-lite-llamacpp`). All 24 ids are unique against the 63 existing config ids and against each other (verified).
- `artifact`, `runtime`, `quant`, `ctxSize` copied verbatim from the `models.yaml` entry. (`scenarioCtxSize` is **not** carried over — it is a dead field being removed by this spec; see change e and the Decided note in Risks.)
- `temperature: 0.7` — every source entry already carries `0.7`, so this is the real value, not a fallback. (Modal `temperature` across `configs.yaml` is also `0.7` — 48 of 63 entries.)
- `systemPrompt: default` — a placeholder. `default` exists in `system-prompts.yaml:4`, so `loadConfigurations` resolves it and computes a `configHash` without error. The value is inert because the entries are inactive.
- `maxTokens: 4096` — a placeholder, the modal value across `configs.yaml` (40 of 63 entries). Inert because the entries are inactive.
- `active: false` on every entry.
- `params` and `name` are **not** carried over. `params` is dead (see change e); display name derives from `id` at runtime (`modelFromConfig` sets `model.name = c.id`, `src/orchestration/run-challenge.ts:76`).

The placeholder note below belongs in `configs.yaml` as a comment above the block.

```yaml
# ── Catalog-only entries (inactive) ──────────────────────────────────────────
# Cached/known artifacts that are not part of any active sweep. `systemPrompt`,
# `maxTokens`, and `temperature` are placeholders here — these entries never run
# (active: false), so those fields are inert. Flip `active: true` and tune them
# before running any of these.
- id: qwen2.5-7b-llamacpp
  artifact: Qwen/Qwen2.5-7B-Instruct-GGUF
  runtime: llamacpp
  quant: Q8_0
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  active: false

- id: qwen2.5-32b-llamacpp
  artifact: Qwen/Qwen2.5-32B-Instruct-GGUF
  runtime: llamacpp
  quant: Q6_K
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  active: false

- id: qwen2.5-72b-llamacpp
  artifact: Qwen/Qwen2.5-72B-Instruct-GGUF
  runtime: llamacpp
  quant: Q5_K_M
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  active: false

- id: qwen2.5-72b-mlx
  artifact: mlx-community/Qwen2.5-72B-Instruct-4bit
  runtime: mlx
  quant: 4bit
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  active: false

- id: qwen2.5-coder-32b-llamacpp
  artifact: Qwen/Qwen2.5-Coder-32B-Instruct-GGUF
  runtime: llamacpp
  quant: Q6_K
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  active: false

- id: qwen2.5-coder-32b-mlx
  artifact: mlx-community/Qwen2.5-Coder-32B-Instruct-4bit
  runtime: mlx
  quant: 4bit
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  active: false

- id: devstral-2-123b-llamacpp
  artifact: unsloth/Devstral-2-123B-Instruct-2512-GGUF
  runtime: llamacpp
  quant: Q4_K_M
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  ctxSize: 2048
  active: false

- id: devstral-2-123b-mlx
  artifact: mlx-community/Devstral-2-123B-Instruct-2512-4bit
  runtime: mlx
  quant: 4bit
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  ctxSize: 2048
  active: false

- id: devstral-small-2-24b-llamacpp
  artifact: unsloth/Devstral-Small-2-24B-Instruct-2512-GGUF
  runtime: llamacpp
  quant: Q6_K
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  active: false

- id: deepseek-r1-distill-qwen-7b-llamacpp
  artifact: bartowski/DeepSeek-R1-Distill-Qwen-7B-GGUF
  runtime: llamacpp
  quant: Q8_0
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  active: false

- id: deepseek-r1-distill-qwen-14b-llamacpp
  artifact: bartowski/DeepSeek-R1-Distill-Qwen-14B-GGUF
  runtime: llamacpp
  quant: Q8_0
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  active: false

- id: deepseek-r1-distill-qwen-14b-mlx
  artifact: mlx-community/DeepSeek-R1-Distill-Qwen-14B-4bit
  runtime: mlx
  quant: 4bit
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  active: false

- id: deepseek-r1-distill-qwen-32b-llamacpp
  artifact: bartowski/DeepSeek-R1-Distill-Qwen-32B-GGUF
  runtime: llamacpp
  quant: Q6_K
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  active: false

- id: deepseek-r1-distill-qwen-32b-mlx
  artifact: mlx-community/DeepSeek-R1-Distill-Qwen-32B-4bit
  runtime: mlx
  quant: 4bit
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  active: false

- id: deepseek-coder-v2-lite-mlx
  artifact: mlx-community/DeepSeek-Coder-V2-Lite-Instruct-4bit
  runtime: mlx
  quant: 4bit
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  active: false

- id: deepseek-r1-distill-llama-70b-llamacpp
  artifact: bartowski/DeepSeek-R1-Distill-Llama-70B-GGUF
  runtime: llamacpp
  quant: Q5_K_M
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  active: false

- id: deepseek-r1-distill-llama-70b-mlx
  artifact: mlx-community/DeepSeek-R1-Distill-Llama-70B-4bit
  runtime: mlx
  quant: 4bit
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  active: false

- id: gpt-oss-120b-llamacpp
  artifact: unsloth/gpt-oss-120b-GGUF
  runtime: llamacpp
  quant: Q4_K_M
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  ctxSize: 2048
  active: false

- id: gpt-oss-120b-mlx
  artifact: mlx-community/gpt-oss-120b-MXFP4-Q4
  runtime: mlx
  quant: 4bit
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  ctxSize: 2048
  active: false

- id: nemotron-super-49b-llamacpp
  artifact: bartowski/nvidia_Llama-3_3-Nemotron-Super-49B-v1_5-GGUF
  runtime: llamacpp
  quant: Q8_0
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  active: false

- id: llama4-scout-17b-16e-llamacpp
  artifact: unsloth/Llama-4-Scout-17B-16E-Instruct-GGUF
  runtime: llamacpp
  quant: Q8_0
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  ctxSize: 2048
  active: false

- id: llama4-scout-17b-16e-mlx
  artifact: mlx-community/Llama-4-Scout-17B-16E-Instruct-4bit
  runtime: mlx
  quant: 4bit
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  ctxSize: 2048
  active: false

- id: llama4-maverick-17b-128e-llamacpp
  artifact: unsloth/Llama-4-Maverick-17B-128E-Instruct-GGUF
  runtime: llamacpp
  quant: Q4_K_M
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  ctxSize: 2048
  active: false

- id: llama4-maverick-17b-128e-mlx
  artifact: mlx-community/Llama-4-Maverick-17B-128E-Instruct-4bit
  runtime: mlx
  quant: 4bit
  temperature: 0.7
  systemPrompt: default
  maxTokens: 4096
  ctxSize: 2048
  active: false
```

These append to `configs.yaml` (the file ends at line 531). The `Configuration` schema (`src/schema/configuration.ts:9`) accepts every field used above: `id`, `artifact`, `runtime`, `temperature`, `systemPrompt`, `maxTokens` (required) and `quant`, `ctxSize`, `active` (optional). This spec does **not** change the `Configuration` schema. (`scenarioCtxSize` is not — and is not added to — the `Configuration` schema; it is dropped from the catalog entries here. See the Decided note in Risks.)

### b. Delete `models.yaml`

Remove the file at the repo root.

### c. Delete `src/config/models.ts` and its tests

- Delete `src/config/models.ts` (the `loadModels` loader and the `effectivelyActive`/temperature validation it carries).
- Delete `src/config/models.test.ts` in full — every case (`decodes a valid models YAML…`, `fails with SchemaDecodeError…`, `rejects active model missing temperature`, `accepts inactive model missing temperature`) exercises `loadModels`, which no longer exists.
- Delete the `src/config/__fixtures__/models/` fixtures consumed only by that test (`models.yaml`, `models-bad-runtime.yaml`, `models-active-missing-temperature.yaml`, `models-inactive-missing-temperature.yaml`). Confirm via `grep -rn "__fixtures__/models" src/` that `models.test.ts` is the only referrer before deleting.

### d. Repoint `list-models` to `configs.yaml`

In `src/cli/commands/list.ts`:

- Replace the `loadModels` import (line 15) with `loadConfigurations` from `../../config/configurations.js`, and drop the `ModelConfig` type import (line 17).
- Replace `modelsPathOpt` (lines 23–26) with a configs-path option that matches the established `--configs-file` / `configs.yaml` convention already used by `run` (`src/cli/commands/run.ts:125`): `Options.file("configs-file")` with description "Path to configs.yaml" and `Options.withDefault("configs.yaml")`.
- Keep the command name `list-models` (recommended: minimal churn; the command, help text, README, ARCHITECTURE wiring, and QA skill all keep referring to `list-models`).
- Update `formatModelLine` (line 44) to render a `Configuration` (or `ResolvedConfiguration`) row with columns `id  artifact  runtime  quant  active`, tab-separated. Missing `quant` renders as `-` (as today). Render `active` as the effective boolean (`active !== false`) so the default-true case shows `true`.
- Update `listModelsCommand` (lines 112–120) to call `loadConfigurations(configsFile)` and feed its result to the formatter. `loadConfigurations` requires a `SystemPromptRegistry` in addition to `FileSystem`, because it resolves each entry's `systemPrompt` key. Provide it exactly as `runSweep` does (`src/cli/commands/run.ts:50–54`): load `system-prompts.yaml` via `loadSystemPrompts`, wrap it with `Layer.succeed(SystemPromptRegistry, …)`, and provide that layer to the `loadConfigurations` call. This means `list-models` also gains a `--system-prompts-file` option defaulting to `system-prompts.yaml`, matching `run`'s `systemPromptsFileOpt` (`src/cli/commands/run.ts:121`).

The command stays read-only: it parses `configs.yaml`, resolves system-prompt keys (a side effect of `loadConfigurations`), and prints. No network, no server spawn.

### e. `ModelConfig` schema cleanup

`ModelConfig` (`src/schema/model.ts:17`) is the **runtime** model shape produced by `modelFromConfig` (`src/orchestration/run-challenge.ts:73`) and consumed by the LLM-server factory, `run-prompt`, `run-scenario`, `run-session`, `run-id`, and `cli/deps`. It stays. Three fields are removed, all confirmed dead:

- **Remove `params`** (line 22). No code in `src/` or `webapp/` reads `model.params` (verified by `grep -rn "\.params" src/ webapp/`, whose only hits are unrelated `params` locals). `modelFromConfig` never sets it. Dead field.
- **Remove `active`** (line 25). After `models.ts` is deleted, the only reader of `ModelConfig.active` was `loadModels` (`src/config/models.ts:38`). `modelFromConfig` never sets it, and the `active`/`selectConfigs` flow operates on `Configuration` (`src/config/select.ts:21` reads `c.active` where `c` is a `Configuration`, not a `ModelConfig`). With `models.ts` gone, `ModelConfig.active` has no reader and is removable. **Finding: removable.**
- **Remove `scenarioCtxSize`** (line 24). Dead end-to-end: `grep -rn "\.scenarioCtxSize" src/ webapp/` finds zero readers. `modelFromConfig` never sets it, and the per-phase-context feature its doc comment describes (per-phase server restart driving a second `--ctx-size`) was never built — `src/orchestration/phases.ts:170` reuses the single running server. Dead field. **Note:** when genuine per-phase context-window control is built (separate future spec), this field gets re-added with real wiring; this spec only removes the dead stub.
- **Keep `name`** (line 20). Read at `src/orchestration/run-id.ts:44`, `src/orchestration/run-prompt.ts:50`, and `src/game/session/run-session.ts:352` via `model.name ?? model.artifact`. `modelFromConfig` sets it to `c.id`, so the roster removal does not break it.
- Keep `quant`, `ctxSize`, `temperature`, `chatTemplate`, `runtime`, `artifact` — all still produced or consumed on the runtime path. (`ctxSize` flows to the llamacpp server's `-c` flag via `cli/deps.ts:115` → `llamacppServer` → `src/llm/servers/llamacpp.ts:76`; the mlx server takes no context flag, so `ctxSize` is a benign no-op there.)

Update the `ModelConfig` doc comment (lines 4–16) on two counts: (1) it currently describes "one entry in `models.yaml`" — rewrite it to describe its real role, the runtime model shape produced by `modelFromConfig`; (2) it currently claims `ctxSize`/`scenarioCtxSize` reach "the backing server's `--ctx-size` flag" and that "the server is restarted between prompt and scenario phases (§5.3)" — that per-phase-restart feature does not exist and `scenarioCtxSize` is being removed, so excise that claim entirely. The replacement comment states only what is true: `ctxSize` flows to the llamacpp server's `-c` flag (no-op for mlx); there is no per-phase server restart. Use authoritative present-tense voice; do not narrate the removal.

### f. Fix the two "adjust models.yaml" error strings

- `src/llm/servers/resolve-mlx.ts:62` — change `… or adjust models.yaml.` to `… or adjust configs.yaml.`
- `src/llm/servers/resolve-gguf.ts:62` — same edit.

### g. Doc updates

- `README.md:14` — the inline comment on `./bench list-models` (`# sanity-check the configured models`) is accurate; no change required, but confirm it still reads correctly after the repoint.
- `README.md:92` — currently "`list-models` reads `models.yaml` and prints one line per model (`artifact`, `runtime`, `quant`)." Change to: reads `configs.yaml` and prints one line per configuration (`id`, `artifact`, `runtime`, `quant`, `active`).
- `docs/ARCHITECTURE.md:17` — lists `list-models` among wired subcommands. The command name is unchanged, so no edit is needed. (Confirm there is no other `models.yaml` reference in `ARCHITECTURE.md`; grep shows none.)
- `.claude/skills/qa/SKILL.md` (rows A1/A2, ~lines 41–42) — `list-models` still exists and still prints ≥1 row; assertions remain valid. No edit required, but confirm the A2 "≥1 non-empty model row" assertion still holds against `configs.yaml` (it does — 63+24 entries).
- `docs/superpowers/plans/2026-06-20-obsolete-run-path-removal.md:41` — this row poses "either retire `list-models`/`list-prompts` or repoint at `configs.yaml`" as an open decision and lists `src/config/models.ts` + `models.yaml` as deletable. Add a one-line note that this spec resolves the decision: `list-models` is repointed to `configs.yaml`, `models.ts` and `models.yaml` are deleted. Do not rewrite the historical plan's prose.

Historical specs and plans under `docs/superpowers/` that mention `models.yaml` as a record of past state (e.g. the v1-doc-consolidation, archive-cache-semantics, and reframe designs) are **not** edited — they describe the system as it was at their authoring date.

## Testing

Test changes:

- **Delete** `src/config/models.test.ts` and its `__fixtures__/models/` fixtures (change c). (Note: `src/config/models.test.ts:33` also references `scenarioCtxSize`, but the whole file is deleted, so no separate fix is needed there.)
- **Fix** `src/schema/model.test.ts`: the "round-trips with full set of overrides" case (lines 21–33) sets `params: "32B"`, `scenarioCtxSize: 32768`, and `active: true` on a `ModelConfig` — all three fields removed by change e. Drop those three keys from that fixture (and from its `ModelConfig`-typed value) so it round-trips only surviving fields. The "round-trips with active=false" case (~line 35) also sets the removed `active` field — update or remove that case as well. This is the only surviving test that asserts `ModelConfig.scenarioCtxSize`.
- **Replace** `src/cli/__tests__/list-models-e2e.test.ts`'s fixture and assertions: write a temp `configs.yaml` (not `models.yaml`) plus a temp `system-prompts.yaml` containing the `default` key, invoke `list-models` with `--configs-file <tmp>/configs.yaml --system-prompts-file <tmp>/system-prompts.yaml`, and assert rows render as `id  artifact  runtime  quant  active`. The command loads the system-prompts file by path (it does not take an injected registry), so the temp `system-prompts.yaml` must exist on disk and define every `systemPrompt` key the temp configs reference. Mirror how `run`'s sweep test (`src/cli/commands/__tests__/run-sweep.test.ts`) stages its temp config files.
- **Fix** `src/errors/config.test.ts:14,18`: the `ConfigError` path-carrying test uses the literal `"models.yaml"`. Repoint the fixture value to `"configs.yaml"` so the suite carries no `models.yaml` reference. (The test asserts the error carries whatever path it is given; the literal is cosmetic but should not reference a deleted file.)
- **Fix** `src/__tests__/integration-smoke.test.ts`: remove the `loadModels`/`modelsPath` step (lines 7, 30, 39) and the `models`-related assertions (lines 96–99, and `models` in the returned tuple at line 83/90). The smoke test's purpose — system-prompts + challenge + scenario load and a synthetic score — stands without the roster load. Optionally substitute `loadConfigurations(configsPath)` to keep a roster-load assertion; either is acceptable, but it must not import the deleted `models.ts`.

Verification gates:

- `npm test` — full suite green.
- `bash scripts/lint-strict.sh` (the repo's strict lint) — clean. Note the throw ban exempts `*.test.ts`.
- Webapp untouched: confirm no edits under `webapp/`. Scatter-point sizing uses `peak_memory_gb` from runtime archives, independent of either YAML file.
- Manual: `./bench list-models` prints `id  artifact  runtime  quant  active` rows including the new inactive entries with `active=false`, and `./bench list-models --configs-file <path>` honors the flag.

## Out of scope

- The scoring / rescoring engine, archive I/O, and report pipeline.
- The webapp (`webapp/**`).
- **Per-phase / scenario context-window control** — the `scenarioCtxSize` mechanism and the scenario-phase server (re)boot it requires, plus the mlx no-context-flag gap (the mlx server takes no context flag, so `ctxSize` is a no-op there). This spec only **removes** the dead `scenarioCtxSize` field and its false doc comment; the real feature is a separate spec.
- Any further `ModelConfig` slimming beyond `params`, `active`, and `scenarioCtxSize`.
- Matrix-expansion of configs, per-config reasoning-effort tuning, or any unrelated roster curation.
- Re-tuning the placeholder `systemPrompt` / `maxTokens` / `temperature` on the 24 inactive entries — that happens if and when one is activated.

## Risks / open questions

- **Placeholder fields on inactive stubs.** The 24 migrated entries carry placeholder `systemPrompt: default` and `maxTokens: 4096`. They are inert while `active: false`, but anyone flipping one to active inherits placeholders rather than tuned values. Mitigation: the `configs.yaml` comment above the block states this explicitly.
- **`scenarioCtxSize` — Decided (not open).** `scenarioCtxSize` is removed as a dead field: it has zero readers across `src/` and `webapp/`, and the per-phase-context feature its `model.ts` doc comment describes (a server restart between prompt and scenario phases driving a second `--ctx-size`) was never built. This spec removes it in three places — the `ModelConfig` schema field, the false `model.ts:10` doc comment, and the eight catalog stubs that carried `scenarioCtxSize: 16384` (the `gpt-oss-120b`, `devstral-2-123b`, `llama4-scout`, `llama4-maverick` pairs). It is **not** added to the `Configuration` schema. Genuine per-phase context-window control — the scenario-phase server (re)boot it would require, plus closing the mlx no-context-flag gap — is deferred to its own feature spec (see Out of scope); the field is re-added with real wiring there.
- **Whether to keep the 24 at all.** The 24 are cached/known but unrun. The decision is to keep them as `active: false` catalog entries rather than drop them, so the roster history survives in one file. Dropping them instead would shrink `configs.yaml` but lose the record `models.yaml` held.
- **The gemma-4-31B Q6_K llamacpp variant is deliberately excluded.** This is why the orphan count is 24, not the 25 you get by keying strictly on `(artifact, runtime, quant)`. If the Q6_K quant is wanted, add it as a 25th entry (`gemma-4-31b-llamacpp-q6` is collision-free).
- **Id-collision check.** All 24 derived ids are unique against the 63 existing config ids and against each other (verified). Final ids: `qwen2.5-7b-llamacpp`, `qwen2.5-32b-llamacpp`, `qwen2.5-72b-llamacpp`, `qwen2.5-72b-mlx`, `qwen2.5-coder-32b-llamacpp`, `qwen2.5-coder-32b-mlx`, `devstral-2-123b-llamacpp`, `devstral-2-123b-mlx`, `devstral-small-2-24b-llamacpp`, `deepseek-r1-distill-qwen-7b-llamacpp`, `deepseek-r1-distill-qwen-14b-llamacpp`, `deepseek-r1-distill-qwen-14b-mlx`, `deepseek-r1-distill-qwen-32b-llamacpp`, `deepseek-r1-distill-qwen-32b-mlx`, `deepseek-coder-v2-lite-mlx`, `deepseek-r1-distill-llama-70b-llamacpp`, `deepseek-r1-distill-llama-70b-mlx`, `gpt-oss-120b-llamacpp`, `gpt-oss-120b-mlx`, `nemotron-super-49b-llamacpp`, `llama4-scout-17b-16e-llamacpp`, `llama4-scout-17b-16e-mlx`, `llama4-maverick-17b-128e-llamacpp`, `llama4-maverick-17b-128e-mlx`.
