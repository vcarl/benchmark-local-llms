/**
 * Profile lifecycle tests. We mock {@link AdmiralClient} as a record of
 * Effect-returning functions; the tests verify that the Scope's release
 * path always calls disconnect + delete in the right order, even when the
 * acquire path fails partway through.
 */
import { Effect, Exit, Ref } from "effect";
import { describe, expect, it } from "vitest";
import { AdmiralApiError } from "../../errors/index.js";
import type { AdmiralClient } from "./client.js";
import { acquireProfile } from "./profile.js";

interface CallLog {
  readonly events: ReadonlyArray<string>;
}

const makeMockClient = (overrides: {
  configureFails?: boolean;
  createFails?: boolean;
  connectFails?: boolean;
  deleteFails?: boolean;
  disconnectFails?: boolean;
}): Effect.Effect<{ client: AdmiralClient; log: Ref.Ref<CallLog> }> =>
  Effect.gen(function* () {
    const log = yield* Ref.make<CallLog>({ events: [] });
    const append = (s: string) => Ref.update(log, (l) => ({ events: [...l.events, s] }));
    const apiErr = (endpoint: string) =>
      new AdmiralApiError({ endpoint, status: 500, body: "boom" });
    const client: AdmiralClient = {
      configureProvider: () =>
        overrides.configureFails
          ? Effect.zipRight(append("configure-fail"), Effect.fail(apiErr("/api/providers")))
          : append("configure"),
      createProfile: () =>
        overrides.createFails
          ? Effect.zipRight(append("create-fail"), Effect.fail(apiErr("/api/profiles")))
          : Effect.zipRight(append("create"), Effect.succeed("p-1")),
      connectProfile: () =>
        overrides.connectFails
          ? Effect.zipRight(
              append("connect-fail"),
              Effect.fail(apiErr("/api/profiles/p-1/connect")),
            )
          : append("connect"),
      disconnectProfile: () =>
        overrides.disconnectFails
          ? Effect.zipRight(
              append("disconnect-fail"),
              Effect.fail(apiErr("/api/profiles/p-1/connect")),
            )
          : append("disconnect"),
      deleteProfile: () =>
        overrides.deleteFails
          ? Effect.zipRight(append("delete-fail"), Effect.fail(apiErr("/api/profiles/p-1")))
          : append("delete"),
    };
    return { client, log };
  });

const baseConfig = {
  provider: { id: "custom", baseUrl: "http://llm", apiKey: "local" },
  profile: {
    provider: "custom",
    name: "bench-1",
    username: "u",
    password: "p",
    model: "m",
    serverUrl: "http://gs",
    directive: "do thing",
    connectionMode: "http_v2",
  },
};

const runScoped = <A, E>(
  effect: Effect.Effect<A, E, import("effect/Scope").Scope>,
): Promise<Exit.Exit<A, E>> => Effect.runPromiseExit(Effect.scoped(effect));

describe("acquireProfile", () => {
  it("happy path runs configure → create → connect, then disconnect → delete on close", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const { client, log } = yield* makeMockClient({});
        yield* Effect.scoped(
          Effect.gen(function* () {
            const handle = yield* acquireProfile(client, baseConfig);
            expect(handle.profileId).toBe("p-1");
          }),
        );
        return yield* Ref.get(log);
      }),
    );
    expect(result.events).toEqual(["configure", "create", "connect", "disconnect", "delete"]);
  });

  it("calls delete (but NOT disconnect) when connect fails after create succeeds", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const { client, log } = yield* makeMockClient({ connectFails: true });
        const exit = yield* Effect.exit(Effect.scoped(acquireProfile(client, baseConfig)));
        expect(Exit.isFailure(exit)).toBe(true);
        return yield* Ref.get(log);
      }),
    );
    expect(result.events).toEqual([
      "configure",
      "create",
      "connect-fail",
      // disconnect was never registered (connect failed before that finalizer)
      "delete",
    ]);
  });

  it("does not register any finalizer when create fails", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const { client, log } = yield* makeMockClient({ createFails: true });
        const exit = yield* Effect.exit(Effect.scoped(acquireProfile(client, baseConfig)));
        expect(Exit.isFailure(exit)).toBe(true);
        return yield* Ref.get(log);
      }),
    );
    expect(result.events).toEqual(["configure", "create-fail"]);
  });

  it("does not register any finalizer when configure fails", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const { client, log } = yield* makeMockClient({ configureFails: true });
        const exit = yield* Effect.exit(Effect.scoped(acquireProfile(client, baseConfig)));
        expect(Exit.isFailure(exit)).toBe(true);
        return yield* Ref.get(log);
      }),
    );
    expect(result.events).toEqual(["configure-fail"]);
  });

  it("teardown failures are swallowed (logged, not surfaced)", async () => {
    const exit = await runScoped(
      Effect.gen(function* () {
        const { client } = yield* makeMockClient({
          disconnectFails: true,
          deleteFails: true,
        });
        return yield* acquireProfile(client, baseConfig);
      }),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
  });
});
