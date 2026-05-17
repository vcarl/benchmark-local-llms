import { describe, it, expect, beforeEach } from "vitest";
import { getHoveredModel, setHoveredModel, clearHoveredModel, subscribeHover } from "./hover-store";

describe("hover-store", () => {
  beforeEach(() => clearHoveredModel());

  it("starts empty", () => {
    expect(getHoveredModel()).toBeNull();
  });

  it("set/get round-trip", () => {
    setHoveredModel("qwen-2.5-7b");
    expect(getHoveredModel()).toBe("qwen-2.5-7b");
  });

  it("clear resets to null", () => {
    setHoveredModel("qwen-2.5-7b");
    clearHoveredModel();
    expect(getHoveredModel()).toBeNull();
  });

  it("subscribe notifies on change", () => {
    let calls = 0;
    const unsub = subscribeHover(() => { calls += 1; });
    setHoveredModel("llama-3.1-8b");
    setHoveredModel("qwen-2.5-7b");
    clearHoveredModel();
    expect(calls).toBe(3);
    unsub();
  });

  it("setting the same value does not notify twice", () => {
    let calls = 0;
    const unsub = subscribeHover(() => { calls += 1; });
    setHoveredModel("llama-3.1-8b");
    setHoveredModel("llama-3.1-8b");
    expect(calls).toBe(1);
    unsub();
  });

  it("unsubscribe stops notifications", () => {
    let calls = 0;
    const unsub = subscribeHover(() => { calls += 1; });
    unsub();
    setHoveredModel("llama-3.1-8b");
    expect(calls).toBe(0);
  });
});
