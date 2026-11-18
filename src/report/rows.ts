/**
 * Report rows: the selection step between attempt archives and a ranking.
 * One row is one configuration (`configHash`) on one machine (`hardwareId`),
 * scored against one challenge set. See docs/SCORING.md § Report rows for the
 * rules this module implements; the webapp only sums and displays.
 */
import type { AttemptManifest, ItemResult } from "../schema/attempt.js";
import type { LoadedAttempt } from "./load-attempts.js";
import { modelKeyOf, modelNameOf } from "./model-key.js";

/** The slice of a resolved challenge the rows need (a `ResolvedChallenge` satisfies it). */
export interface SetChallenge {
  readonly id: string;
  readonly version: number;
  readonly challengeHash: string;
  readonly items: ReadonlyArray<{ readonly itemId: string; readonly itemHash: string }>;
}

export interface Dataset {
  readonly label: string;
  readonly archiveDir: string;
  readonly challengesDir: string;
  /** Release label of the set; `null`: no release baseline exists. */
  readonly release: string | null;
  /** Errata ids that apply to the set; empty: no errata exist. */
  readonly errata: ReadonlyArray<string>;
}

export interface RowsInput {
  /** Every loaded attempt, completed or not. */
  readonly attempts: ReadonlyArray<LoadedAttempt>;
  readonly challengeSet: ReadonlyArray<SetChallenge>;
  readonly dataset: Dataset;
  readonly generatedAt: string;
  /** `artifact → modelKey` overrides from `configs.yaml`. */
  readonly modelKeys?: ReadonlyMap<string, string>;
}

/** The `hardwareId` of every row: attempt archives do not record the machine. */
export const UNKNOWN_HARDWARE = "unknown";

export type CellStatus = "scored" | "stale_hash" | "interrupted" | "not_run";
type Counts = Record<string, [number, number]>;
type Span = [number, number];

export interface Cell {
  readonly status: CellStatus;
  readonly items: number;
  readonly passed: number;
  /** Always 0: archives carry no near-miss verdicts. */
  readonly nearMissCredit: number;
  /** Uncertainty clusters: every item is its own family (`challengeId/itemId`). */
  readonly families: Counts;
  /** Always empty: items carry no core/stretch scope. */
  readonly scopes: Counts;
  readonly scopeFamilies: Record<string, Counts>;
  /** Always empty: archives carry no failure kinds. */
  readonly failureKinds: Record<string, number>;
  /** Cost of one pass over the counted lines; null unless scored. */
  readonly cost: CellCost | null;
  /** Min / max samples per item — one line per item, so `[1, 1]`; null unless scored. */
  readonly samples: Span | null;
  readonly executedFrom: string | null;
  readonly executedTo: string | null;
  readonly runtimeVersions: string[];
  readonly gitShas: string[];
  /** Attempts that executed the counted lines. */
  readonly sourceAttempts: string[];
  readonly restamped: boolean;
}

/** Tokens and wall time summed over items, peak memory max, generation speed mean over lines. */
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
  /** Standard error of `passRate` over the row's families; null below 5 families. */
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
    /** Always `["local"]`: attempts do not record a submitter. */
    readonly submitters: string[];
    readonly samples: Span | null;
    /** Scored cells whose executing attempts include a re-stamped one. */
    readonly restamped: number;
    readonly mixed: boolean;
  };
}

export interface RowsDataset {
  readonly dataset: Dataset & { readonly generatedAt: string };
  readonly challengeSet: ReadonlyArray<{
    id: string;
    version: number;
    hash: string;
    items: number;
    /** Always empty: items carry no core/stretch scope. */
    scopes: Record<string, number>;
  }>;
  /** `hardwareId → profile`; empty: attempt archives do not record the machine. */
  readonly hardware: Record<string, never>;
  readonly rows: ReadonlyArray<Row>;
}

/** Execution span beyond which a row's evidence counts as mixed. */
export const MIXED_SPAN_DAYS = 7;
const MIN_CLUSTERS = 5;

/** One execution: a line plus the attempt that executed it (undefined when unknown). */
interface Execution {
  readonly line: ItemResult;
  readonly executor: LoadedAttempt | undefined;
}

