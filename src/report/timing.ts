/**
 * Evaluation timing (docs/EVAL-TIMING.md): per (item, model), whether the
 * model's weights could have been trained on the item's public prompt.
 *
 * - `item-dates.json`: prompt digest → when that exact prompt first
 *   became public (`scripts/timing/date-items.ts`). No entry: not public as
 *   of `asOf`.
 * - `model-dates.yaml`: modelKey → the base model's release date and stated
 *   training cutoff, each with its source.
 *
 * A label is disclosure: it never changes a score or a rank. It sits beside
 * the rows, never in them, so an archival dataset's `rowsDigest` holds.
 */
import { FileSystem } from "@effect/platform";
import { Effect, Option, Schema } from "effect";
import type { ResolvedChallenge } from "../config/challenges.js";
import { promptContent } from "../config/challenges.js";
import { parseYaml } from "../config/yaml.js";
import { SnapshotInvalid } from "../errors/index.js";
import type { Row } from "../legacy/rows.js";
import { sha256Hex } from "../store/digest.js";

export const TIMING_LABELS = [
  "unpublished",
  "predates",
  "cutoff-claimed",
  "exposable",
  "unknown",
] as const;
export type TimingLabel = (typeof TIMING_LABELS)[number];

const Day = Schema.String.pipe(Schema.pattern(/^\d{4}(-\d{2}(-\d{2})?)?$/));

const ItemDate = Schema.Struct({ publishedAt: Schema.String, evidence: Schema.String });
export const ItemDatesFile = Schema.Struct({
  asOf: Schema.String,
  source: Schema.String,
  items: Schema.Record({ key: Schema.String, value: ItemDate }),
});
export type ItemDatesFile = typeof ItemDatesFile.Type;

const ModelDate = Schema.Struct({
  model: Schema.optional(Schema.String),
  note: Schema.optional(Schema.String),
  released: Schema.optional(Day),
  releasedSource: Schema.optional(Schema.String),
  releasedNote: Schema.optional(Schema.String),
  cutoff: Schema.optional(Day),
  cutoffSource: Schema.optional(Schema.String),
  cutoffNote: Schema.optional(Schema.String),
});
export type ModelDate = typeof ModelDate.Type;
export const ModelDatesFile = Schema.Record({ key: Schema.String, value: ModelDate });

/** A date at its precision as the inclusive day range it covers: `2025-06` is June 1–30. */
const span = (d: string): [string, string] => {
  const [y, m, day] = d.split("-");
  if (day !== undefined) return [d, d];
  if (m !== undefined) {
    const last = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
    return [`${y}-${m}-01`, `${y}-${m}-${String(last).padStart(2, "0")}`];
  }
  return [`${y}-01-01`, `${y}-12-31`];
};

/** -1 when `a` ends before `b` starts, 1 when it starts after `b` ends, 0 when they overlap. */
export const compareDays = (a: string, b: string): -1 | 0 | 1 => {
  const [a0, a1] = span(a);
  const [b0, b1] = span(b);
  return a1 < b0 ? -1 : a0 > b1 ? 1 : 0;
};

/**
 * The label of one item for one model. `item`: the item's public date (UTC
 * day), `null` when it is not public, `undefined` when unknown.
 */
export const timingLabel = (
  item: string | null | undefined,
  weights: Pick<ModelDate, "released" | "cutoff"> | undefined,
): TimingLabel => {
  if (item === null) return "unpublished";
  if (item === undefined || weights?.released === undefined) return "unknown";
  const released = compareDays(weights.released, item);
  if (released < 0) return "predates";
  if (released === 0) return "unknown";
  return weights.cutoff !== undefined && compareDays(weights.cutoff, item) < 0
    ? "cutoff-claimed"
    : "exposable";
};

