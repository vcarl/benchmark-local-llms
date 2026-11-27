/**
 * Report rows: the selection step between executions and a ranking. A legacy
 * row is one configuration (`configHash`) on one machine (`hardwareId`),
 * scored against one challenge set ({@link buildRows}); a v4 row is selected
 * in src/report/v4-rows.ts. Both assemble cells and rows with
 * {@link buildCell} and {@link assembleRows}. See docs/SCORING.md § Report
 * rows for the rules this module implements; the webapp only sums and displays.
 */
import type { Erratum } from "../config/errata.js";
import { stableStringify } from "../config/hashing.js";
import { modelKeyOf, modelNameOf } from "../report/model-key.js";
import { type AttemptManifest, type ItemResult, passFraction } from "../schema/attempt.js";
import type { Scope } from "../schema/challenge.js";
import type { HardwareProfile } from "../schema/run-manifest.js";
import { currentItems, type LoadedAttempt } from "./load-attempts.js";

/** The slice of a resolved challenge the rows need (a `ResolvedChallenge` satisfies it). */
export interface SetChallenge {
  readonly id: string;
  readonly version: number;
  readonly challengeHash: string;
  readonly items: ReadonlyArray<{
    readonly itemId: string;
    readonly itemHash: string;
    /** What the model sees: an archived line counts for the item when its promptHash matches. */
    readonly promptHash: string;
    /** The item's current scorer: a line graded under another one needs a score record. */
    readonly scorerHash: string;
    readonly family: string;
    readonly scope: Scope;
  }>;
}

export interface Dataset {
  readonly label: string;
  /** Display name: `Alpha challenge set`, `Release <version>`, `Pre-release (draft)`, or the label. */
  readonly title: string;
  readonly archiveDir: string;
  readonly challengesDir: string;
  /** Release: `0` (alpha) or `YYYY.N`. */
  readonly release: string | null;
  /** Eval version `<release>.<n>`: the release plus its errata 1..n. */
  readonly version: string | null;
  /** The release's errata up to the eval version, without `notes` or `scorers`. */
  readonly errata: ReadonlyArray<Omit<Erratum, "notes" | "scorers">>;
  readonly ranked: boolean;
  /** Read from schemaVersion 1–3 attempt archives. */
  readonly legacy: boolean;
}

export interface RowsInput {
  /** Every loaded attempt, completed or not. */
  readonly attempts: ReadonlyArray<LoadedAttempt>;
  readonly challengeSet: ReadonlyArray<SetChallenge>;
  readonly dataset: Dataset;
  /** Machine that attempts without `env.hardwareId` (pre-schemaVersion 3) are attributed to. */
  readonly legacyHardware: {
    readonly id: string;
    readonly profile?: HardwareProfile | undefined;
  };
  /** `artifact → modelKey` overrides from `configs.yaml`. */
  readonly modelKeys?: ReadonlyMap<string, string>;
  /**
   * A counted line's score under its item's current scorer; `stored` when the
   * line was graded by that scorer (default: always the stored score).
   */
  readonly grade?: (
    line: ItemResult,
    at: {
      readonly configHash: string;
      readonly challengeId: string;
      readonly item: SetChallenge["items"][number];
    },
  ) => Pick<CountedLine, "score" | "failureKind">;
}

export type CellStatus = "scored" | "stale_hash" | "interrupted" | "not_run";
type Counts = Record<string, [number, number]>;
type Span = [number, number];

export interface Cell {
  readonly status: CellStatus;
  readonly items: number;
  readonly passed: number;
  readonly nearMissCredit: number;
  readonly families: Counts;
  readonly scopes: Counts;
  /** `families` split by scope, so a scoped score has its own clusters. */
  readonly scopeFamilies: Record<string, Counts>;
  readonly failureKinds: Record<string, number>;
  /** Cost of one pass over the counted lines; null unless scored. */
  readonly cost: CellCost | null;
  /** Min / max samples per item; null unless scored. */
  readonly samples: Span | null;
  readonly executedFrom: string | null;
  readonly executedTo: string | null;
  readonly runtimeVersions: string[];
  readonly gitShas: string[];
  /** Attempts that executed the counted lines. */
  readonly sourceAttempts: string[];
  readonly restamped: boolean;
}

