import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import {
  loadPresets, savePresets, seedIfEmpty, DEFAULT_PRESETS,
} from "./presets";

const storage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { store = {}; },
  };
})();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("localStorage", storage);
});
afterEach(() => vi.unstubAllGlobals());

describe("presets", () => {
  it("returns {} when storage empty", () => {
    expect(loadPresets()).toEqual({});
  });
  it("round-trips save/load", () => {
    savePresets({ foo: "tags=tool-use&groupBy=model" });
    expect(loadPresets()).toEqual({ foo: "tags=tool-use&groupBy=model" });
  });
  it("returns {} when storage is malformed", () => {
    storage.setItem("llm-bench.presets", "{not json");
    expect(loadPresets()).toEqual({});
  });
  it("seedIfEmpty writes the four defaults when storage is empty", () => {
    seedIfEmpty();
    const loaded = loadPresets();
    expect(Object.keys(loaded).sort()).toEqual(Object.keys(DEFAULT_PRESETS).sort());
  });
  it("seedIfEmpty is a noop when storage is non-empty", () => {
    savePresets({ mine: "tags=tool-use" });
    seedIfEmpty();
    expect(loadPresets()).toEqual({ mine: "tags=tool-use" });
  });
});
