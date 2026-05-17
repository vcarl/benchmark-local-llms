import { describe, expect, it } from "vitest";
import { groupByModel } from "./group-by-model.js";
import type { PrototypeRecord } from "./read-prototype.js";

const rec = (overrides: Partial<PrototypeRecord>): PrototypeRecord => ({ ...overrides });

describe("groupByModel", () => {
  it("groups records by (model, runtime, quant)", () => {
    const files = [
      {
        path: "/f1.jsonl",
        mtimeMs: 1000,
        records: [
          rec({ model: "A", runtime: "mlx", quant: "4bit", prompt_name: "p1" }),
          rec({ model: "A", runtime: "mlx", quant: "4bit", prompt_name: "p2" }),
          rec({ model: "B", runtime: "llamacpp", quant: "Q4_K_M", prompt_name: "p1" }),
        ],
      },
    ];
    const { groups, invalid } = groupByModel(files);
    expect(invalid).toHaveLength(0);
    expect(groups).toHaveLength(2);
    const groupA = groups.find((g) => g.key.model === "A");
    const groupB = groups.find((g) => g.key.model === "B");
    expect(groupA?.records).toHaveLength(2);
    expect(groupB?.records).toHaveLength(1);
    expect(groupB?.key.runtime).toBe("llamacpp");
  });

  it("splits records from the same file by differing quant", () => {
    const files = [
      {
        path: "/f.jsonl",
        mtimeMs: 1,
        records: [
          rec({ model: "X", runtime: "mlx", quant: "4bit", prompt_name: "p1" }),
          rec({ model: "X", runtime: "mlx", quant: "8bit", prompt_name: "p2" }),
        ],
      },
    ];
    const { groups } = groupByModel(files);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.key.quant).sort()).toEqual(["4bit", "8bit"]);
  });

  it("normalizes 'llama.cpp' to 'llamacpp'", () => {
    const files = [
      {
        path: "/f.jsonl",
        mtimeMs: 1,
        records: [rec({ model: "M", runtime: "llama.cpp", prompt_name: "p" })],
      },
    ];
    const { groups } = groupByModel(files);
    expect(groups[0]?.key.runtime).toBe("llamacpp");
  });

  it("reports records missing model or runtime as invalid", () => {
    const files = [
      {
        path: "/f.jsonl",
        mtimeMs: 1,
        records: [
          rec({ runtime: "mlx", prompt_name: "p" }),
          rec({ model: "M", runtime: "weird", prompt_name: "p" }),
        ],
      },
    ];
    const { groups, invalid } = groupByModel(files);
    expect(groups).toHaveLength(0);
    expect(invalid).toHaveLength(2);
  });

  it("aggregates mtimeMs using the max across source files", () => {
    const files = [
      {
        path: "/f1.jsonl",
        mtimeMs: 100,
        records: [rec({ model: "M", runtime: "mlx", prompt_name: "p1" })],
      },
      {
        path: "/f2.jsonl",
        mtimeMs: 200,
        records: [rec({ model: "M", runtime: "mlx", prompt_name: "p2" })],
      },
    ];
    const { groups } = groupByModel(files);
    expect(groups[0]?.mtimeMs).toBe(200);
    expect(groups[0]?.sourceFiles).toHaveLength(2);
  });
});
