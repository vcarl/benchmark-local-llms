/**
 * Startup chat-template verification gate.
 *
 * After a model backend boots and passes health, we assert its chat template
 * actually renders before handing back a `ServerHandle`. A silent template
 * fault (GGUF shipping no template → llama.cpp ChatML fallback; an mlx model
 * with no `chat_template` → role-concat fallback; Jinja that never executes)
 * would otherwise corrupt every score for that model with no error. This gate
 * turns that into a loud, typed abort (`TemplateVerificationError`).
 *
 * The check is intentionally conservative — it must never false-fail a
 * legitimate model. Notably it does NOT assert a separate system slot, because
 * Gemma/Mistral legitimately merge the system message into the first turn.
 *
 * ## Asymmetry between backends
 *
 * - **llamacpp** exposes rich inspection endpoints (`/props`,
 *   `/apply-template`), so we hard-fail on a concrete, observable fault.
 * - **mlx_lm.server** exposes only `/v1/*`, `/v1/models`, `/health` — no
 *   template inspection, and a generation "smoke probe" gives false confidence
 *   (a broken template still returns non-empty text). So mlx is verified
 *   OFFLINE by reading the model directory's `tokenizer_config.json` /
 *   `chat_template.jinja`. When that directory isn't locatable from what's in
 *   scope, we WARN-and-skip rather than hard-fail — we'd rather miss a fault
 *   than abort a legitimate boot on a path we couldn't resolve.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform";
import { Effect } from "effect";
import { TemplateVerificationError } from "../../errors/index.js";

/** Canonical sentinel injected into the probe so we can confirm it survives rendering. */
const PROBE_SENTINEL = "PROBE_TEMPLATE_CHECK_XYZZY";

/** Verification descriptor, discriminated on runtime. */
export type VerifyTemplateArgs =
  | {
      readonly runtime: "llamacpp";
      /** Port the booted llama-server is listening on. */
      readonly port: number;
    }
  | {
      readonly runtime: "mlx" | "omlx";
      /**
       * Resolved local model directory (the mlx artifact path / HF cache
       * snapshot dir). When undefined or unresolvable on disk, offline
       * verification warns-and-skips. See the module asymmetry note.
       */
      readonly modelDir?: string;
    };

/**
 * Verify the chat template for a freshly-booted server. Dispatches on runtime.
 * Resolves `void` on success (or on a documented mlx skip); fails with
 * `TemplateVerificationError` on a detected fault.
 */
export const verifyTemplate = (
  args: VerifyTemplateArgs,
): Effect.Effect<void, TemplateVerificationError, HttpClient.HttpClient> =>
  args.runtime === "llamacpp" ? verifyLlamacpp(args.port) : verifyMlx(args.modelDir, args.runtime);

// ── llamacpp ──────────────────────────────────────────────────────────────

const fail = (reason: string): TemplateVerificationError =>
  new TemplateVerificationError({ runtime: "llamacpp", reason });

const verifyLlamacpp = (
  port: number,
): Effect.Effect<void, TemplateVerificationError, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const base = `http://127.0.0.1:${port}`;

    // 1) GET /props → assert chat_template is a non-empty string. Catches the
    //    missing-template → ChatML fallback (llama-server reports the template
    //    it actually loaded here).
    const props = yield* client.get(`${base}/props`).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap((r) => r.json),
      Effect.mapError((e) => fail(`could not read /props: ${describeError(e)}`)),
    );

    const chatTemplate = (props as { readonly chat_template?: unknown })?.chat_template;
    if (typeof chatTemplate !== "string" || chatTemplate.trim().length === 0) {
      return yield* Effect.fail(
        fail(
          "/props reported an empty or missing chat_template — the server likely fell back to its built-in ChatML template (GGUF shipped no embedded template).",
        ),
      );
    }

    // 2) POST /apply-template with a canonical probe → assert the rendered
    //    prompt survived the user content AND contains no unrendered Jinja.
    const probeBody = {
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: PROBE_SENTINEL },
      ],
    };

    const request = yield* HttpClientRequest.post(`${base}/apply-template`).pipe(
      HttpClientRequest.bodyJson(probeBody),
      Effect.mapError((e) => fail(`could not encode /apply-template probe: ${describeError(e)}`)),
    );

    const rendered = yield* client.execute(request).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap((r) => r.json),
      Effect.mapError((e) => fail(`could not read /apply-template: ${describeError(e)}`)),
    );

    const prompt = (rendered as { readonly prompt?: unknown })?.prompt;
    if (typeof prompt !== "string" || prompt.length === 0) {
      return yield* Effect.fail(fail("/apply-template returned an empty or non-string `prompt`."));
    }
    if (!prompt.includes(PROBE_SENTINEL)) {
      return yield* Effect.fail(
        fail(
          `/apply-template dropped the probe user content (${PROBE_SENTINEL} not found in the rendered prompt) — the template is not threading the user turn through.`,
        ),
      );
    }
    if (prompt.includes("{{") || prompt.includes("{%")) {
      return yield* Effect.fail(
        fail(
          "/apply-template returned a prompt containing unrendered Jinja (`{{` or `{%`) — the chat template did not actually execute.",
        ),
      );
    }

    // 3) OPTIONAL double-BOS check, WARN-ONLY. A duplicate leading token is a
    //    soft signal (template prepends a BOS that the tokenizer also adds);
    //    it never blocks boot. Skipped silently if /tokenize is unavailable.
    yield* warnOnDoubleBos(client, base, prompt);

    yield* Effect.logInfo("chat template verified (props + apply-template)").pipe(
      Effect.annotateLogs("scope", "template"),
    );
  });