/** Item-mean tokens and wall time summed, peak memory max, generation speed Σ tokens / Σ decode seconds over lines (0 when unmeasured). */
export interface CellCost {
  readonly tokens: number;
  readonly wallSec: number;
  readonly peakMemoryGb: number;
  readonly genTps: number;
}

export interface Row {
  readonly rowId: string;
  /** Model identity shared by every build of one model (src/report/model-key.ts). */
  readonly modelKey: string;
  /** The artifact's model name, org and packaging dropped. */
  readonly modelName: string;
  readonly configHash: string;
  readonly configId: string;
  readonly hardwareId: string;
  readonly artifact: string;
  readonly runtime: string;
  readonly quant: string | null;
  readonly temperature: number;
  /** Only the fields that differ among rows of the same artifact. */
  readonly variant: Record<string, string>;
  readonly variantLabel: string;
  readonly cells: Record<string, Cell>;
  readonly passed: number;
  readonly items: number;
  readonly passRate: number;
  /** Family-clustered CR1 standard error of `passRate`; null below 5 families. */
  readonly se: number | null;
  readonly scopes: Counts;
  readonly families: Counts;
  readonly nearMissCredit: number;
  readonly failureKinds: Record<string, number>;
  readonly completeness: {
    readonly state: "complete" | "partial";
    readonly challenges: Span;
    readonly items: Span;
  };
  readonly freshness: { readonly executedFrom: string | null; readonly executedTo: string | null };
  readonly provenance: {
    readonly runtimeVersions: string[];
    readonly gitShas: string[];
    readonly submitters: string[];
    readonly samples: Span | null;
    /** Scored cells whose executing attempts include a re-stamped one. */
    readonly restamped: number;
    readonly mixed: boolean;
  };
}

export interface RowsDataset {
  readonly dataset: Dataset;
  readonly challengeSet: ReadonlyArray<{
    id: string;
    version: number;
    hash: string;
    items: number;
    scopes: Record<string, number>;
  }>;
  readonly hardware: Record<string, HardwareProfile>;
  readonly rows: ReadonlyArray<Row>;
}

/** Execution span beyond which a row's evidence counts as mixed. */
export const MIXED_SPAN_DAYS = 7;
const MIN_CLUSTERS = 5;

/** The fields of one counted execution the cell statistics read. */
export interface CountedLine {
  readonly score: number;
  readonly failureKind?: string | null | undefined;
  readonly executedAt: string;
  readonly generationTokens: number;
  readonly generationTps: number;
  readonly wallTimeSec: number;
  readonly peakMemoryGb: number;
}

/** One counted execution: its line and where it ran (`source`: the attempt or bundle). */
export interface Counted {
  readonly line: CountedLine;
  readonly runtimeVersion: string;
  readonly gitSha: string;
  readonly source: string;
  readonly restamped: boolean;
}

/** One execution: a line plus the attempt that executed it (undefined when unknown). */
interface Execution {
  readonly line: ItemResult;
  readonly executor: LoadedAttempt | undefined;
  readonly hardwareId: string;
}

const isCompleted = (m: AttemptManifest) => m.finishedAt !== null && !m.interrupted;
const uniq = (xs: Iterable<string>) => [...new Set(xs)].sort();
const bump = (o: Counts, k: string, n: number, y: number) => {
  const [a, b] = o[k] ?? [0, 0];
  o[k] = [a + n, b + y];
};
const bumpIn = (o: Record<string, Counts>, k: string, f: string, n: number, y: number) => {
  const c = o[k] ?? {};
  o[k] = c;
  bump(c, f, n, y);
};
const addCounts = (into: Counts, from: Counts) => {
  for (const [k, [n, y]] of Object.entries(from)) bump(into, k, n, y);
};
const addNums = (into: Record<string, number>, from: Record<string, number>) => {
  for (const [k, n] of Object.entries(from)) into[k] = (into[k] ?? 0) + n;
};

/** CR1 standard error of Σy / Σn over clusters (docs/SCORING.md § Uncertainty). */
const ratioSE = (clusters: ReadonlyArray<readonly [number, number]>): number | null => {
  const n = clusters.reduce((s, [k]) => s + k, 0);
  if (clusters.length < MIN_CLUSTERS || n === 0) return null;
  const r = clusters.reduce((s, [, y]) => s + y, 0) / n;
  const ss = clusters.reduce((s, [k, y]) => s + (y - r * k) ** 2, 0);
  const c = clusters.length;
  return Math.sqrt((c / (c - 1)) * ss) / n;
};