const isCompleted = (m: AttemptManifest) => m.finishedAt !== null && !m.interrupted;
const uniq = (xs: Iterable<string>) => [...new Set(xs)].sort();
const bump = (o: Counts, k: string, n: number, y: number) => {
  const [a, b] = o[k] ?? [0, 0];
  o[k] = [a + n, b + y];
};
const addCounts = (into: Counts, from: Counts) => {
  for (const [k, [n, y]] of Object.entries(from)) bump(into, k, n, y);
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
 * executor: the earliest-started holder of the identical line that started no
 * later than it executed.
 */
const executions = (attempts: ReadonlyArray<LoadedAttempt>) => {
  const copies = new Map<string, { line: ItemResult; holders: LoadedAttempt[] }>();
  for (const a of attempts) {
    if (!isCompleted(a.manifest)) continue;
    const m = a.manifest;
    for (const l of a.items) {
      const k = [
        m.configHash,
        m.challengeId,
        m.challengeVersion,
        l.itemId,
        l.itemHash,
        l.executedAt,
      ].join("|");
      const c = copies.get(k);
      if (c === undefined) copies.set(k, { line: l, holders: [a] });
      else c.holders.push(a);
    }
  }
  const out: { key: string; exec: Execution }[] = [];
  for (const { line, holders } of copies.values()) {
    const started = [...holders].sort((x, y) =>
      x.manifest.startedAt.localeCompare(y.manifest.startedAt),
    );
    const executor = started.find(
      (h) => Date.parse(h.manifest.startedAt) <= Date.parse(line.executedAt),
    );
    const m = (holders[0] as LoadedAttempt).manifest;
    out.push({
      key: [m.configHash, m.challengeId, m.challengeVersion, line.itemId, line.itemHash].join("|"),
      exec: { line, executor },
    });
  }
  return out;
};

const envOf = (e: Execution) => e.executor?.manifest.env;

const buildCell = (
  ch: SetChallenge,
  byItem: (Execution | undefined)[],
  attempted: { completed: boolean; interrupted: boolean },
): Cell => {
  const families: Counts = {};
  for (const it of ch.items) bump(families, `${ch.id}/${it.itemId}`, 1, 0);
  const empty: Cell = {
    status: attempted.completed ? "stale_hash" : attempted.interrupted ? "interrupted" : "not_run",
    items: ch.items.length,
    passed: 0,
    nearMissCredit: 0,
    families,
    scopes: {},
    scopeFamilies: {},
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
  if (byItem.some((e) => e === undefined)) return empty;

  const all = byItem as Execution[];
  const fam: Counts = {};
  let passed = 0;
  ch.items.forEach((it, i) => {
    const p = (all[i] as Execution).line.score === 1 ? 1 : 0;
    passed += p;
    bump(fam, `${ch.id}/${it.itemId}`, 1, p);
  });
  const sum = (f: (l: ItemResult) => number) => all.reduce((s, e) => s + f(e.line), 0);
  const dates = all.map((e) => e.line.executedAt).sort();
  return {
    status: "scored",
    items: ch.items.length,
    passed,
    nearMissCredit: 0,
    families: fam,
    scopes: {},
    scopeFamilies: {},
    failureKinds: {},
    cost: {
      tokens: Math.round(sum((l) => l.generationTokens)),
      wallSec: sum((l) => l.wallTimeSec),
      peakMemoryGb: Math.max(...all.map((e) => e.line.peakMemoryGb)),
      genTps: sum((l) => l.generationTps) / all.length,
    },
    samples: [1, 1],
    executedFrom: dates[0] ?? null,
    executedTo: dates[dates.length - 1] ?? null,
    runtimeVersions: uniq(all.map((e) => envOf(e)?.runtimeVersion ?? "unknown")),
    gitShas: uniq(all.map((e) => envOf(e)?.benchmarkGitSha ?? "unknown")),
    sourceAttempts: uniq(all.map((e) => e.executor?.manifest.attemptId ?? "unknown")),
    restamped: all.some((e) => e.executor?.manifest.restampedFrom !== undefined),
  };
};

/** Fields compared across rows of one artifact for the variant label. */
const VARIANT_FIELDS = ["runtime", "quant", "temperature", "maxTokens", "systemPrompt"] as const;

const variantValue = (m: AttemptManifest, f: (typeof VARIANT_FIELDS)[number]): string =>
  String(m[f] ?? "default");

const variantLabel = (variant: Record<string, string>): string =>
  Object.entries(variant)
    .map(([k, v]) => (k === "temperature" ? `t${v}` : `${k} ${v}`))
    .join(" · ");

export const buildRows = (input: RowsInput): RowsDataset => {
  const setIds = new Set(input.challengeSet.map((c) => c.id));

  // Group: row key → its attempts (for status + metadata); line key → executions.
  const rowAttempts = new Map<string, LoadedAttempt[]>();
  for (const a of input.attempts) {
    if (!setIds.has(a.manifest.challengeId)) continue;
    const k = `${a.manifest.configHash}@${UNKNOWN_HARDWARE}`;
    rowAttempts.set(k, [...(rowAttempts.get(k) ?? []), a]);
  }
  const execs = new Map<string, Execution[]>();
  for (const { key, exec } of executions(input.attempts))
    execs.set(key, [...(execs.get(key) ?? []), exec]);

  const modelKeys = input.modelKeys ?? new Map<string, string>();
  const rows: Omit<Row, "variant" | "variantLabel">[] = [];
  const meta = new Map<string, AttemptManifest>();
  for (const [rowId, attempts] of rowAttempts) {
    const latest = [...attempts].sort((x, y) =>
      y.manifest.startedAt.localeCompare(x.manifest.startedAt),
    )[0]?.manifest as AttemptManifest;
    meta.set(rowId, latest);

    const cells: Record<string, Cell> = {};
    for (const ch of input.challengeSet) {
      const mine = attempts.filter((a) => a.manifest.challengeId === ch.id);
      // Per item: the line with the latest `executedAt` at the current item hash.
      const byItem = ch.items.map((it) => {
        const k = `${latest.configHash}|${ch.id}|${ch.version}|${it.itemId}|${it.itemHash}`;
        let best: Execution | undefined;
        for (const e of execs.get(k) ?? [])
          if (best === undefined || e.line.executedAt > best.line.executedAt) best = e;
        return best;
      });
      cells[ch.id] = buildCell(ch, byItem, {
        completed: mine.some((a) => isCompleted(a.manifest)),
        interrupted: mine.length > 0,
      });
    }

    const scored = Object.values(cells).filter((c) => c.status === "scored");
    const families: Counts = {};
    for (const c of Object.values(cells)) addCounts(families, c.families);
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
    const spanDays =
      from === null || to === null ? 0 : (Date.parse(to) - Date.parse(from)) / 86_400_000;

    rows.push({
      rowId,
      modelKey: modelKeyOf(latest.artifact, modelKeys),
      modelName: modelNameOf(latest.artifact),
      configHash: latest.configHash,
      configId: latest.configId,
      hardwareId: UNKNOWN_HARDWARE,
      artifact: latest.artifact,
      runtime: latest.runtime,
      quant: latest.quant ?? null,
      temperature: latest.temperature,
      cells,
      passed,
      items,
      passRate: items === 0 ? 0 : passed / items,
      se: ratioSE(Object.values(families)),
      scopes: {},
      families,
      nearMissCredit: 0,
      failureKinds: {},
      completeness: {
        state: scored.length === input.challengeSet.length ? "complete" : "partial",
        challenges: [scored.length, input.challengeSet.length],
        items: [sum((c) => c.items, scored), items],
      },
      freshness: { executedFrom: from, executedTo: to },
      provenance: {
        runtimeVersions,
        gitShas,
        submitters: ["local"],
        samples: scored.length === 0 ? null : [1, 1],
        restamped: scored.filter((c) => c.restamped).length,
        mixed: runtimeVersions.length > 1 || gitShas.length > 1 || spanDays > MIXED_SPAN_DAYS,
      },
    });
  }

  // Variant: the fields that differ among rows of one artifact.
  const byArtifact = new Map<string, typeof rows>();
  for (const r of rows) byArtifact.set(r.artifact, [...(byArtifact.get(r.artifact) ?? []), r]);
  const withVariants: Row[] = rows.map((r) => {
    const siblings = byArtifact.get(r.artifact) ?? [];
    const variant: Record<string, string> = {};
    for (const f of VARIANT_FIELDS) {
      const vals = new Set(
        siblings.map((s) => variantValue(meta.get(s.rowId) as AttemptManifest, f)),
      );
      if (vals.size > 1) variant[f] = variantValue(meta.get(r.rowId) as AttemptManifest, f);
    }
    return { ...r, variant, variantLabel: variantLabel(variant) };
  });

  return {
    dataset: { ...input.dataset, generatedAt: input.generatedAt },
    challengeSet: input.challengeSet.map((c) => ({
      id: c.id,
      version: c.version,
      hash: c.challengeHash,
      items: c.items.length,
      scopes: {},
    })),
    hardware: {},
    rows: withVariants.sort((a, b) => b.passRate - a.passRate || a.rowId.localeCompare(b.rowId)),
  };
};
