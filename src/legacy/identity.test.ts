import { describe, expect, it } from "vitest";
import { computeConfigHash } from "./identity.js";

describe("computeConfigHash", () => {
  it("chatTemplateSha joins the hash only when set, by content", () => {
    const base = { artifact: "a", runtime: "llamacpp", temperature: 0.7, maxTokens: 100 };
    const h = (extra: object) => computeConfigHash({ ...base, ...extra }, "Be concise.");
    expect(h({ chatTemplateSha: undefined })).toBe(h({}));
    expect(h({ chatTemplateSha: "aaaaaaaaaaaa" })).not.toBe(h({}));
    expect(h({ chatTemplateSha: "aaaaaaaaaaaa" })).not.toBe(h({ chatTemplateSha: "bbbbbbbbbbbb" }));
  });

  it("computeConfigHash is stable and order-insensitive to unrelated fields", () => {
    const h1 = computeConfigHash(
      { artifact: "a", runtime: "mlx", temperature: 0.7, maxTokens: 100 },
      "Be concise.",
    );
    const h2 = computeConfigHash(
      { artifact: "a", runtime: "mlx", temperature: 0.7, maxTokens: 100 },
      "Be concise.",
    );
    expect(h1).toBe(h2);
  });

  it("sampler fields join the hash only when set", () => {
    const base = {
      artifact: "a",
      runtime: "mlx",
      temperature: 0.7,
      maxTokens: 100,
    };
    const h = (extra: object) => computeConfigHash({ ...base, ...extra }, "Be concise.");
    expect(
      h({
        topP: undefined,
        topK: undefined,
        minP: undefined,
        presencePenalty: undefined,
        presenceContextSize: undefined,
      }),
    ).toBe(h({}));
    const set = [
      h({ topP: 0.9 }),
      h({ topK: 40 }),
      h({ minP: 0.05 }),
      h({ presencePenalty: 1.5 }),
      h({ presencePenalty: 1.5, presenceContextSize: 32768 }),
    ];
    expect(new Set([h({}), ...set]).size).toBe(6);
  });

  it("chatTemplateKwargs joins the hash only when set, independent of key order", () => {
    const base = { artifact: "a", runtime: "mlx", temperature: 0.7, maxTokens: 100 };
    const h = (extra: object) => computeConfigHash({ ...base, ...extra }, "Be concise.");
    // Pinned to the hash this configuration had before the field existed.
    expect(h({ chatTemplateKwargs: undefined })).toBe("efcd17f58120");
    expect(h({ chatTemplateKwargs: { enable_thinking: true } })).not.toBe(h({}));
    expect(h({ chatTemplateKwargs: { a: 1, b: "x" } })).toBe(
      h({ chatTemplateKwargs: { b: "x", a: 1 } }),
    );
  });
});
