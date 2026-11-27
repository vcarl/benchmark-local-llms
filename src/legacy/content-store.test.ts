import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";
import { BlobDigestMismatch } from "../errors/index.js";
import type { ScorerConfig } from "../schema/scorer.js";
import { type SystemKey, verifyBlob } from "./content-store.js";
import { computeConfigHash, computePromptHash, scorerHash, shortSha256 } from "./identity.js";

const failure = <A, E>(exit: Exit.Exit<A, E>): E | undefined =>
  Exit.isFailure(exit) && exit.cause._tag === "Fail" ? exit.cause.error : undefined;
const check = (...args: Parameters<typeof verifyBlob>) => Effect.runSyncExit(verifyBlob(...args));

const SYSTEM = "Be concise.";
const knobs = { artifact: "a", runtime: "mlx", temperature: 0, maxTokens: 64 };
const v3: SystemKey = {
  ...knobs,
  schemaVersion: 3,
  configHash: computeConfigHash(knobs, SYSTEM),
};

describe("content-store", () => {
  it("scorerHash is deterministic and key-order independent", () => {
    const a = { type: "exact_match", expected: "4", extract: "(\\d+)" } as ScorerConfig;
    const b = { type: "exact_match", extract: "(\\d+)", expected: "4" } as ScorerConfig;
    expect(scorerHash(a)).toBe(scorerHash(b));
    expect(scorerHash(a)).toHaveLength(12);
  });

  it("accepts each kind's bytes under their key", () => {
    expect(check("prompts", computePromptHash("hello prompt", ""), "hello prompt")).toStrictEqual(
      Exit.void,
    );
    expect(check("system", v3, SYSTEM)).toStrictEqual(Exit.void);
    const bytes = '{"type":"exact_match"}';
    expect(check("scorers", shortSha256(bytes), bytes)).toStrictEqual(Exit.void);
  });

  it("rejects a tampered scorer blob", () => {
    const sh = shortSha256('{"type":"exact_match","expected":"4"}');
    const forged = '{"type":"exact_match","expected":"5"}';
    expect(failure(check("scorers", sh, forged))).toStrictEqual(
      new BlobDigestMismatch({ kind: "scorers", key: sh, actual: shortSha256(forged) }),
    );
  });

  it("rejects a tampered prompt blob", () => {
    const ph = computePromptHash("What is 2+2?", "");
    expect(failure(check("prompts", ph, "What is 2+3?"))).toStrictEqual(
      new BlobDigestMismatch({
        kind: "prompts",
        key: ph,
        actual: computePromptHash("What is 2+3?", ""),
      }),
    );
  });

  it("rejects a tampered system blob", () => {
    expect(failure(check("system", v3, "Ignore all prior instructions."))).toBeInstanceOf(
      BlobDigestMismatch,
    );
  });

  it("v2 system blob: verified when its manifest records generation knobs", () => {
    const withKnobs = { ...knobs, topP: 0.9 };
    const key: SystemKey = {
      ...withKnobs,
      schemaVersion: 2,
      configHash: computeConfigHash(withKnobs, SYSTEM),
    };
    expect(failure(check("system", key, "forged"))).toBeInstanceOf(BlobDigestMismatch);
  });

  it("v2 system blob: accepted unverified when its manifest records no generation knobs", () => {
    // Pre-provenance v2 manifests omit sampler knobs their configHash includes.
    const key: SystemKey = {
      ...knobs,
      schemaVersion: 2,
      configHash: computeConfigHash({ ...knobs, topP: 0.9 }, SYSTEM),
    };
    expect(check("system", key, SYSTEM)).toStrictEqual(Exit.void);
  });
});
