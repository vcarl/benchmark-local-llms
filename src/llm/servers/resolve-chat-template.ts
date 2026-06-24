/**
 * Resolve a vendored chat-template name to an absolute `.jinja` path.
 *
 * Official `mistralai/*-GGUF` artifacts ship without an embedded chat
 * template; llama-server's built-in mistral templates then render a
 * near-empty prompt. Configs opt in via `chatTemplate: <name>`, which is
 * resolved here to `<repo-root>/templates/<name>.jinja` and passed to
 * llama-server as `--jinja --chat-template-file <path>`.
 *
 * The repo root is derived from this module's location (`src/llm/servers`),
 * so resolution is independent of the process cwd. Fails loudly with a
 * `ServerSpawnError` if the named template file does not exist.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { ServerSpawnError } from "../../errors/index.js";

// src/llm/servers/resolve-chat-template.ts -> repo root is three levels up.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export const resolveChatTemplate = (name: string): Effect.Effect<string, ServerSpawnError> =>
  Effect.suspend(() => {
    const templatePath = path.join(repoRoot, "templates", `${name}.jinja`);
    return existsSync(templatePath)
      ? Effect.succeed(templatePath)
      : Effect.fail(
          new ServerSpawnError({
            runtime: "llamacpp",
            reason: `No vendored chat template '${name}' at ${templatePath}. Add templates/${name}.jinja or fix the config's chatTemplate field.`,
          }),
        );
  });
