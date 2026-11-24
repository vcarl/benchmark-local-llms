import { describe, expect, it } from "vitest";
import { mutants } from "./codefix.js";

describe("codefix mutants", () => {
  it("enumerates one-token mutations: comparison, arithmetic, boolean, literal off-by-one", () => {
    const src = "def f(x, n=3):\n    return x + n if x <= 1 and True else x";
    const got = mutants(src).map((m) => m.source);
    expect(got).toContain("def f(x, n=2):\n    return x + n if x <= 1 and True else x");
    expect(got).toContain("def f(x, n=4):\n    return x + n if x <= 1 and True else x");
    expect(got).toContain("def f(x, n=3):\n    return x - n if x <= 1 and True else x");
    expect(got).toContain("def f(x, n=3):\n    return x + n if x < 1 and True else x");
    expect(got).toContain("def f(x, n=3):\n    return x + n if x > 1 and True else x");
    expect(got).toContain("def f(x, n=3):\n    return x + n if x <= 1 or True else x");
    expect(got).toContain("def f(x, n=3):\n    return x + n if x <= 1 and False else x");
    expect(new Set(got).size).toBe(got.length);
    expect(got).not.toContain(src);
  });

  it("leaves identifiers containing digits or keywords alone", () => {
    expect(mutants("def g2(order):\n    return order").map((m) => m.source)).toEqual([]);
  });
});
