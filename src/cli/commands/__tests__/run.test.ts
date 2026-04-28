import { Option } from "effect";
import { describe, expect, it } from "vitest";
import { normalizeRunOptions } from "../run.js";

const baseParsed = {
  modelName: Option.none() as Option.Option<string>,
  quant: Option.none() as Option.Option<string>,
  params: Option.none() as Option.Option<string>,
  maxTokens: 8096,
  scenarios: "all",
  noSave: false,
  fresh: false,
  idleTimeout: Option.none() as Option.Option<number>,
  archiveDir: "./benchmark-archive",
  scenariosOnly: false,
  modelsFile: "models.yaml",
  promptsDir: "prompts",
  admiralDir: Option.none() as Option.Option<string>,
  gameServerBinary: Option.none() as Option.Option<string>,
  verbose: false,
};

describe("normalizeRunOptions", () => {
  it("produces defaults when nothing is overridden", () => {
    const out = normalizeRunOptions(baseParsed);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.flags.fresh).toBe(false);
    expect(out.flags.noSave).toBe(false);
    expect(out.flags.scenariosOnly).toBe(false);
    expect(out.flags.modelName).toBeUndefined();
    expect(out.flags.idleTimeoutSec).toBeUndefined();
  });

  it("threads --model-name through to RunFlags.modelName", () => {
    const out = normalizeRunOptions({ ...baseParsed, modelName: Option.some("qwen") });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.flags.modelName).toBe("qwen");
  });

  it("threads --idle-timeout through when set", () => {
    const out = normalizeRunOptions({ ...baseParsed, idleTimeout: Option.some(60) });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.flags.idleTimeoutSec).toBe(60);
  });

  it("threads boolean flags --fresh and --no-save", () => {
    const out = normalizeRunOptions({ ...baseParsed, fresh: true, noSave: true });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.flags.fresh).toBe(true);
    expect(out.flags.noSave).toBe(true);
  });

  it("threads --scenarios substring filter through to RunFlags.scenarios", () => {
    const out = normalizeRunOptions({ ...baseParsed, scenarios: "pvp" });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.flags.scenarios).toBe("pvp");
  });
});
