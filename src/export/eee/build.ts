/**
 * Every Eval Ever (EEE, schema 0.3.0) projection of one attempt archive: an
 * aggregate eval JSON plus the instance-level samples JSONL. Built from
 * `loadAttemptReconstruction`, so it needs only the `.jsonl` and its content
 * store, read through a dataset's pins. Mapping rules are documented in
 * docs/EEE-EXPORT.md.
 */
import { createHash } from "node:crypto";
import { FileSystem, Path } from "@effect/platform";
import { Effect, Option, Schema } from "effect";
import { shortSha256 } from "../../legacy/identity.js";
import {
  type BlobReader,
  loadAttemptReconstruction,
  NotReconstructible,
  type ReconstructedAttempt,
  type ReconstructedItem,
} from "../../legacy/reconstruct.js";
import { groupSamples } from "../../schema/attempt.js";
import type { ScorerConfig } from "../../schema/scorer.js";

export const EEE_SCHEMA_VERSION = "0.3.0";

export interface EeeOptions {
  /** `source_metadata.evaluator_relationship`. */
  readonly relationship: "first_party" | "third_party" | "collaborative" | "other";
  /** First path segment under `data/`. */
  readonly collection: string;
}

export interface EeeResult {
  readonly aggregatePath: string;
  readonly samplesPath: string;
  readonly rows: number;
}

type Strings = Record<string, string>;

/** Drop undefined entries and stringify the rest. */
const strs = (o: Record<string, unknown>): Strings =>
  Object.fromEntries(
    Object.entries(o)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]),
  );

const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