/** A snapshot's timing block: the dates behind each row's label counts. */
export interface Timing {
  /** `item-dates.json`'s `asOf` and `source`; null without the file (every item unknown). */
  readonly itemDates: { readonly asOf: string; readonly source: string } | null;
  /** `<challenge>/<item>` → its public date and evidence; null when not public. Absent: unknown. */
  readonly items: Record<
    string,
    { readonly publishedAt: string; readonly evidence: string } | null
  >;
  /** modelKey → its dates (sources and notes kept), for the rows' modelKeys that have an entry. */
  readonly models: Record<string, ModelDate>;
  /** rowId → items of its scored cells per label. */
  readonly rows: Record<string, Record<TimingLabel, number>>;
}

/** Fail unless every date in `model-dates.yaml` names its source. */
const unsourced = (models: Record<string, ModelDate>): string[] =>
  Object.entries(models).flatMap(([k, m]) =>
    (["released", "cutoff"] as const).flatMap((f) =>
      m[f] !== undefined && m[`${f}Source`] === undefined ? [`${k}.${f}`] : [],
    ),
  );

/** Read a JSON or YAML dates file; a missing file is none. */
const readDates = <A, I>(file: string, schema: Schema.Schema<A, I>, yaml: boolean) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const bytes = yield* fs.readFile(file).pipe(Effect.option);
    if (Option.isNone(bytes)) return null;
    const src = new TextDecoder().decode(bytes.value);
    const invalid = (detail: string) => new SnapshotInvalid({ path: file, detail });
    const raw = yaml
      ? yield* parseYaml(file, src).pipe(Effect.mapError((e) => invalid(e.message)))
      : yield* Effect.try(() => JSON.parse(src) as unknown).pipe(
          Effect.mapError(() => invalid("not JSON")),
        );
    const value = yield* Schema.decodeUnknown(schema)(raw).pipe(
      Effect.mapError((e) => invalid(e.message)),
    );
    return { value, digest: sha256Hex(bytes.value) };
  });

/** Load both dates files (paths undefined or missing: none); a date without a source fails. */
export const loadTimingInputs = (itemDatesPath?: string, modelDatesPath?: string) =>
  Effect.gen(function* () {
    const items =
      itemDatesPath === undefined ? null : yield* readDates(itemDatesPath, ItemDatesFile, false);
    const models =
      modelDatesPath === undefined ? null : yield* readDates(modelDatesPath, ModelDatesFile, true);
    const bad = unsourced(models?.value ?? {});
    if (modelDatesPath !== undefined && bad.length > 0)
      return yield* Effect.fail(
        new SnapshotInvalid({
          path: modelDatesPath,
          detail: `dates without a source: ${bad.join(", ")}`,
        }),
      );
    return { items, models };
  });
export type TimingInputs = Effect.Effect.Success<ReturnType<typeof loadTimingInputs>>;

/** The timing block of `rows` over the challenge set. */
export const timingOf = (
  rows: ReadonlyArray<Row>,
  challenges: ReadonlyArray<ResolvedChallenge>,
  { items: itemDates, models: modelDates }: TimingInputs,
): Timing => {
  const items: Timing["items"] = {};
  const day: Record<string, string | null | undefined> = {};
  for (const c of challenges)
    for (const i of c.items) {
      const key = `${c.id}/${i.itemId}`;
      if (itemDates === null) continue;
      const e = itemDates.value.items[sha256Hex(promptContent(i.prompt))];
      items[key] = e ?? null;
      day[key] = e === undefined ? null : e.publishedAt.slice(0, 10);
    }
  const models: Record<string, ModelDate> = {};
  const counts: Timing["rows"] = {};
  for (const row of rows) {
    const weights = modelDates?.value[row.modelKey];
    if (weights !== undefined) models[row.modelKey] = weights;
    const n = Object.fromEntries(TIMING_LABELS.map((l) => [l, 0])) as Record<TimingLabel, number>;
    for (const c of challenges) {
      if (row.cells[c.id]?.status !== "scored") continue;
      for (const i of c.items) n[timingLabel(day[`${c.id}/${i.itemId}`], weights)]++;
    }
    counts[row.rowId] = n;
  }
  return {
    itemDates:
      itemDates === null ? null : { asOf: itemDates.value.asOf, source: itemDates.value.source },
    items,
    models,
    rows: counts,
  };
};
