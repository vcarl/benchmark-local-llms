/**
 * QA Tier-A4: resolution + hashing + determinism verifier.
 *
 * Mirrors run.ts's config/challenge loading sequence against the REAL
 * loaders. Resolves a config id + challenge, prints configHash/challengeHash/
 * first itemHash, asserts each is 12-hex, then re-resolves and asserts the
 * three hashes are identical across runs (deterministic stableStringify).
 *
 * Run: node_modules/.bin/tsx .claude/skills/qa/check-resolution.ts
 *   argv: [configsFile] [challenge] [systemPromptsFile]  (defaults to repo-root paths)
 */
import { NodeContext } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { loadChallenge } from "../../../src/config/challenges.js";
import { loadConfigurations } from "../../../src/config/configurations.js";
import { loadSystemPrompts, SystemPromptRegistry } from "../../../src/config/system-prompts.js";
import { DEFAULT_SYSTEM_PROMPTS_PATH } from "../../../src/cli/paths.js";

const configsFile = process.argv[2] ?? "configs.yaml";
const challengePath = process.argv[3] ?? "challenges/smoke.yaml";
const systemPromptsFile = process.argv[4] ?? DEFAULT_SYSTEM_PROMPTS_PATH;
const configId = "smoke-config";

const HEX12 = /^[0-9a-f]{12}$/;

const resolveOnce = Effect.gen(function* () {
  const systemPrompts = yield* loadSystemPrompts(systemPromptsFile);
  const registryLayer = Layer.succeed(SystemPromptRegistry, systemPrompts);
  const configs = yield* loadConfigurations(configsFile).pipe(Effect.provide(registryLayer));
  const cfg = configs.find((c) => c.id === configId);
  if (cfg === undefined) return yield* Effect.dieMessage(`Unknown config id '${configId}'`);
  const challenge = yield* loadChallenge(challengePath);
  const item = challenge.items[0];
  if (item === undefined) return yield* Effect.dieMessage("challenge has no items");
  return { configHash: cfg.configHash, challengeHash: challenge.challengeHash, itemHash: item.itemHash };
});

const program = Effect.gen(function* () {
  const a = yield* resolveOnce;
  const b = yield* resolveOnce;
  return { a, b };
});

Effect.runPromise(program.pipe(Effect.provide(NodeContext.layer)))
  .then(({ a, b }) => {
    console.log(`configHash:    ${a.configHash}`);
    console.log(`challengeHash: ${a.challengeHash}`);
    console.log(`itemHash:      ${a.itemHash}`);
    for (const [k, v] of Object.entries(a)) {
      if (!HEX12.test(v)) {
        console.error(`FAIL: ${k} '${v}' is not 12-hex`);
        process.exit(1);
      }
    }
    if (a.configHash !== b.configHash || a.challengeHash !== b.challengeHash || a.itemHash !== b.itemHash) {
      console.error("FAIL: hashes differ across re-resolution (non-deterministic)");
      console.error(`  run1: ${JSON.stringify(a)}`);
      console.error(`  run2: ${JSON.stringify(b)}`);
      process.exit(1);
    }
    console.log("determinism: identical on re-resolve");
    console.log("RESOLUTION OK");
    process.exit(0);
  })
  .catch((err) => {
    console.error("FAIL: resolution threw");
    console.error(err);
    process.exit(1);
  });