/**
 * Every distinct execution among completed attempts, attributed to its
 * executor: `cachedFrom.attemptId` when set, else the earliest-started holder
 * of the identical line that started no later than it executed.
 */
const executions = (attempts: ReadonlyArray<LoadedAttempt>, hwOf: (a: LoadedAttempt) => string) => {
  const byId = new Map<string, LoadedAttempt>();
  for (const a of attempts) {
    byId.set(a.manifest.attemptId, a);
    if (a.manifest.restampedFrom !== undefined) byId.set(a.manifest.restampedFrom, a);
  }
  const copies = new Map<string, { line: ItemResult; holders: LoadedAttempt[] }>();
  for (const a of attempts) {
    if (!isCompleted(a.manifest)) continue;
    const m = a.manifest;
    for (const l of currentItems(m, a.items)) {
      // Replays never cross machines (the cache is hardware-scoped), so the holder's machine joins the key.
      const k = [
        hwOf(a),
        m.configHash,
        m.challengeId,
        m.challengeVersion,
        l.itemId,
        l.itemHash,
        l.sample ?? 0,
        l.executedAt,
      ].join("|");
      const c = copies.get(k);
      if (c === undefined) copies.set(k, { line: l, holders: [a] });
      else {
        c.holders.push(a);
        if (c.line.cachedFrom === undefined && l.cachedFrom !== undefined) c.line = l;
      }
    }
  }
  const out: { key: string; exec: Execution }[] = [];
  for (const { line, holders } of copies.values()) {
    const started = [...holders].sort((x, y) =>
      x.manifest.startedAt.localeCompare(y.manifest.startedAt),
    );
    const executor =
      (line.cachedFrom === undefined ? undefined : byId.get(line.cachedFrom.attemptId)) ??
      started.find((h) => Date.parse(h.manifest.startedAt) <= Date.parse(line.executedAt));
    const m = (holders[0] as LoadedAttempt).manifest;
    out.push({
      // Membership is by prompt: a line graded under an earlier scorer still answers the item.
      key: [m.configHash, m.challengeId, line.itemId, line.promptHash].join("|"),
      exec: {
        line,
        executor,
        hardwareId: hwOf(executor ?? (started[0] as LoadedAttempt)),
      },
    });
  }
  return out;
};

const envOf = (e: Execution) => e.executor?.manifest.env;

const counted = (
  e: Execution,
  graded = e.line as Pick<CountedLine, "score" | "failureKind">,
): Counted => ({
  line: { ...e.line, score: graded.score, failureKind: graded.failureKind },
  runtimeVersion: envOf(e)?.runtimeVersion ?? "unknown",
  gitSha: envOf(e)?.benchmarkGitSha ?? "unknown",
  source: e.executor?.manifest.attemptId ?? "unknown",
  restamped: e.executor?.manifest.restampedFrom !== undefined,
});

/**
 * A challenge's cell from the selected execution per item × sample (one map
 * per set item, in set order). Any item without one leaves the cell unscored
 * with `unscored` as its status.
 */
