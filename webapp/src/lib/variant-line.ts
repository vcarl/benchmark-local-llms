// A row's meta line: `runtime · quant · t0.7`, then the fields that tell it
// apart from sibling rows of its artifact (`maxTokens 8192`, a machine).
import { hardwareLabel, type Row, type RowsDataset } from "./rows";

const SHOWN_VARIANT_KEYS = new Set(["runtime", "quant", "temperature"]);

export const variantLine = (row: Row, ds: RowsDataset): string => {
  const differing = Object.entries(row.variant)
    .filter(([k]) => !SHOWN_VARIANT_KEYS.has(k))
    .map(([k, v]) => (k === "hardware" ? hardwareLabel(ds, row.hardwareId) : `${k} ${v}`));
  return [row.runtime, row.quant ?? "—", `t${row.temperature}`, ...differing].join(" · ");
};

/** The meta line's hover text: the artifact repo, then the full line. */
export const variantTitle = (row: Row, ds: RowsDataset): string => `${row.artifact} · ${variantLine(row, ds)}`;