/**
 * Best-effort double-BOS warning. Tokenizes the rendered prompt with
 * `add_special=true` and warns if the first two token ids are identical
 * (a common symptom of a template that hard-codes a BOS the tokenizer also
 * injects). Never fails — any error here is swallowed, since it's the least
 * robust of the checks.
 */
const warnOnDoubleBos = (
  client: HttpClient.HttpClient,
  base: string,
  prompt: string,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const request = yield* HttpClientRequest.post(`${base}/tokenize`).pipe(
      HttpClientRequest.bodyJson({ content: prompt, add_special: true }),
    );
    const body = yield* client.execute(request).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap((r) => r.json),
    );
    const tokens = (body as { readonly tokens?: unknown })?.tokens;
    if (
      Array.isArray(tokens) &&
      tokens.length >= 2 &&
      typeof tokens[0] === "number" &&
      tokens[0] === tokens[1]
    ) {
      yield* Effect.logWarning(
        `possible double-BOS: rendered prompt begins with duplicate leading token id ${tokens[0]} (template may prepend a BOS the tokenizer also adds). Not blocking boot.`,
      ).pipe(Effect.annotateLogs("scope", "template"));
    }
  }).pipe(Effect.ignore);

// ── mlx / omlx (offline) ──────────────────────────────────────────────────────────

const skip = (runtime: OfflineRuntime, reason: string): Effect.Effect<void> =>
  Effect.logWarning(`${runtime} template verification skipped: ${reason}`).pipe(
    Effect.annotateLogs("scope", "template"),
  );

/**
 * Runtimes verified offline against a model directory. `omlx` serves the same
 * MLX safetensors artifacts as `mlx` and exposes no template-inspection
 * endpoint either, so both share one code path; only the error tag differs.
 */
type OfflineRuntime = "mlx" | "omlx";

/**
 * Offline mlx check. mlx_lm.server has no template-inspection endpoint and a
 * generation smoke probe gives false confidence, so we read the model
 * directory directly. If the directory or its tokenizer config is not
 * locatable, we WARN-and-skip (documented asymmetry) rather than hard-fail.
 */
const verifyMlx = (
  modelDir: string | undefined,
  runtime: OfflineRuntime,
): Effect.Effect<void, TemplateVerificationError, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    if (modelDir === undefined) {
      return yield* skip(runtime, "model directory path was not available in scope");
    }
    if (!existsSync(modelDir)) {
      return yield* skip(runtime, `model directory does not exist on disk (${modelDir})`);
    }

    // A sibling externalized template counts as a valid, non-empty template.
    const siblingTemplate = path.join(modelDir, "chat_template.jinja");
    if (existsSync(siblingTemplate)) {
      const contents = yield* Effect.try(() => readFileSync(siblingTemplate, "utf-8")).pipe(
        Effect.orElseSucceed(() => ""),
      );
      if (contents.trim().length > 0) {
        yield* Effect.logInfo("chat template verified (chat_template.jinja)").pipe(
          Effect.annotateLogs("scope", "template"),
        );
        return;
      }
    }

    const tokenizerConfig = path.join(modelDir, "tokenizer_config.json");
    if (!existsSync(tokenizerConfig)) {
      return yield* skip(
        runtime,
        `tokenizer_config.json not found and no non-empty chat_template.jinja (${modelDir})`,
      );
    }

    const raw = yield* Effect.try(() => readFileSync(tokenizerConfig, "utf-8")).pipe(
      Effect.mapError(
        (e) =>
          new TemplateVerificationError({
            runtime,
            reason: `could not read tokenizer_config.json: ${describeError(e)}`,
          }),
      ),
    );

    const parsed = yield* Effect.try(() => JSON.parse(raw) as unknown).pipe(
      Effect.mapError(
        () =>
          new TemplateVerificationError({
            runtime,
            reason: "tokenizer_config.json is not valid JSON",
          }),
      ),
    );

    const chatTemplate = (parsed as { readonly chat_template?: unknown })?.chat_template;
    if (typeof chatTemplate !== "string" || chatTemplate.trim().length === 0) {
      return yield* Effect.fail(
        new TemplateVerificationError({
          runtime,
          reason:
            "tokenizer_config.json has no non-empty `chat_template` and there is no sibling chat_template.jinja — the server would fall back to silent role-concatenation.",
        }),
      );
    }

    yield* Effect.logInfo("chat template verified (tokenizer_config.json)").pipe(
      Effect.annotateLogs("scope", "template"),
    );
  });

// ── helpers ─────────────────────────────────────────────────────────────────

const describeError = (e: unknown): string => {
  const tag = (e as { readonly _tag?: string })?._tag;
  const message = (e as { readonly message?: string })?.message;
  return message ?? tag ?? String(e);
};