export const buildCell = (
  ch: { readonly items: ReadonlyArray<Pick<SetChallenge["items"][number], "family" | "scope">> },
  byItemSample: ReadonlyArray<ReadonlyMap<string, Counted>>,
  unscored: Exclude<CellStatus, "scored">,
): Cell => {
  const families: Counts = {};
  const scopes: Counts = {};
  const scopeFamilies: Record<string, Counts> = {};
  for (const it of ch.items) {
    bump(families, it.family, 1, 0);
    bump(scopes, it.scope, 1, 0);
    bumpIn(scopeFamilies, it.scope, it.family, 1, 0);
  }
  const empty: Cell = {
    status: unscored,
    items: ch.items.length,
    passed: 0,
    nearMissCredit: 0,
    families,
    scopes,
    scopeFamilies,
    failureKinds: {},
    cost: null,
    samples: null,
    executedFrom: null,
    executedTo: null,
    runtimeVersions: [],
    gitShas: [],
    sourceAttempts: [],
    restamped: false,
  };
  if (byItemSample.some((m) => m.size === 0)) return empty;

  const fam: Counts = {};
  const sc: Counts = {};
  const scFam: Record<string, Counts> = {};
  const failureKinds: Record<string, number> = {};
  let passed = 0;
  let nearMissCredit = 0;
  const all: Counted[] = [];
  ch.items.forEach((it, i) => {
    const samples = [...(byItemSample[i] as ReadonlyMap<string, Counted>).values()];
    all.push(...samples);
    const lines = samples.map((e) => e.line);
    const p = passFraction(lines);
    passed += p;
    nearMissCredit +=
      lines.reduce((s, l) => s + (l.failureKind === "near_miss" ? l.score : 0), 0) / lines.length;
    bump(fam, it.family, 1, p);
    bump(sc, it.scope, 1, p);
    bumpIn(scFam, it.scope, it.family, 1, p);
    for (const l of lines)
      if (l.failureKind != null)
        failureKinds[l.failureKind] = (failureKinds[l.failureKind] ?? 0) + 1;
  });
  const counts = byItemSample.map((m) => m.size);
  const itemMean = (f: (l: CountedLine) => number) =>
    byItemSample.reduce((s, m) => {
      const ls = [...m.values()];
      return s + ls.reduce((t, e) => t + f(e.line), 0) / ls.length;
    }, 0);
  const dates = all.map((e) => e.line.executedAt).sort();
  // Generation speed: total tokens over total decode time. Lines with no
  // measured speed (errors, aborted streams: generationTps 0) carry no decode.
  const timed = all.map((e) => e.line).filter((l) => l.generationTps > 0);
  const decodeSec = timed.reduce((s, l) => s + l.generationTokens / l.generationTps, 0);
  return {
    status: "scored",
    items: ch.items.length,
    passed,
    nearMissCredit,
    families: fam,
    scopes: sc,
    scopeFamilies: scFam,
    failureKinds,
    cost: {
      tokens: Math.round(itemMean((l) => l.generationTokens)),
      wallSec: itemMean((l) => l.wallTimeSec),
      peakMemoryGb: Math.max(...all.map((e) => e.line.peakMemoryGb)),
      genTps: decodeSec === 0 ? 0 : timed.reduce((s, l) => s + l.generationTokens, 0) / decodeSec,
    },
    samples: [Math.min(...counts), Math.max(...counts)],
    executedFrom: dates[0] ?? null,
    executedTo: dates[dates.length - 1] ?? null,
    runtimeVersions: uniq(all.map((e) => e.runtimeVersion)),
    gitShas: uniq(all.map((e) => e.gitSha)),
    sourceAttempts: uniq(all.map((e) => e.source)),
    restamped: all.some((e) => e.restamped),
  };
};

/** Fields compared across rows of one artifact for the variant label. */
const VARIANT_FIELDS = [
  "runtime",
  "quant",
  "temperature",
  "maxTokens",
  "systemPrompt",
  "topP",
  "topK",
  "minP",
  "presencePenalty",
  "presenceContextSize",
  "repetitionPenalty",
  "repetitionContextSize",
  "chatTemplateKwargs",
  "chatTemplate",
  "weights",
] as const;
type VariantField = (typeof VARIANT_FIELDS)[number];

/** A field's variant value; `default` when unset. */
export const variantValue = (
  m: Partial<Record<VariantField, unknown>>,
  f: VariantField,
): string => {
  const v = m[f];
  if (v === undefined) return "default";
  return typeof v === "object" ? stableStringify(v) : String(v);
};

const variantLabel = (variant: Record<string, string>): string =>
  Object.entries(variant)
    .map(([k, v]) => (k === "temperature" ? `t${v}` : k === "hardware" ? `hw ${v}` : `${k} ${v}`))
    .join(" · ");

/** One row's identity and cells, before the row statistics and variants. */
export interface RowSource {
  readonly rowId: string;
  readonly hardwareId: string;
  readonly configHash: string;
  readonly configId: string;
  readonly artifact: string;
  readonly runtime: string;
  readonly quant: string | null;
  readonly temperature: number;
  /** The variant fields' values ({@link variantValue}). */
  readonly variantFields: Partial<Record<VariantField, unknown>>;
  readonly cells: Record<string, Cell>;
  /** Submitters of the given scored-cell sources. */
  readonly submitters: (sources: ReadonlySet<string>) => string[];
}

