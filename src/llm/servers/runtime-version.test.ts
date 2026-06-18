import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { parseLlamacppVersion, parseMlxVersion, probeRuntimeVersion } from "./runtime-version.js";

describe("parseLlamacppVersion", () => {
  it("extracts build + sha from the version line", () => {
    expect(parseLlamacppVersion("version: 8390 (b6c83aad5)")).toBe("llama.cpp b8390 (b6c83aad5)");
  });

  it("finds the version line amid Metal-init stderr noise", () => {
    const raw = [
      "ggml_metal_device_init: testing tensor API for f16 support",
      "ggml_metal_library_compile_pipeline: compiling pipeline: base = 'dummy_kernel'",
      "version: 9692 (deadbeef)",
      "built with Apple clang",
    ].join("\n");
    expect(parseLlamacppVersion(raw)).toBe("llama.cpp b9692 (deadbeef)");
  });

  it("returns 'unknown' when no version line is present", () => {
    expect(parseLlamacppVersion("some unrelated output")).toBe("unknown");
  });
});

describe("parseMlxVersion", () => {
  it("extracts a bare semver", () => {
    expect(parseMlxVersion("0.31.2")).toBe("mlx-lm 0.31.2");
  });

  it("extracts a semver amid surrounding text/newlines", () => {
    expect(parseMlxVersion("mlx_lm version 0.31.3\n")).toBe("mlx-lm 0.31.3");
  });

  it("returns 'unknown' when no semver is present", () => {
    expect(parseMlxVersion("no version here")).toBe("unknown");
  });
});

describe("probeRuntimeVersion", () => {
  it("degrades to 'unknown' when the binary does not exist (llamacpp)", async () => {
    const result = await Effect.runPromise(
      probeRuntimeVersion("llamacpp", "/nonexistent/llama-server").pipe(
        Effect.provide(NodeContext.layer),
      ),
    );
    expect(result).toBe("unknown");
  });

  it("degrades to 'unknown' when the binary does not exist (mlx)", async () => {
    const result = await Effect.runPromise(
      probeRuntimeVersion("mlx", "/nonexistent/python3").pipe(Effect.provide(NodeContext.layer)),
    );
    expect(result).toBe("unknown");
  });
});
