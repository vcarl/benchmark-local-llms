import { describe, expect, it } from "vitest";
import { formatRunRecord } from "../commands/run.js";

describe("formatRunRecord", () => {
  it("produces the documented tab-separated line", () => {
    const line = formatRunRecord({
      model: "qwen3.5-9b",
      runtime: "mlx",
      quant: "Q4_K_M",
      completed: 38,
      cached: 2,
      errors: 0,
      totalWallTimeSec: 204.3,
      genTps: 18.2,
      interrupted: false,
      archivePath: "./benchmark-archive/run1.jsonl",
    });
    expect(line).toBe(
      "qwen3.5-9b\tmlx\tQ4_K_M\tcompleted=38\tcached=2\terrors=0\twall=204.3\tgenTps=18.2\tinterrupted=false\tarchive=./benchmark-archive/run1.jsonl",
    );
  });
});