/** Row statistics, variant labels and ordering over assembled cells. */
export const assembleRows = (input: {
  readonly dataset: Dataset;
  readonly challengeSet: ReadonlyArray<SetChallenge>;
  readonly hardware: Record<string, HardwareProfile>;
  readonly rows: ReadonlyArray<RowSource>;
  readonly modelKeys?: ReadonlyMap<string, string> | undefined;
}): RowsDataset => {
  const { hardware } = input;
  const modelKeys = input.modelKeys ?? new Map<string, string>();
  const rows: Omit<Row, "variant" | "variantLabel">[] = [];
  const meta = new Map<string, RowSource>();
  for (const src of input.rows) {
    const { rowId, hardwareId, cells } = src;
    meta.set(rowId, src);
    const scored = Object.values(cells).filter((c) => c.status === "scored");
    const families: Counts = {};
    const scopes: Counts = {};
    const failureKinds: Record<string, number> = {};
    for (const c of Object.values(cells)) {
      addCounts(families, c.families);
      addCounts(scopes, c.scopes);
      addNums(failureKinds, c.failureKinds);
    }
    const sum = (f: (c: Cell) => number, cs: Cell[] = Object.values(cells)) =>
      cs.reduce((s, c) => s + f(c), 0);
    const items = sum((c) => c.items);
    const passed = sum((c) => c.passed);
    const from = scored.map((c) => c.executedFrom as string).sort()[0] ?? null;
    const to =
      scored
        .map((c) => c.executedTo as string)
        .sort()
        .at(-1) ?? null;
    const runtimeVersions = uniq(scored.flatMap((c) => c.runtimeVersions));
    const gitShas = uniq(scored.flatMap((c) => c.gitShas));
    const executors = new Set(scored.flatMap((c) => c.sourceAttempts));
    const spanDays =
      from === null || to === null ? 0 : (Date.parse(to) - Date.parse(from)) / 86_400_000;
    const samples = scored.map((c) => c.samples as Span);

    rows.push({
      rowId,
      modelKey: modelKeyOf(src.artifact, modelKeys),
      modelName: modelNameOf(src.artifact),
      configHash: src.configHash,
      configId: src.configId,
      hardwareId,
      artifact: src.artifact,
      runtime: src.runtime,
      quant: src.quant,
      temperature: src.temperature,
      cells,
      passed,
      items,
      passRate: items === 0 ? 0 : passed / items,
      se: ratioSE(Object.values(families)),
      scopes,
      families,
      nearMissCredit: sum((c) => c.nearMissCredit),
      failureKinds,
      completeness: {
        state: scored.length === input.challengeSet.length ? "complete" : "partial",
        challenges: [scored.length, input.challengeSet.length],
        items: [sum((c) => c.items, scored), items],
      },
      freshness: { executedFrom: from, executedTo: to },
      provenance: {
        runtimeVersions,
        gitShas,
        submitters: src.submitters(executors),
        samples:
          samples.length === 0
            ? null
            : [Math.min(...samples.map((s) => s[0])), Math.max(...samples.map((s) => s[1]))],
        restamped: scored.filter((c) => c.restamped).length,
        mixed: runtimeVersions.length > 1 || gitShas.length > 1 || spanDays > MIXED_SPAN_DAYS,
      },
    });
  }

  // Variant: the fields (and machine) that differ among rows of one artifact.
  const hwLabel = (id: string) => {
    const p = hardware[id];
    return p === undefined ? id : `${p.cpu} ${p.memoryGb}GB`;
  };
  const fieldsOf = (rowId: string) => (meta.get(rowId) as RowSource).variantFields;
  const byArtifact = new Map<string, typeof rows>();
  for (const r of rows) byArtifact.set(r.artifact, [...(byArtifact.get(r.artifact) ?? []), r]);
  const withVariants: Row[] = rows.map((r) => {
    const siblings = byArtifact.get(r.artifact) ?? [];
    const variant: Record<string, string> = {};
    for (const f of VARIANT_FIELDS) {
      const vals = new Set(siblings.map((s) => variantValue(fieldsOf(s.rowId), f)));
      if (vals.size > 1) variant[f] = variantValue(fieldsOf(r.rowId), f);
    }
    if (new Set(siblings.map((s) => s.hardwareId)).size > 1)
      variant["hardware"] = hwLabel(r.hardwareId);
    return {
      ...r,
      variant,
      variantLabel: variantLabel(variant),
    };
  });

  return {
    dataset: input.dataset,
    challengeSet: input.challengeSet.map((c) => {
      const scopes: Record<string, number> = {};
      for (const it of c.items) scopes[it.scope] = (scopes[it.scope] ?? 0) + 1;
      return { id: c.id, version: c.version, hash: c.challengeHash, items: c.items.length, scopes };
    }),
    hardware,
    rows: withVariants.sort((a, b) => b.passRate - a.passRate || a.rowId.localeCompare(b.rowId)),
  };
};

