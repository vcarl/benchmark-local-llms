// A dataset snapshot (`snapshots/<digest>.json`, fetched by ./snapshots.ts): the
// report's selected rows. The webapp reads only this: it sums cells and
// displays, and never chooses evidence.

import type { Timing } from "./timing";

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

/** An `errata.yaml` entry (src/config/errata.ts). */
export interface Erratum {
  id: string;
  date: string;
  kind: "answer-key" | "scorer" | "prompt-ambiguity" | "retired" | "added";
  items: string[];
  description: string;
  scorerChange: boolean;
  /** Recorded lines whose score the erratum changed (a retirement: dropped), and their configs. */
  scoresChanged: { lines: number; configs: number };
  releaseStatus: "none" | "next-release" | "released";
  releasedIn?: string;
}

export interface RowsDataset {
  dataset: {
    label: string;
    /** Display name: `Alpha challenge set`, `Release <version>`, `Pre-release (draft)`, or the label. */
    title: string;
    archiveDir: string;
    challengesDir: string;
    /** Release: `0` (alpha challenge set), `draft` (pre-release) or `YYYY.N`. */
    release: string | null;
    /** Eval version `<release>.<n>`: the release plus its errata 1..n. */
    version: string | null;
    errata: Erratum[];
    ranked: boolean;
    legacy: boolean;
  };
  /** The release file (release.json) without its items. */
  releaseFile: {
    release: string;
    label?: string;
    date?: string;
    closed?: string;
    commitment?: string;
    committedAt?: string;
  };
  schemaVersion: number;
  challengeSet: { id: string; version: number; hash: string; items: number; scopes: Record<string, number> }[];
  hardware: Record<string, HardwareProfile>;
  rows: Row[];
  /** Evaluation timing disclosure; absent in older snapshots. */
  timing?: Timing;
}

/** `Apple M5 Max 128GB`; the id itself when the profile is unknown. */
export const hardwareLabel = (ds: RowsDataset, id: string): string => {
  const p = ds.hardware[id];
  return p === undefined ? id : `${p.cpu} ${p.memoryGb}GB`;
};
