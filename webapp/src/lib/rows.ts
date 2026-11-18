// The report's selected rows (`globalThis.__BENCHMARK_ROWS`, src/report/rows.ts),
// one dataset per entry, the main dataset first. The webapp reads only this:
// it sums cells and displays, and never chooses evidence.

export type Counts = Record<string, [number, number]>;
export type CellStatus = "scored" | "stale_hash" | "interrupted" | "not_run";

export interface CellCost {
  tokens: number;
  wallSec: number;
  peakMemoryGb: number;
  genTps: number;
}

export interface Cell {
  status: CellStatus;
  items: number;
  passed: number;
  nearMissCredit: number;
  families: Counts;
  scopes: Counts;
  scopeFamilies: Record<string, Counts>;
  failureKinds: Record<string, number>;
  cost: CellCost | null;
  samples: [number, number] | null;
  executedFrom: string | null;
  executedTo: string | null;
  runtimeVersions: string[];
  gitShas: string[];
  sourceAttempts: string[];
  restamped: boolean;
}

export interface Row {
  rowId: string;
  modelKey: string;
  modelName: string;
  configHash: string;
  configId: string;
  hardwareId: string;
  artifact: string;
  runtime: string;
  quant: string | null;
  temperature: number;
  variant: Record<string, string>;
  variantLabel: string;
  cells: Record<string, Cell>;
  passRate: number;
  completeness: { state: "complete" | "partial"; challenges: [number, number]; items: [number, number] };
  freshness: { executedFrom: string | null; executedTo: string | null };
  provenance: {
    runtimeVersions: string[];
    gitShas: string[];
    submitters: string[];
    samples: [number, number] | null;
    restamped: number;
    mixed: boolean;
  };
}

export interface HardwareProfile {
  cpu: string;
  cpuCores: number;
  coreTypes?: Record<string, number>;
  gpu?: string;
  gpuCores?: number;
  gpuMemoryGb?: number;
  memoryGb: number;
  os: string;
}

export interface RowsDataset {
  dataset: {
    label: string;
    archiveDir: string;
    challengesDir: string;
    release: string | null;
    errata: string[];
    generatedAt: string;
  };
  challengeSet: { id: string; version: number; hash: string; items: number; scopes: Record<string, number> }[];
  hardware: Record<string, HardwareProfile>;
  rows: Row[];
}

declare global {
  // biome-ignore lint/style/noVar: augmenting globalThis requires `var`
  var __BENCHMARK_ROWS: unknown;
}

export const DATASETS = (globalThis.__BENCHMARK_ROWS ?? []) as unknown as RowsDataset[];

/** `Apple M5 Max 128GB`; the id itself when the profile is unknown. */
export const hardwareLabel = (ds: RowsDataset, id: string): string => {
  const p = ds.hardware[id];
  return p === undefined ? id : `${p.cpu} ${p.memoryGb}GB`;
};