export const buildRows = (input: RowsInput): RowsDataset => {
  const legacy = input.legacyHardware;
  const hwOf = (a: LoadedAttempt) => a.manifest.env.hardwareId ?? legacy.id;
  const setIds = new Set(input.challengeSet.map((c) => c.id));

  // Group: row key → its attempts (for status + metadata); line key → executions.
  const rowAttempts = new Map<string, LoadedAttempt[]>();
  for (const a of input.attempts) {
    if (!setIds.has(a.manifest.challengeId)) continue;
    const k = `${a.manifest.configHash}@${hwOf(a)}`;
    rowAttempts.set(k, [...(rowAttempts.get(k) ?? []), a]);
  }
  const execs = new Map<string, Execution[]>();
  for (const { key, exec } of executions(input.attempts, hwOf)) {
    const k = `${key}@${exec.hardwareId}`;
    execs.set(k, [...(execs.get(k) ?? []), exec]);
  }

  const hardware: Record<string, HardwareProfile> = {};
  const rows: RowSource[] = [];
  for (const [rowId, attempts] of rowAttempts) {
    const latest = [...attempts].sort((x, y) =>
      y.manifest.startedAt.localeCompare(x.manifest.startedAt),
    )[0]?.manifest as AttemptManifest;
    const hardwareId = hwOf(attempts[0] as LoadedAttempt);

    const cells: Record<string, Cell> = {};
    for (const ch of input.challengeSet) {
      const mine = attempts.filter((a) => a.manifest.challengeId === ch.id);
      const byItemSample = ch.items.map((it) => {
        const best = new Map<string, Execution>();
        const k = `${latest.configHash}|${ch.id}|${it.itemId}|${it.promptHash}@${hardwareId}`;
        const current = (e: Execution) => e.line.scorerHash === it.scorerHash;
        for (const e of execs.get(k) ?? []) {
          const s = String(e.line.sample ?? 0);
          const cur = best.get(s);
          // The cache's rule: an executed line beats an errored one, then the newest wins;
          // a re-stamped copy of one execution (same executedAt) wins over its original.
          const executed = e.line.error === null;
          if (
            cur === undefined ||
            (executed && cur.line.error !== null) ||
            (executed === (cur.line.error === null) &&
              (e.line.executedAt > cur.line.executedAt ||
                (e.line.executedAt === cur.line.executedAt && current(e) && !current(cur))))
          )
            best.set(s, e);
        }
        const grade = input.grade;
        return new Map(
          [...best].map(([s, e]) => [
            s,
            counted(
              e,
              grade?.(e.line, { configHash: latest.configHash, challengeId: ch.id, item: it }),
            ),
          ]),
        );
      });
      cells[ch.id] = buildCell(
        ch,
        byItemSample,
        mine.some((a) => isCompleted(a.manifest))
          ? "stale_hash"
          : mine.length > 0
            ? "interrupted"
            : "not_run",
      );
    }

    for (const a of attempts)
      if (a.manifest.env.hardware) hardware[hardwareId] = a.manifest.env.hardware;
    if (
      hardwareId === legacy.id &&
      legacy.profile !== undefined &&
      hardware[hardwareId] === undefined
    ) {
      hardware[hardwareId] = legacy.profile;
    }

    rows.push({
      rowId,
      hardwareId,
      configHash: latest.configHash,
      configId: latest.configId,
      artifact: latest.artifact,
      runtime: latest.runtime,
      quant: latest.quant ?? null,
      temperature: latest.temperature,
      variantFields: latest,
      cells,
      submitters: (executors) =>
        uniq(
          attempts
            .filter((a) => executors.has(a.manifest.attemptId))
            .map((a) => a.manifest.submitter ?? "local"),
        ),
    });
  }

  return assembleRows({
    dataset: input.dataset,
    challengeSet: input.challengeSet,
    hardware,
    rows,
    modelKeys: input.modelKeys,
  });
};
