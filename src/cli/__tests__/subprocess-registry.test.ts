import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __testing,
  deregisterSubprocess,
  installSubprocessSafetyNet,
  registerSubprocess,
} from "../subprocess-registry.js";

describe("subprocess-registry", () => {
  beforeEach(() => {
    __testing.reset();
  });
  afterEach(() => {
    __testing.reset();
  });

  it("registers and deregisters PIDs", () => {
    registerSubprocess(100);
    registerSubprocess(200);
    expect(__testing.trackedPids()).toEqual(new Set([100, 200]));
    deregisterSubprocess(100);
    expect(__testing.trackedPids()).toEqual(new Set([200]));
  });

  it("deregister is a no-op for an untracked PID", () => {
    registerSubprocess(42);
    deregisterSubprocess(999);
    expect(__testing.trackedPids()).toEqual(new Set([42]));
  });

  it("register deduplicates the same PID", () => {
    registerSubprocess(42);
    registerSubprocess(42);
    expect(__testing.trackedPids().size).toBe(1);
  });

  it("installSubprocessSafetyNet is idempotent — handlers added once", () => {
    const before = {
      sighup: process.listenerCount("SIGHUP"),
      uncaught: process.listenerCount("uncaughtException"),
      exit: process.listenerCount("exit"),
    };
    installSubprocessSafetyNet();
    installSubprocessSafetyNet();
    installSubprocessSafetyNet();
    const after = {
      sighup: process.listenerCount("SIGHUP"),
      uncaught: process.listenerCount("uncaughtException"),
      exit: process.listenerCount("exit"),
    };
    expect(after.sighup - before.sighup).toBe(1);
    expect(after.uncaught - before.uncaught).toBe(1);
    expect(after.exit - before.exit).toBe(1);

    // Clean up the listeners this test installed so the Node process at
    // vitest shutdown doesn't try to kill fake PIDs.
    const sighupListeners = process.listeners("SIGHUP");
    const lastSighup = sighupListeners[sighupListeners.length - 1];
    if (lastSighup !== undefined) process.removeListener("SIGHUP", lastSighup);

    const uncaughtListeners = process.listeners("uncaughtException");
    const lastUncaught = uncaughtListeners[uncaughtListeners.length - 1];
    if (lastUncaught !== undefined) process.removeListener("uncaughtException", lastUncaught);

    const exitListeners = process.listeners("exit");
    const lastExit = exitListeners[exitListeners.length - 1];
    if (lastExit !== undefined) process.removeListener("exit", lastExit);
  });
});
