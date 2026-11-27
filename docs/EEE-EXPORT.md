# EEE Export

`./bench export-eee` projects one completed attempt onto the [Every Eval Ever](https://github.com/evaleval/every_eval_ever) (EEE) schema, version `0.3.0`: an aggregate eval JSON plus an instance-level samples JSONL. EEE is kept for standardization: it puts results in a schema other tools already read. The bundles, score records and snapshots remain the lossless record; EEE is an interchange view of them. The command reads only the attempt `.jsonl` and its content store, both through a legacy dataset manifest's pins, writes local files, and uploads nothing; submitting an export anywhere is a separate, manual decision.

Vocabulary follows the [archive data model](superpowers/specs/2026-11-17-archive-data-model-design.md). "Attempt" is the on-disk name of a legacy (schemaVersion 1–3) archive file. The export reads legacy data only: the ranked v4 draft (bundles plus score records) cannot be exported yet, a known gap.

```
./bench export-eee <attempt> [--dataset NAME] [--datasets-dir DIR] [--legacy-root DIR] [--out DIR] [--collection NAME] [--relationship third_party|first_party|collaborative|other] [--verbose]
```

`<attempt>` is an `attemptId` or its `.jsonl` file name, listed by the legacy dataset `--dataset` (default `alpha`); it is read from the manifest's archive under `--legacy-root` (default `.`), and the file and every content-store blob it uses must match the manifest's SHA-256 pins. The attempt is a legacy (schemaVersion 1–3) attempt archive and must be complete and reconstructible (schemaVersion 2 or higher). Output lands at

```
<out>/data/<collection>/<developer>/<model>/<uuid>.json
<out>/data/<collection>/<developer>/<model>/<uuid>_samples.jsonl
```

`out` defaults to `eee-export`, `collection` to `llms-bench`, `relationship` to `third_party`. `<uuid>` is derived from the `attemptId`, so re-exporting an attempt rewrites the same files byte for byte. One attempt is one aggregate file with one `evaluation_results` entry (one config on one challenge).

## Schemas

`src/export/eee/schemas/` holds `eval.schema.json` and `instance_level_eval.schema.json` verbatim at upstream commit `0791adc3c2488cc8c91d109b3c541da492238e49` (see the README there for the URL). `src/export/eee/build.test.ts` builds a fixture archive, runs the exporter, and validates both outputs against them with Ajv (a dev dependency: the schemas are draft-07 with `if/then/else` and `oneOf`, which a hand-written structural check would not cover faithfully). The tests do not run EEE's own Python validator, so its cross-file and warning checks are not exercised.

## Identity and the model id

`model_info.id` is the artifact (an HF-style `org/name`) with the quantization appended as `@<quant>`: `unsloth/Qwen3-32B-GGUF@Q4_K_M`. Consumers that group by `model_info.id` therefore keep Q4 and Q8 runs apart. An artifact without a quant keeps its bare name. A local path artifact uses its basename, with no `developer`. Runs of one model id that differ in anything else (system prompt, sampler, template) share the id and are told apart by `config_hash` and `evaluation_id`.

`evaluation_id` is the SHA-256 of the attempt file's bytes, the digest that pins a legacy attempt under the [archive data model](superpowers/specs/2026-11-17-archive-data-model-design.md); `retrieved_timestamp` is `finishedAt`, so the export is deterministic.

## Aggregate mapping

| EEE field | Source |
|---|---|
| `source_metadata.source_organization_name` | `submitter` (default `local`) |
| `source_metadata.evaluator_relationship` | `--relationship` |
| `source_metadata.additional_details` | `attempt_id`, `invocation_id`, `restamped_from`, `hardware_id`, `hardware` (JSON), `platform`, `benchmark_git_sha` |
| `eval_library` | `{llms-bench, benchmarkGitSha}` |
| `model_info.inference_engine` | `{runtime, env.runtimeVersion}` |
| `model_info.additional_details` | `deployment_type=self_deployed`, `model_availability=open_weights`, plus `artifact`, `quant`, `runtime`, `runtime_version`, `config_id`, `config_hash`, `chat_template`, `chat_template_sha`, `ctx_size`, `extra_args`, `server_flags` when set |
| `evaluation_results[0].source_data` | `source_type: "other"` (the items are public in this repo, not on a dataset hub): `dataset_name = challengeId`, details `challenge_version`, `challenge_hash` |
| `metric_config` | `pass_rate`: continuous, `[0, 1]`, higher is better; `metric_parameters.samples_per_item` |
| `score_details.score` | pass rate over non-retired items; a resampled item counts at its pass fraction ([SCORING.md](./SCORING.md#repeated-samples)) |
| `score_details.uncertainty` | `num_samples` (item count) only |
| `score_details.details` | `passed_items`, `items`, `pass_threshold`, `passed`, `retired_items`, `stale_score_items`, `lines_generated`, `lines_replayed`, `mean_generation_tps`, `total_generation_tokens`, `total_wall_time_sec` |
| `generation_config.generation_args` | `temperature`, `top_p`, `top_k`, `max_tokens`; no `prompt_template` |
| `generation_config.additional_details` | `system_prompt_key`, `system_prompt_sha`, `system_prompt_text`, `min_p`, `presence_penalty`, `repetition_penalty`, `repetition_context_size`, `chat_template_kwargs` (JSON) |
| `detailed_evaluation_results` | samples file path, sha256 checksum, row count |

The system prompt is model configuration, so it appears only under `generation_config.additional_details` and never in `prompt_template` or any prompt field. Efficiency is a notional score and is not exported; throughput and token and wall-time totals appear as plain numbers in `score_details.details`.

## Instance mapping

One samples line per non-retired item line; retired items are skipped, as in the report.

| EEE field | Source |
|---|---|
| `sample_id` | `itemId`; samples after the first carry `::s<n>` (`q1::s1`) |
| `sample_hash` | sha256 of `input.raw` followed by the reference strings. It excludes the system prompt and scorer, so it is not `itemHash` |
| `interaction_type` | `multi_turn` when the line has a `parentItemId`, else `single_turn` |
| `input.raw` | prompt text from the content store; for turn k>1 the turn's own prompt (the last message of the stored conversation) |
| `input.reference` | `expected` for `exact_match`, `set_match`, `ordered_match`; for other scorers the scorer config as one JSON string |
| `output` | single turn: `raw = [rawOutput]`, `reasoning_trace = [reasoning]` or `null`; multi turn: `null` |
| `messages` | multi turn only: stored gold history, the turn's prompt, then the model's answer (`rawOutput`, `reasoning_trace`). The system prompt is not included |
| `answer_attribution` | the scorer's extracted value (`exact_match`: last match of `extract`, commas stripped, method `regex`; other scorers: the cleaned `output`, method = scorer type), terminal |
| `evaluation` | `score`; `is_correct = score === 1`; `num_turns = turn` for multi turn |
| `token_usage` | `input_tokens` = `promptTokens`, `output_tokens` = `generationTokens`, `total_tokens` their sum; `input_tokens_cache_read` = `cachedPromptTokens` when measured |
| `performance` | `latency_ms = wallTimeSec * 1000`; `time_to_first_token_ms` = `ttftMs` and `generation_time_ms` = `decodeMs` when measured; `prompt_tps`, `generation_tps`, `peak_memory_gb` as strings |
| `error` | `error` |
| `metadata` | `item_id`, `prompt_name`, `prompt_hash`, `item_hash`, `scorer_hash`, `scorer_type`, `failure_kind`, `near_miss`, `score_details`, `stop_reason`, `seed`, `sample`, `parent_item_id`, `turn`, `cached_from_attempt`, and `history=gold` |

`history=gold` marks a multi-turn line whose earlier assistant messages are the challenge's gold answers, not the model's own outputs.

## Lossy points

- No first-class quant, hardware, chat template, or system prompt field exists in EEE; they are strings in `additional_details`.
- `input.reference` for `constraint`, `code_exec`, `game`, and `custom` scorers is a stringified scorer config; `scorer_hash` identifies it.
- `input.formatted` is omitted: the runtime applies the chat template and the archive does not record the rendered string.
- No confidence interval: the clustered standard error needs item families, which live in the challenge YAML and not in the archive.
- `reasoning_tokens` is unknown: the runtimes report one generation count covering reasoning and answer. Lines written before timing capture have no time to first token, generation time, or cache reads.
- Challenge category, tier, and tags are not in the archive and are not exported.
