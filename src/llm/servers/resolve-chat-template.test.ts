import path from "node:path";
import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";
import { ServerSpawnError } from "../../errors/index.js";
import { resolveChatTemplate } from "./resolve-chat-template.js";

describe("resolveChatTemplate", () => {
  it("resolves a known template name to an absolute path under templates/", async () => {
    const result = await Effect.runPromise(resolveChatTemplate("mistral-v7-tekken"));
    expect(path.isAbsolute(result)).toBe(true);
    expect(result.endsWith(path.join("templates", "mistral-v7-tekken.jinja"))).toBe(true);
  });

  it("fails with ServerSpawnError on an unknown template name", async () => {
    const exit = await Effect.runPromiseExit(resolveChatTemplate("does-not-exist"));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const err = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
      expect(err).toBeInstanceOf(ServerSpawnError);
      expect((err as ServerSpawnError).reason).toContain("does-not-exist");
    }
  });
});