/** A UUID-shaped (v4 nibbles) id derived from the attempt id, so re-exports are stable. */
const uuidOf = (seed: string): string => {
  const h = sha256(seed);
  const variant = "89ab"[Number.parseInt(h[16] ?? "0", 16) % 4];
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

const slug = (s: string): string => s.replace(/[^A-Za-z0-9._@-]/g, "_");

/** `model_info.id` and its developer: an HF-style `org/name` artifact keeps its org; a local path does not. */
const modelIdOf = (artifact: string, quant: string | undefined) => {
  const hf = /^[^/.][^/]*\/[^/]+$/.test(artifact);
  const base = hf ? artifact : (artifact.split("/").pop() ?? artifact);
  return {
    id: quant === undefined ? base : `${base}@${quant}`,
    developer: hf ? artifact.split("/")[0] : undefined,
  };
};

const referenceOf = (s: ScorerConfig): string[] =>
  s.type === "exact_match"
    ? [s.expected]
    : s.type === "set_match" || s.type === "ordered_match"
      ? [...s.expected]
      : [JSON.stringify(s)]; // ponytail: rule/test scorers have no gold string; scorerHash in metadata names the full config

/** The value the scorer extracted; exact_match replays its documented last-match rule. */
const extractionOf = (s: ScorerConfig, output: string) => {
  if (s.type !== "exact_match") return { value: output, method: s.type };
  const m = Array.from(output.matchAll(new RegExp(s.extract, "g"))).at(-1);
  return { value: (m?.[1] ?? m?.[0] ?? output).replace(/,/g, ""), method: "regex" };
};

const Conversation = Schema.parseJson(
  Schema.Array(Schema.Struct({ role: Schema.String, content: Schema.String })),
);

/** Turn k>1 blobs hold the conversation JSON (gold history + the turn's prompt). */
const parseConversation = (text: string) =>
  Option.getOrUndefined(Schema.decodeUnknownOption(Conversation)(text));

/** `fileDigest` is the SHA-256 of the attempt file's bytes, the digest that pins a legacy attempt. */
export const buildEee = (recon: ReconstructedAttempt, fileDigest: string, opts: EeeOptions) => {
  const { manifest: m, systemPromptText } = recon;
  const retired = new Set(m.retiredItems ?? []);
  const live = recon.items.filter(({ item }) => !retired.has(item.promptName));

  const { id: modelId, developer } = modelIdOf(m.artifact, m.quant);
  const retrieved = m.finishedAt ?? m.startedAt;
  const evaluationId = fileDigest;
  const resultId = `${m.challengeId}/pass_rate`;

  const rows = live.map((r) => instanceRow(r, { evaluationId, resultId, modelId }));

  const groups = groupSamples(live.map((r) => ({ ...r, itemId: r.item.itemId })));
  const passed = groups.reduce(
    (a, g) => a + g.filter((x) => x.item.score === 1).length / g.length,
    0,
  );
  const gen = live.map((r) => r.item).filter((i) => i.generationTps > 0);
  const sum = (f: (i: (typeof live)[number]["item"]) => number) =>
    live.reduce((a, r) => a + f(r.item), 0);

  const uuid = uuidOf(m.attemptId);
  const modelDir = slug(modelId.split("/").pop() ?? modelId);
  const relDir = `data/${slug(opts.collection)}/${slug(developer ?? "local")}/${modelDir}`;
  const samplesText = rows.map((r) => `${JSON.stringify(r)}\n`).join("");

  const aggregate = {
    schema_version: EEE_SCHEMA_VERSION,
    evaluation_id: evaluationId,
    evaluation_timestamp: m.startedAt,
    retrieved_timestamp: retrieved,
    source_metadata: {
      source_name: "llms-bench attempt archive",
      source_type: "evaluation_run",
      source_organization_name: m.submitter ?? "local",
      evaluator_relationship: opts.relationship,
      additional_details: strs({
        attempt_id: m.attemptId,
        invocation_id: m.invocationId,
        restamped_from: m.restampedFrom,
        hardware_id: m.env.hardwareId,
        hardware: m.env.hardware,
        platform: m.env.platform,
        benchmark_git_sha: m.env.benchmarkGitSha,
      }),
    },
    eval_library: {
      name: "llms-bench",
      version: m.env.benchmarkGitSha,
      additional_details: strs({ archive_schema_version: m.schemaVersion }),
    },
    model_info: {
      name: m.configId,
      id: modelId,
      ...(developer === undefined ? {} : { developer }),
      inference_engine: { name: m.runtime, version: m.env.runtimeVersion },
      additional_details: {
        deployment_type: "self_deployed",
        model_availability: "open_weights",
        ...strs({
          artifact: m.artifact,
          quant: m.quant,
          runtime: m.runtime,
          runtime_version: m.env.runtimeVersion,
          config_id: m.configId,
          config_hash: m.configHash,
          chat_template: m.chatTemplate,
          chat_template_sha: m.chatTemplateSha,
          ctx_size: m.ctxSize,
          extra_args: m.extraArgs,
          server_flags: m.serverFlags,
        }),
      },
    },
    evaluation_results: [
      {
        evaluation_result_id: resultId,
        evaluation_name: m.challengeId,
        evaluation_timestamp: m.finishedAt ?? m.startedAt,
        source_data: {
          dataset_name: m.challengeId,
          source_type: "other",
          additional_details: strs({
            challenge_version: m.challengeVersion,
            challenge_hash: m.challengeHash,
          }),
        },
        metric_config: {
          evaluation_description:
            "Fraction of items scoring exactly 1; a resampled item counts at its pass fraction.",
          metric_id: "pass_rate",
          metric_name: "Pass rate",
          metric_kind: "pass_rate",
          metric_unit: "proportion",
          lower_is_better: false,
          score_type: "continuous",
          min_score: 0,
          max_score: 1,
          metric_parameters: { samples_per_item: Math.max(1, ...groups.map((g) => g.length)) },
        },
        score_details: {
          score: groups.length === 0 ? 0 : passed / groups.length,
          uncertainty: { num_samples: groups.length },
          details: strs({
            passed_items: passed,
            items: groups.length,
            pass_threshold: m.passThreshold,
            passed: m.aggregate.passed,
            retired_items: retired.size,
            stale_score_items: m.staleScoreItems?.length,
            lines_generated: m.lines?.generated,
            lines_replayed: m.lines?.replayed,
            mean_generation_tps:
              gen.length === 0 ? undefined : sum((i) => i.generationTps) / gen.length,
            total_generation_tokens: sum((i) => i.generationTokens),
            total_wall_time_sec: sum((i) => i.wallTimeSec),
          }),
        },
        generation_config: {
          generation_args: {
            temperature: m.temperature,
            ...(m.topP === undefined ? {} : { top_p: m.topP }),
            ...(m.topK === undefined ? {} : { top_k: m.topK }),
            max_tokens: m.maxTokens,
          },
          // The system prompt is model-config, so it lives here and never in prompt_template or input.
          additional_details: strs({
            system_prompt_key: m.systemPrompt,
            system_prompt_sha: shortSha256(systemPromptText),
            system_prompt_text: systemPromptText,
            min_p: m.minP,
            presence_penalty: m.presencePenalty,
            presence_context_size: m.presenceContextSize,
            repetition_penalty: m.repetitionPenalty,
            repetition_context_size: m.repetitionContextSize,
            chat_template_kwargs: m.chatTemplateKwargs,
          }),
        },
      },
    ],
    detailed_evaluation_results: {
      format: "jsonl",
      file_path: `${relDir}/${uuid}_samples.jsonl`,
      hash_algorithm: "sha256",
      checksum: sha256(samplesText),
      total_rows: rows.length,
    },
  };

  return { aggregate, samplesText, relDir, uuid, rows: rows.length };
};

const instanceRow = (
  { item, promptText, scorer }: ReconstructedItem,
  ctx: { evaluationId: string; resultId: string; modelId: string },
) => {
  const multi = item.parentItemId !== undefined;
  const convo = multi && (item.turn ?? 1) > 1 ? parseConversation(promptText) : undefined;
  const raw = convo ? (convo.at(-1)?.content ?? promptText) : promptText;
  const reference = referenceOf(scorer);
  const extracted = extractionOf(scorer, item.output);
  const messages = multi
    ? [
        ...(convo ?? [{ role: "user", content: raw }]),
        { role: "assistant", content: item.rawOutput },
      ].map((msg, i, all) => ({
        turn_idx: i,
        role: msg.role,
        content: msg.content,
        ...(i === all.length - 1 && item.reasoning !== null
          ? { reasoning_trace: item.reasoning }
          : {}),
      }))
    : null;

  return {
    schema_version: EEE_SCHEMA_VERSION,
    evaluation_id: ctx.evaluationId,
    model_id: ctx.modelId,
    evaluation_name: ctx.resultId.split("/")[0],
    evaluation_result_id: ctx.resultId,
    sample_id: (item.sample ?? 0) > 0 ? `${item.itemId}::s${item.sample}` : item.itemId,
    // Differs from itemHash: excludes system prompt and scorer.
    sample_hash: sha256(raw + reference.join("")),
    interaction_type: multi ? "multi_turn" : "single_turn",
    input: { raw, reference },
    output: multi
      ? null
      : {
          raw: [item.rawOutput],
          reasoning_trace: item.reasoning === null ? null : [item.reasoning],
        },
    messages,
    answer_attribution: [
      {
        turn_idx: messages === null ? 0 : messages.length - 1,
        source: messages === null ? "output.raw" : `messages[${messages.length - 1}].content`,
        extracted_value: extracted.value,
        extraction_method: extracted.method,
        is_terminal: true,
      },
    ],
    evaluation: {
      score: item.score,
      is_correct: item.score === 1,
      ...(multi ? { num_turns: item.turn ?? 1 } : {}),
    },
    token_usage: {
      input_tokens: Math.round(item.promptTokens),
      output_tokens: Math.round(item.generationTokens),
      total_tokens: Math.round(item.promptTokens + item.generationTokens),
      ...(item.cachedPromptTokens === undefined
        ? {}
        : { input_tokens_cache_read: Math.round(item.cachedPromptTokens) }),
    },
    performance: {
      latency_ms: item.wallTimeSec * 1000,
      ...(item.ttftMs === undefined ? {} : { time_to_first_token_ms: item.ttftMs }),
      ...(item.decodeMs === undefined ? {} : { generation_time_ms: item.decodeMs }),
      additional_details: strs({
        prompt_tps: item.promptTps,
        generation_tps: item.generationTps,
        peak_memory_gb: item.peakMemoryGb,
      }),
    },
    error: item.error,
    metadata: strs({
      item_id: item.itemId,
      prompt_name: item.promptName,
      prompt_hash: item.promptHash,
      item_hash: item.itemHash,
      scorer_hash: item.scorerHash,
      scorer_type: scorer.type,
      failure_kind: item.failureKind,
      near_miss: item.nearMiss,
      score_details: item.scoreDetails,
      stop_reason: item.stopReason,
      seed: item.seed,
      sample: item.sample ?? 0,
      parent_item_id: item.parentItemId,
      turn: item.turn,
      // Earlier assistant turns are gold answers, not the model's own.
      history: convo === undefined ? undefined : "gold",
      cached_from_attempt: item.cachedFrom?.attemptId,
    }),
  };
};

/**
 * Write `<out>/data/<collection>/<developer>/<model>/<uuid>.json` and
 * `<uuid>_samples.jsonl`, reading content-store blobs through `read` (a
 * dataset's pinned reader, src/legacy/pinned.ts).
 */
export const exportEee = <E>(
  archiveFile: string,
  outDir: string,
  opts: EeeOptions,
  read: BlobReader<E>,
): Effect.Effect<EeeResult, Error | E, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const recon = yield* loadAttemptReconstruction(archiveFile, read).pipe(
      Effect.mapError((e) =>
        e instanceof NotReconstructible ? new Error(`${e.path}: ${e.reason}`) : e,
      ),
    );
    const bytes = yield* fs
      .readFile(archiveFile)
      .pipe(Effect.mapError((cause) => new Error(`read ${archiveFile}: ${String(cause)}`)));
    if (recon.manifest.finishedAt === null || recon.manifest.interrupted) {
      return yield* Effect.fail(new Error(`${archiveFile}: attempt is not complete`));
    }
    const built = buildEee(recon, createHash("sha256").update(bytes).digest("hex"), opts);
    const dir = path.join(outDir, built.relDir);
    const aggregatePath = path.join(dir, `${built.uuid}.json`);
    const samplesPath = path.join(dir, `${built.uuid}_samples.jsonl`);
    const io = (p: string) => (cause: unknown) => new Error(`write ${p}: ${String(cause)}`);
    yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.mapError(io(dir)));
    yield* fs
      .writeFileString(samplesPath, built.samplesText)
      .pipe(Effect.mapError(io(samplesPath)));
    yield* fs
      .writeFileString(aggregatePath, `${JSON.stringify(built.aggregate, null, 2)}\n`)
      .pipe(Effect.mapError(io(aggregatePath)));
    return { aggregatePath, samplesPath, rows: built.rows };
  });
