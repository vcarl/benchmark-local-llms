import { describe, expect, it } from "vitest";
import {
  AdmiralApiError,
  GameCredentialMismatch,
  GameFixtureResetError,
  GameServerError,
} from "./game.js";

describe("GameFixtureResetError", () => {
  it("carries tag and fields", () => {
    const e = new GameFixtureResetError({
      fixture: "starter",
      cause: "HTTP 500",
    });
    expect(e._tag).toBe("GameFixtureResetError");
    expect(e.fixture).toBe("starter");
  });
});

describe("GameCredentialMismatch", () => {
  it("carries tag and fields", () => {
    const e = new GameCredentialMismatch({
      expectedId: "player1",
      availableIds: ["alpha", "beta"],
    });
    expect(e._tag).toBe("GameCredentialMismatch");
    expect(e.expectedId).toBe("player1");
    expect(e.availableIds).toEqual(["alpha", "beta"]);
  });
});

describe("AdmiralApiError", () => {
  it("carries tag, status, and body", () => {
    const e = new AdmiralApiError({
      endpoint: "/api/profiles",
      status: 500,
      body: "internal error",
    });
    expect(e._tag).toBe("AdmiralApiError");
    expect(e.status).toBe(500);
  });
});

describe("GameServerError", () => {
  it("carries tag and scenarioName", () => {
    const e = new GameServerError({
      scenarioName: "bootstrap_grind",
      cause: "port bind failed",
    });
    expect(e._tag).toBe("GameServerError");
    expect(e.scenarioName).toBe("bootstrap_grind");
  });
});
