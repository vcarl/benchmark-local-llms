import { describe, expect, it } from "vitest";
import type { Row, RowsDataset } from "./rows";
import { variantLine, variantTitle } from "./variant-line";

const row = {
  artifact: "mlx-community/Qwen3.8-27B-4bit",
  runtime: "omlx",
  quant: "4bit",
  temperature: 1,
  hardwareId: "hw",
  variant: { maxTokens: "32768", runtime: "omlx" },
} as unknown as Row;
const ds = { hardware: {} } as unknown as RowsDataset;

describe("variantLine", () => {
  it("is runtime · quant · temperature, then the fields that differ from siblings; no org", () => {
    expect(variantLine(row, ds)).toBe("omlx · 4bit · t1 · maxTokens 32768");
  });
  it("hovers with the artifact repo and the full line", () => {
    expect(variantTitle(row, ds)).toBe("mlx-community/Qwen3.8-27B-4bit · omlx · 4bit · t1 · maxTokens 32768");
  });
});
