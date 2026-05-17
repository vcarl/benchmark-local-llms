/**
 * Group prototype records by `(model, runtime, quant)` — one group per
 * target RunManifest archive (§11.1). Records missing any of the three
 * identity fields are separated into an `invalid` bucket; the migration
 * tool reports them as diagnostic output and skips them.
 *
 * `runtime` is normalized to match the new Schema enum: the prototype wrote
 * both `"llama.cpp"` and `"llamacpp"` in different eras; we collapse to the
 * latter (matching the `Runtime` schema).
 */
import { Runtime } from "../schema/index.js";
import type { PrototypeRecord } from "./read-prototype.js";

export interface PrototypeGroup {
  readonly key: GroupKey;
  readonly records: ReadonlyArray<PrototypeRecord>;
  /** File paths whose records contributed to this group (for tracing). */
  readonly sourceFiles: ReadonlyArray<string>;
  /**
   * Latest mtime across all source files for this group. Used as the synthetic
   * `executedAt` for every ExecutionResult in the emitted archive (§11.1).
   */
  readonly mtimeMs: number;
}

export interface GroupKey {
  readonly model: string;
  readonly runtime: "llamacpp" | "mlx";
  readonly quant: string;
}

export interface InvalidRecord {
  readonly sourceFile: string;
  readonly reason: string;
}

const normalizeRuntime = (raw: string | undefined): "llamacpp" | "mlx" | null => {
  if (raw === undefined) return null;
  const cleaned = raw.replace(/\./g, "");
  if (!Runtime.literals.some((l) => l === cleaned)) return null;
  return cleaned as "llamacpp" | "mlx";
};

const keyString = (k: GroupKey): string => `${k.model}|${k.runtime}|${k.quant}`;

export interface GroupingResult {
  readonly groups: ReadonlyArray<PrototypeGroup>;
  readonly invalid: ReadonlyArray<InvalidRecord>;
}

/**
 * Group records from one or more prototype files by their identity triple.
 * Records with missing/unknown `runtime` or missing `model` are collected
 * separately and reported.
 */
export const groupByModel = (
  files: ReadonlyArray<{
    readonly path: string;
    readonly mtimeMs: number;
    readonly records: ReadonlyArray<PrototypeRecord>;
  }>,
): GroupingResult => {
  const groupMap = new Map<
    string,
    {
      key: GroupKey;
      records: PrototypeRecord[];
      sourceFiles: Set<string>;
      mtimeMs: number;
    }
  >();
  const invalid: InvalidRecord[] = [];

  for (const file of files) {
    for (const rec of file.records) {
      const model = rec.model;
      const runtime = normalizeRuntime(rec.runtime);
      const quant = rec.quant ?? "";
      if (model === undefined || model.length === 0) {
        invalid.push({ sourceFile: file.path, reason: "missing `model` field" });
        continue;
      }
      if (runtime === null) {
        invalid.push({
          sourceFile: file.path,
          reason: `unknown runtime: ${rec.runtime ?? "(missing)"}`,
        });
        continue;
      }
      const key: GroupKey = { model, runtime, quant };
      const ks = keyString(key);
      const existing = groupMap.get(ks);
      if (existing === undefined) {
        groupMap.set(ks, {
          key,
          records: [rec],
          sourceFiles: new Set([file.path]),
          mtimeMs: file.mtimeMs,
        });
      } else {
        existing.records.push(rec);
        existing.sourceFiles.add(file.path);
        if (file.mtimeMs > existing.mtimeMs) existing.mtimeMs = file.mtimeMs;
      }
    }
  }

  const groups: PrototypeGroup[] = [];
  for (const g of groupMap.values()) {
    groups.push({
      key: g.key,
      records: g.records,
      sourceFiles: [...g.sourceFiles].sort(),
      mtimeMs: g.mtimeMs,
    });
  }
  // Deterministic ordering: by key string, so tests and operator output are stable.
  groups.sort((a, b) => keyString(a.key).localeCompare(keyString(b.key)));

  return { groups, invalid };
};
