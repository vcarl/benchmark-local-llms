import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { modelKeyOf, modelKeyOverrides, modelNameOf } from "./model-key.js";

describe("modelNameOf", () => {
  it("drops the org, uploader prefix and packaging tokens", () => {
    expect(modelNameOf("mlx-community/Qwen3-Coder-30B-A3B-Instruct-4bit")).toBe(
      "Qwen3-Coder-30B-A3B-Instruct",
    );
    expect(modelNameOf("bartowski/nvidia_Llama-3.1-Nemotron-Nano-8B-v1-GGUF")).toBe(
      "Llama-3.1-Nemotron-Nano-8B-v1",
    );
    expect(modelNameOf("mlx-community/gpt-oss-20b-MXFP4-Q4")).toBe("gpt-oss-20b");
    expect(modelNameOf("lmstudio-community/Qwen3.8-27B-MLX-6bit")).toBe("Qwen3.8-27B");
  });

  it("an override wins over the heuristic", () => {
    expect(modelKeyOf("a/X-GGUF", new Map([["a/X-GGUF", "y"]]))).toBe("y");
  });
});

describe("model groups of configs.yaml", () => {
  // Eyeball list: every artifact in configs.yaml under the key it groups by.
  it("groups builds of one model together", () => {
    const src = readFileSync(new URL("../../configs.yaml", import.meta.url), "utf8");
    const artifacts = (parse(src) as { artifact: string }[]).map((c) => c.artifact);
    const overrides = modelKeyOverrides(parse(src));
    const groups: Record<string, string[]> = {};
    for (const a of [...new Set(artifacts)].sort()) {
      const k = modelKeyOf(a, overrides);
      groups[k] = [...(groups[k] ?? []), a];
    }
    const sorted = Object.fromEntries(
      Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)),
    );
    expect(sorted).toMatchInlineSnapshot(`
      {
        "cyber-tiel-coder-35b-a3b": [
          "peculiar-ragdoll/Cyber-Tiel-Coder-35B-A3B-GGUF",
        ],
        "deepseek-coder-v2-lite-instruct": [
          "bartowski/DeepSeek-Coder-V2-Lite-Instruct-GGUF",
          "mlx-community/DeepSeek-Coder-V2-Lite-Instruct-4bit",
        ],
        "deepseek-r1-0528-qwen3-8b": [
          "mlx-community/DeepSeek-R1-0528-Qwen3-8B-4bit",
          "unsloth/DeepSeek-R1-0528-Qwen3-8B-GGUF",
        ],
        "deepseek-r1-distill-llama-70b": [
          "bartowski/DeepSeek-R1-Distill-Llama-70B-GGUF",
          "mlx-community/DeepSeek-R1-Distill-Llama-70B-4bit",
        ],
        "deepseek-r1-distill-qwen-14b": [
          "bartowski/DeepSeek-R1-Distill-Qwen-14B-GGUF",
          "mlx-community/DeepSeek-R1-Distill-Qwen-14B-4bit",
        ],
        "deepseek-r1-distill-qwen-32b": [
          "bartowski/DeepSeek-R1-Distill-Qwen-32B-GGUF",
          "mlx-community/DeepSeek-R1-Distill-Qwen-32B-4bit",
        ],
        "deepseek-r1-distill-qwen-7b": [
          "bartowski/DeepSeek-R1-Distill-Qwen-7B-GGUF",
          "mlx-community/DeepSeek-R1-Distill-Qwen-7B-4bit",
        ],
        "devstral-2-123b-instruct-2512": [
          "mlx-community/Devstral-2-123B-Instruct-2512-4bit",
          "unsloth/Devstral-2-123B-Instruct-2512-GGUF",
        ],
        "devstral-small-2-24b-instruct-2512": [
          "mlx-community/Devstral-Small-2-24B-Instruct-2512-4bit",
          "unsloth/Devstral-Small-2-24B-Instruct-2512-GGUF",
        ],
        "flint": [
          "unsloth/flint-GGUF",
        ],
        "gemma-4-12b-it": [
          "lmstudio-community/gemma-4-12B-it-MLX-4bit",
        ],
        "gemma-4-26b-a4b-it": [
          "mlx-community/gemma-4-26b-a4b-it-4bit",
          "unsloth/gemma-4-26B-A4B-it-GGUF",
        ],
        "gemma-4-31b-it": [
          "mlx-community/gemma-4-31b-it-4bit",
          "mlx-community/gemma-4-31b-it-8bit",
          "unsloth/gemma-4-31B-it-GGUF",
        ],
        "gemma-4-e4b-it": [
          "mlx-community/gemma-4-e4b-it-4bit",
          "unsloth/gemma-4-E4B-it-GGUF",
        ],
        "glm-4.7-flash": [
          "mlx-community/GLM-4.7-Flash-4bit",
          "unsloth/GLM-4.7-Flash-GGUF",
        ],
        "gpt-oss-120b": [
          "mlx-community/gpt-oss-120b-MXFP4-Q4",
          "unsloth/gpt-oss-120b-GGUF",
        ],
        "gpt-oss-20b": [
          "mlx-community/gpt-oss-20b-MXFP4-Q4",
          "unsloth/gpt-oss-20b-GGUF",
        ],
        "hunyuan-a13b-instruct": [
          "mlx-community/Hunyuan-A13B-Instruct-4bit",
        ],
        "kimi-linear-48b-a3b-instruct": [
          "mlx-community/Kimi-Linear-48B-A3B-Instruct-4bit",
        ],
        "kolibri-1": [
          "velaia/Kolibri-1-MLX-4bit",
        ],
        "laguna-s-2.1": [
          "mlx-community/Laguna-S-2.1-oQ4e",
        ],
        "ling-3.0-flash": [
          "inclusionAI/Ling-3.0-flash-GGUF",
        ],
        "llama-3.1-nemotron-nano-8b-v1": [
          "bartowski/nvidia_Llama-3.1-Nemotron-Nano-8B-v1-GGUF",
        ],
        "llama-3_3-nemotron-super-49b-v1_5": [
          "bartowski/nvidia_Llama-3_3-Nemotron-Super-49B-v1_5-GGUF",
        ],
        "llama-4-maverick-17b-128e-instruct": [
          "mlx-community/Llama-4-Maverick-17B-128E-Instruct-4bit",
          "unsloth/Llama-4-Maverick-17B-128E-Instruct-GGUF",
        ],
        "llama-4-scout-17b-16e-instruct": [
          "mlx-community/Llama-4-Scout-17B-16E-Instruct-4bit",
          "unsloth/Llama-4-Scout-17B-16E-Instruct-GGUF",
        ],
        "magistral-small-2509": [
          "lmstudio-community/Magistral-Small-2509-MLX-4bit",
          "mistralai/Magistral-Small-2509-GGUF",
        ],
        "mellum2.1-12b-a2.5b-thinking": [
          "randmaru/Mellum2.1-12B-A2.5B-Thinking-mlx-mxfp4",
        ],
        "meta-llama-3.1-8b-instruct": [
          "bartowski/Meta-Llama-3.1-8B-Instruct-GGUF",
          "mlx-community/Meta-Llama-3.1-8B-Instruct-4bit",
        ],
        "mistral-small-3.2-24b-instruct-2506": [
          "bartowski/mistralai_Mistral-Small-3.2-24B-Instruct-2506-GGUF",
          "mlx-community/Mistral-Small-3.2-24B-Instruct-2506-4bit",
        ],
        "mistral-small-4-119b-2603": [
          "mlx-community/Mistral-Small-4-119B-2603-4bit",
          "unsloth/Mistral-Small-4-119B-2603-GGUF",
        ],
        "nvidia-nemotron-3.5-lightning-30b-a3b": [
          "mlx-community/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-4bit",
        ],
        "phi-4": [
          "mlx-community/phi-4-4bit",
          "mlx-community/phi-4-8bit",
          "unsloth/phi-4-GGUF",
        ],
        "qwen2.5-0.5b-instruct": [
          "Qwen/Qwen2.5-0.5B-Instruct-GGUF",
        ],
        "qwen2.5-32b-instruct": [
          "Qwen/Qwen2.5-32B-Instruct-GGUF",
          "mlx-community/Qwen2.5-32B-Instruct-4bit",
        ],
        "qwen2.5-72b-instruct": [
          "Qwen/Qwen2.5-72B-Instruct-GGUF",
          "mlx-community/Qwen2.5-72B-Instruct-4bit",
        ],
        "qwen2.5-7b-instruct": [
          "Qwen/Qwen2.5-7B-Instruct-GGUF",
          "mlx-community/Qwen2.5-7B-Instruct-4bit",
        ],
        "qwen2.5-coder-32b-instruct": [
          "Qwen/Qwen2.5-Coder-32B-Instruct-GGUF",
          "mlx-community/Qwen2.5-Coder-32B-Instruct-4bit",
        ],
        "qwen3-32b": [
          "Qwen/Qwen3-32B-GGUF",
          "mlx-community/Qwen3-32B-4bit",
          "mlx-community/Qwen3-32B-8bit",
        ],
        "qwen3-coder-30b-a3b-instruct": [
          "mlx-community/Qwen3-Coder-30B-A3B-Instruct-4bit",
          "unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF",
        ],
        "qwen3-coder-next": [
          "Qwen/Qwen3-Coder-Next-GGUF",
          "mlx-community/Qwen3-Coder-Next-4bit",
        ],
        "qwen3.5-0.8b": [
          "mlx-community/Qwen3.5-0.8B-4bit",
          "unsloth/Qwen3.5-0.8B-GGUF",
        ],
        "qwen3.5-122b-a10b": [
          "bartowski/Qwen_Qwen3.5-122B-A10B-GGUF",
          "mlx-community/Qwen3.5-122B-A10B-4bit",
        ],
        "qwen3.5-27b": [
          "mlx-community/Qwen3.5-27B-4bit",
          "unsloth/Qwen3.5-27B-GGUF",
        ],
        "qwen3.5-2b": [
          "mlx-community/Qwen3.5-2B-4bit",
          "unsloth/Qwen3.5-2B-GGUF",
        ],
        "qwen3.5-35b-a3b": [
          "mlx-community/Qwen3.5-35B-A3B-4bit",
          "unsloth/Qwen3.5-35B-A3B-GGUF",
        ],
        "qwen3.5-9b": [
          "mlx-community/Qwen3.5-9B-4bit",
          "unsloth/Qwen3.5-9B-GGUF",
        ],
        "qwen3.6-27b": [
          "mlx-community/Qwen3.6-27B-4bit",
          "mlx-community/Qwen3.6-27B-8bit",
          "unsloth/Qwen3.6-27B-GGUF",
        ],
        "qwen3.6-35b-a3b": [
          "mlx-community/Qwen3.6-35B-A3B-4bit",
          "unsloth/Qwen3.6-35B-A3B-GGUF",
        ],
        "qwen3.8-27b": [
          "lmstudio-community/Qwen3.8-27B-MLX-5bit",
          "lmstudio-community/Qwen3.8-27B-MLX-6bit",
          "mlx-community/Qwen3.8-27B-4bit",
          "unsloth/Qwen3.8-27B-GGUF",
          "~/.omlx/models/Qwen3.8-27B-4bit-MTP",
        ],
        "qwen3.8-flash-next": [
          "unsloth/Qwen3.8-Flash-Next-GGUF",
        ],
        "qwq-32b": [
          "Qwen/QwQ-32B-GGUF",
          "mlx-community/QwQ-32B-4bit",
          "mlx-community/QwQ-32B-8bit",
        ],
        "seed-oss-36b-instruct": [
          "lmstudio-community/Seed-OSS-36B-Instruct-MLX-4bit",
        ],
      }
    `);
  });
});
