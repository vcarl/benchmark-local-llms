import { Data, type ParseResult } from "effect";

/**
 * YAML / config-loading errors from requirements §3.1. All of these are raised
 * at load time (before any prompts execute) — the Python prototype deferred
 * several of these to score time, which this rewrite explicitly fixes (§3.2).
 */

/** Generic config-file violation. `path` is the offending file. */
export class ConfigError extends Data.TaggedError("ConfigError")<{
  readonly path: string;
  readonly message: string;
}> {}

/** The YAML parser rejected a file. `cause` is the upstream parser message. */
export class YamlParseError extends Data.TaggedError("YamlParseError")<{
  readonly filePath: string;
  readonly cause: string;
}> {}

/**
 * A parsed YAML value failed `@effect/schema` decoding. The upstream
 * `ParseResult.ParseError` is carried so the caller can format a precise
 * location within the document.
 */
export class SchemaDecodeError extends Data.TaggedError("SchemaDecodeError")<{
  readonly typeName: string;
  readonly cause: ParseResult.ParseError;
}> {}

/**
 * A prompt YAML referenced a system-prompt key that isn't in
 * `prompts/system-prompts.yaml`. Fails at load time per §3.2 — the Python
 * prototype silently used the key itself as the literal system prompt.
 */
export class UnknownSystemPrompt extends Data.TaggedError("UnknownSystemPrompt")<{
  readonly key: string;
  readonly availableKeys: readonly string[];
}> {}

/**
 * A constraint YAML specified a `check` value that isn't in the ConstraintCheck
 * literal set. Structurally this is caught by SchemaDecodeError on the
 * `ConstraintDef` union; surfaced as its own tag so the loader can produce a
 * friendlier error message.
 */
export class UnknownConstraintCheck extends Data.TaggedError("UnknownConstraintCheck")<{
  readonly check: string;
}> {}
