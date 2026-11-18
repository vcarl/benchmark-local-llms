import { describe, expect, it } from "vitest";
import {
  hardwareId,
  parseCoreTypes,
  parseGpuCores,
  parseNvidiaSmi,
  parseOsRelease,
} from "./hardware.js";

describe("hardware parsers", () => {
  it("parseCoreTypes pairs perflevel names with physical core counts", () => {
    expect(parseCoreTypes("2\nSuper\n6\nPerformance\n12\n")).toEqual({ Super: 6, Performance: 12 });
    expect(parseCoreTypes("")).toBeUndefined();
  });

  it("parseGpuCores reads sppci_cores from system_profiler JSON", () => {
    const json = JSON.stringify({
      SPDisplaysDataType: [
        { _name: "Apple M5 Max", sppci_cores: "40", sppci_model: "Apple M5 Max" },
      ],
    });
    expect(parseGpuCores(json)).toEqual({ gpu: "Apple M5 Max", gpuCores: 40 });
    expect(parseGpuCores("not json")).toEqual({});
  });

  it("parseNvidiaSmi reads name and memory, counting GPUs", () => {
    expect(parseNvidiaSmi("NVIDIA GeForce RTX 4090, 24564\n")).toEqual({
      gpu: "NVIDIA GeForce RTX 4090",
      gpuMemoryGb: 24,
    });
    expect(parseNvidiaSmi("A100, 81920\nA100, 81920\n")).toEqual({
      gpu: "2× A100",
      gpuMemoryGb: 160,
    });
    expect(parseNvidiaSmi("")).toEqual({});
  });

  it("parseOsRelease reads PRETTY_NAME", () => {
    expect(parseOsRelease('NAME="Ubuntu"\nPRETTY_NAME="Ubuntu 24.04.1 LTS"\n')).toBe(
      "Ubuntu 24.04.1 LTS",
    );
    expect(parseOsRelease("")).toBeUndefined();
  });

  it("hardwareId hashes the spec fields only: the OS version does not change it", () => {
    const p = { cpu: "Apple M5 Max", cpuCores: 18, memoryGb: 128, os: "macOS 27.0.1" };
    expect(hardwareId(p)).toMatch(/^[0-9a-f]{12}$/);
    expect(hardwareId({ ...p, os: "macOS 27.1" })).toBe(hardwareId(p));
    expect(hardwareId({ ...p, memoryGb: 64 })).not.toBe(hardwareId(p));
  });
});
