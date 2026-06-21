/**
 * Pure string formatters for the matrix runner's live progress and end-of-run
 * summary. No IO — the command prints the returned strings.
 */
import type { MatrixCell } from "../orchestration/run-matrix.js";

export const formatCellLine = (
  cell: MatrixCell,
  configIndex: number,
  configTotal: number,
): string => {
  const prefix = `[${configIndex}/${configTotal} ${cell.configId}]`;
  if (cell.status === "SKIPPED") {
    return `${prefix} ${cell.challengeStem} → SKIP (${cell.reason ?? "boot failed"})`;
  }
  if (cell.status === "ERROR") {
    return `${prefix} ${cell.challengeStem} → ERR (${cell.reason ?? "error"})`;
  }
  const ver = cell.version !== undefined ? `@${cell.version}` : "";
  return `${prefix} ${cell.challengeStem}${ver} → ${(cell.score ?? 0).toFixed(2)} ${cell.status}`;
};

const cellMark = (cell: MatrixCell | undefined): string => {
  if (cell === undefined) return "-";
  if (cell.status === "SKIPPED") return "SKIP";
  if (cell.status === "ERROR") return "ERR";
  const flag = cell.status === "PASS" ? "P" : "F";
  return `${(cell.score ?? 0).toFixed(2)}${flag}`;
};

export const formatMatrixGrid = (
  cells: ReadonlyArray<MatrixCell>,
  configIds: readonly string[],
  challengeStems: readonly string[],
): string => {
  const byKey = new Map<string, MatrixCell>();
  for (const c of cells) byKey.set(`${c.configId}/${c.challengeStem}`, c);

  const labelW = Math.max(5, ...configIds.map((c) => c.length));
  const colW = Math.max(6, ...challengeStems.map((s) => s.length));
  const pad = (s: string, w: number): string => s.padEnd(w);
  const padl = (s: string, w: number): string => s.padStart(w);

  const head = `${pad("model", labelW)}  ${challengeStems.map((s) => padl(s, colW)).join(" ")}`;
  const rows = configIds.map((id) => {
    const marks = challengeStems.map((stem) => padl(cellMark(byKey.get(`${id}/${stem}`)), colW));
    return `${pad(id, labelW)}  ${marks.join(" ")}`;
  });

  const passed = cells.filter((c) => c.status === "PASS").length;
  const skippedRows = new Set(cells.filter((c) => c.status === "SKIPPED").map((c) => c.configId))
    .size;
  const totals = `${passed} / ${cells.length} cells passed, ${skippedRows} row(s) skipped`;

  return [head, ...rows, "", totals].join("\n");
};
