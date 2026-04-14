/**
 * Run identity helpers (§2.4). A `runId` is the archive filename stem and the
 * back-reference stamped on every {@link ExecutionResult} written during a run.
 *
 * Shape: `{YYYY-MM-DD}_{modelSlug}_{quant}_{shortId}` (requirements §2.4).
 *   - `YYYY-MM-DD`  — date portion of `startedAt`, UTC
 *   - `modelSlug`   — lowercased, non-alphanumerics collapsed to `-`
 *   - `quant`       — as-is from the model config (may be empty)
 *   - `shortId`     — 6 hex chars, derived from the `startedAt` millis so tests
 *                     that pin the clock get deterministic IDs.
 *
 * The clock is supplied via `Effect.Clock` so tests can pin time with
 * `TestClock`. `archiveFileName` is a pure derivation — passing a runId is
 * enough; no extra state.
 */
import { Clock, Effect } from "effect";
import type { ModelConfig } from "../schema/model.js";

const slugify = (value: string): string => {
  const lowered = value.toLowerCase();
  const cleaned = lowered.replace(/[^a-z0-9]+/g, "-");
  const trimmed = cleaned.replace(/^-+|-+$/g, "");
  return trimmed.length === 0 ? "model" : trimmed;
};

const shortIdFromMillis = (millis: number): string => {
  // Hex-encode the low 24 bits of the millis timestamp. Two millisecond-
  // apart runs will still get distinct IDs (16.7M ms ~= 4.6 hours of
  // uniqueness before wrap), and tests pinning the clock get a stable value.
  const low = Math.abs(millis) & 0xffffff;
  return low.toString(16).padStart(6, "0");
};

const datePart = (isoTimestamp: string): string => {
  const idx = isoTimestamp.indexOf("T");
  return idx < 0 ? isoTimestamp : isoTimestamp.slice(0, idx);
};

const modelSlug = (model: ModelConfig): string => {
  const basis = model.name ?? model.artifact;
  return slugify(basis);
};

const quantPart = (model: ModelConfig): string => slugify(model.quant ?? "");

/**
 * Build a runId for the given model and wall-clock. Stable across repeated
 * calls with the same inputs; tests can pin the clock via `TestClock`.
 */
export const makeRunId = (
  model: ModelConfig,
): Effect.Effect<{
  readonly runId: string;
  readonly startedAt: string;
  readonly startedAtMs: number;
}> =>
  Effect.gen(function* () {
    const millis = yield* Clock.currentTimeMillis;
    const iso = new Date(millis).toISOString();
    const slug = modelSlug(model);
    const quant = quantPart(model);
    const parts = [datePart(iso), slug, quant, shortIdFromMillis(millis)].filter(
      (p) => p.length > 0,
    );
    return {
      runId: parts.join("_"),
      startedAt: iso,
      startedAtMs: millis,
    };
  });

/**
 * Archive file name from a runId. Kept as a separate pure helper so callers
 * that already have a runId (e.g. tests, the migration tool) can derive the
 * filename without the full clock dance.
 */
export const archiveFileName = (runId: string): string => `${runId}.jsonl`;
