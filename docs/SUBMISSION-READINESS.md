# Submission readiness

Gate for publishing any data from this harness to an external venue: the Every Eval Ever (EEE) datastore, Hugging Face datasets or model-card eval results, or any leaderboard. Every item below must be `done` before a submission is opened.

## Policy

- Nothing is submitted upstream. This document is the gate for revisiting that.
- All items are public. The design does not rely on secrecy at any phase.
- Efficiency is a notional score and is not comparable across hardware. It is never presented as a cross-hardware metric.
- No LLM-as-judge anywhere. Every score comes from our own deterministic scorers.
- The system prompt is LLM-config. Exports carry it only in config and generation metadata.

Background: [data-formats research](research/data-formats.md), [EEE export](EEE-EXPORT.md), [errata](ERRATA.md), [statistics](research/tracing-and-statistics.md).

## Checklist

Each item: check, why, how, status.

### Export validity

1. **Upstream validator run** - Exported files pass EEE's own validator, not only our vendored-schema tests. Why: the validator also runs cross-file checks (UUID/folder match, `evaluation_id`, `model_id`, row count) and warnings block merge. How: `uv run python -m every_eval_ever validate` on an export tree; exit 0 required. Status: open (cross-file checks unverified).
2. **Schema pin and version** - Re-pin the vendored schemas to the latest upstream commit and re-validate; confirm the version the datastore expects. Why: upstream README prose says "v0.2" while schemas say `0.3.0`, with no stated compatibility policy. How: follow [`src/export/eee/schemas/README.md`](../src/export/eee/schemas/README.md) (new commit, update `EEE_SCHEMA_VERSION`), rerun export tests plus item 1. Status: open.
3. **Collection and layout** - `collection` (`llms-bench`) is a placeholder; settle the directory layout, `retrieved_timestamp` convention (currently `finishedAt`, deterministic), and `evaluator_relationship` (`third_party` default; `first_party` only for a model's developer). How: check against datastore `CONTRIBUTING.md`. Status: open.
4. **Model id and quantization** - `model_info.id` is `artifact@quant`, which keeps Q4 and Q8 apart but is not the upstream convention; quant and hardware live only in `additional_details`. Why: grouping consumers may merge or split runs unexpectedly. How: inspect how the datastore groups ids; whether to propose upstream quantization/hardware fields is Carl's later decision. Status: open.
5. **System prompt text vs hash** - Decide whether exports carry `system_prompt_text` or only `system_prompt_sha`/`system_prompt_key`. Why: text aids replication; the hash identifies the prompt but cannot reproduce it. Status: open.

### Rights and provenance

6. **Licensing** - Record our challenge-content license; per-dataset upstream licenses and redistribution terms for prompts and outputs (each import needs a per-dataset check); model license terms on publishing outputs. Why: some benchmark licenses forbid redistributing items, and prompts are published in full. How: license and citation in each challenge header and in the dataset card. Repository code is AGPL-3.0-only (`LICENSE`); third-party material is listed in `NOTICE`. Open: the license for challenge content and published results (data), the upstream source and license of `templates/mistral-v7-tekken.jinja`, whether the possible CC BY-SA 4.0 upstream of the 20 Schema-Guided-Dialogue-style tool schemas vendored from BFCL (`NOTICE`) carries through its Apache-2.0 release, and a contributor agreement for external submissions so the copyright holder keeps the option to relicense. Status: open.
7. **PII and provenance** - `hardwareId` carries no hostname or PII; `submitter` is a public handle (`@` refused); local-path artifacts export as basename only; scan exports for absolute paths and usernames. How: `grep -rE '/Users/|/home/' eee-export/`. Status: open.
8. **Weights hash gap (legacy/alpha only)** - A legacy `configHash` covers the artifact name, not the weights-file hash, so a re-quantized or replaced file under the same name is indistinguishable in the alpha data. A v4 config digest includes `weightsDigest` when the weights are local, so v4 bundles do not have this gap, except 895 draft bundles (39 configs) whose digest was inferred from file modification times before release ([ARCHIVE-FORMAT § Inferred weights digests](./ARCHIVE-FORMAT.md#inferred-weights-digests-draft-2026-11)). Disclose it for alpha, and the inferred digests for the draft, in the dataset card. Status: open (known gap, alpha; inferred, draft).

### Data integrity

9. **Errata and baseline clean** - The `npm test` errata gate passes ([ERRATA-PROCESS](ERRATA-PROCESS.md)); the exported set has no `stale_hash` or `interrupted` attempts, and every exported attempt is complete. How: `npm test`; confirm the export list against errata. Status: open.
10. **Green test suite** - `npm test` passes on the commit the export is built from. How: `npm test`. Status: open (check at submission time).

### Reporting

11. **Confidence intervals** - EEE aggregates carry no CI (clustered SE needs item families, which live in challenge YAML, not the archive). Decide how intervals are conveyed (dataset card or an accompanying table). The in-app CR1 intervals use Student-t critical values with C − 1 degrees of freedom; CR1 still undercovers with few clusters, so a published interval comes from a small-cluster correction (CR2 or wild cluster bootstrap) in an offline script. How: see [statistics](research/tracing-and-statistics.md). Status: open.
12. **Sample count and pass^k** - Samples K is consistent across compared configs; pass^k uses the unbiased estimator C(c,k)/C(n,k) at a fixed k, reported per config. Status: open.
13. **Timing and efficiency** - `timingSource` (server vs client) values are not comparable and must be labelled or excluded; efficiency is excluded from submissions entirely. Status: open.
