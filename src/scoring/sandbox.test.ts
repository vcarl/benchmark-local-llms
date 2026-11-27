import { describe, expect, it } from "vitest";
import { SANDBOX_IMAGE, sandboxArgs } from "./sandbox.js";

describe("sandboxArgs", () => {
  const argv = sandboxArgs(
    "n1",
    2.5,
    ["python3", "-"],
    [{ host: "/h/s.py", container: "/c/s.py" }],
  );
  const joined = argv.join(" ");

  it("pins the image by digest", () => {
    expect(SANDBOX_IMAGE).toMatch(/^python@sha256:[0-9a-f]{64}$/);
    expect(argv).toContain(SANDBOX_IMAGE);
  });

  it("applies every isolation flag before the image", () => {
    const flags = argv.slice(0, argv.indexOf(SANDBOX_IMAGE)).join(" ");
    for (const f of [
      "--rm",
      "--name n1",
      "--network none",
      "--read-only",
      "--tmpfs /tmp:rw,size=16m",
      "--memory 256m",
      "--memory-swap 256m",
      "--cpus 1",
      "--pids-limit 64",
      "--cap-drop ALL",
      "--security-opt no-new-privileges",
      "--user 65534:65534",
      "-v /h/s.py:/c/s.py:ro",
    ])
      expect(flags).toContain(f);
  });

  it("wraps the command in an in-container timeout", () => {
    expect(joined).toMatch(/exec timeout -k 1 "\$0" "\$@" 2\.5 python3 -$/);
  });
});
