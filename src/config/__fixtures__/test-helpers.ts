import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Absolute path into `src/config/__fixtures__/...`. Used by every loader test
 * to keep fixture paths stable regardless of where vitest is invoked from.
 */
const fixturesRoot = path.dirname(fileURLToPath(import.meta.url));

export const fixturePath = (...segments: ReadonlyArray<string>): string =>
  path.join(fixturesRoot, ...segments);
