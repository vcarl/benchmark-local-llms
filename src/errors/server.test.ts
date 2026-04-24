import { describe, expect, it } from "vitest";
import { HealthCheckTimeout, PortConflict, ServerSpawnError } from "./server.js";

describe("ServerSpawnError", () => {
  it("carries tag and fields", () => {
    const e = new ServerSpawnError({
      runtime: "llamacpp",
      reason: "binary not found",
      logTail: "exec: llama-server: not found",
    });
    expect(e._tag).toBe("ServerSpawnError");
    expect(e.runtime).toBe("llamacpp");
    expect(e.reason).toBe("binary not found");
    expect(e.logTail).toBe("exec: llama-server: not found");
  });

  it("allows logTail to be omitted", () => {
    const e = new ServerSpawnError({ runtime: "mlx", reason: "exit 1" });
    expect(e.logTail).toBeUndefined();
  });

  it("is an Error subclass", () => {
    const e = new ServerSpawnError({ runtime: "mlx", reason: "x" });
    expect(e).toBeInstanceOf(Error);
  });
});

describe("HealthCheckTimeout", () => {
  it("carries tag and fields", () => {
    const e = new HealthCheckTimeout({
      url: "http://127.0.0.1:18080/health",
      timeoutSec: 300,
    });
    expect(e._tag).toBe("HealthCheckTimeout");
    expect(e.url).toBe("http://127.0.0.1:18080/health");
    expect(e.timeoutSec).toBe(300);
  });
});

describe("PortConflict", () => {
  it("carries tag and port", () => {
    const e = new PortConflict({ port: 18080 });
    expect(e._tag).toBe("PortConflict");
    expect(e.port).toBe(18080);
  });
});
