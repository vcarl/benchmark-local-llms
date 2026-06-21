import { expect, it } from "vitest";
import type { MatrixCell } from "../../orchestration/run-matrix.js";
import { formatCellLine, formatMatrixGrid } from "../matrix-format.js";

it("formats a passing cell line with index prefix and score", () => {
  const cell: MatrixCell = {
    configId: "qwen2.5-7b-mlx",
    challengeStem: "code",
    challengeId: "code",
    version: 1,
    status: "PASS",
    score: 0.8,
  };
  expect(formatCellLine(cell, 1, 2)).toBe("[1/2 qwen2.5-7b-mlx] code@1 → 0.80 PASS");
});

it("formats a skipped cell line", () => {
  const cell: MatrixCell = {
    configId: "smoke",
    challengeStem: "math",
    challengeId: "math",
    status: "SKIPPED",
    reason: "ServerSpawnError",
  };
  expect(formatCellLine(cell, 2, 2)).toBe("[2/2 smoke] math → SKIP (ServerSpawnError)");
});

it("renders a grid with a totals line", () => {
  const cells: MatrixCell[] = [
    { configId: "m1", challengeStem: "code", challengeId: "code", status: "PASS", score: 1 },
    { configId: "m1", challengeStem: "math", challengeId: "math", status: "FAIL", score: 0.5 },
  ];
  const grid = formatMatrixGrid(cells, ["m1"], ["code", "math"]);
  expect(grid).toContain("m1");
  expect(grid).toContain("code");
  expect(grid).toContain("math");
  expect(grid).toMatch(/1 \/ 2 cells passed/);
});
