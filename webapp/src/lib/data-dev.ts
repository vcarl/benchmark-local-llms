import "../data/data.js";
import { DATA, setData, normalizeRecord } from "./data";

// data.js sets window.__BENCHMARK_DATA after data.ts evaluated; rebind here.
if (DATA.length === 0 && typeof window !== "undefined" && window.__BENCHMARK_DATA) {
  setData((window.__BENCHMARK_DATA as Parameters<typeof normalizeRecord>[0][]).map(normalizeRecord));
}

export { DATA } from "./data";
export { normalizeRecord } from "./data";
export type { BenchmarkResult, AgentEvent } from "./data";
export { uniqueSorted, modelFamily, modelSizeB, modelSizeRange, SIZE_RANGES } from "./data";
