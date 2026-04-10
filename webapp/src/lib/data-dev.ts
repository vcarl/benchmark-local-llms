// Dev/webapp entry — loads data.js (sets window.__BENCHMARK_DATA) for local development.
// The report build uses data.ts directly (reads from window.__BENCHMARK_DATA via <script> tag).
// Both paths share the same data.js file.
import "../data/data.js";
import { DATA, setData } from "./data";

// Re-read window.__BENCHMARK_DATA in case data.ts evaluated before data.js ran
if (DATA.length === 0 && typeof window !== "undefined" && window.__BENCHMARK_DATA) {
  setData(window.__BENCHMARK_DATA);
}

export { DATA } from "./data";
export type { BenchmarkResult } from "./data";
export { uniqueSorted, avgScore, modelsForRuntime, modelFamily, modelSizeB, modelSizeRange, SIZE_RANGES, groupBy, bestQuantData, bestQuantMap, quantSummary } from "./data";
export type { QuantInfo } from "./data";
