import { Effect } from "effect";
import * as YAML from "yaml";
import { YamlParseError } from "../errors/config.js";

/**
 * Parse a YAML document string into an unknown JS value, wrapping any parser
 * failure in a typed {@link YamlParseError}. This is the single boundary
 * where raw YAML crosses into the typed world.
 *
 * The `yaml` package reports parser errors synchronously by throwing; we
 * capture them via `Effect.try` (the one allowed use of `try` semantics per
 * the lint rules — `Effect.try` wraps a callback, no statement-level
 * `try/catch`).
 */
export const parseYaml = (
  filePath: string,
  source: string,
): Effect.Effect<unknown, YamlParseError> =>
  Effect.try({
    try: () => YAML.parse(source) as unknown,
    catch: (e) =>
      new YamlParseError({
        filePath,
        cause: e instanceof Error ? e.message : String(e),
      }),
  });
