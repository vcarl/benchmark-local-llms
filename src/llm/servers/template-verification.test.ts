import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { FetchHttpClient } from "@effect/platform";
import { Effect, LogLevel } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { captureLogs } from "../../cli/__tests__/log-capture.js";
import { verifyTemplate } from "./template-verification.js";

// ── llamacpp HTTP fixture ────────────────────────────────────────────────────

interface TemplateServer {
  port: number;
  close: () => Promise<void>;
}

interface FakeBehaviour {
  /** Body returned for GET /props. */
  readonly props: unknown;
  /** Body returned for POST /apply-template. */
  readonly applyTemplate: unknown;
}

/**
 * A minimal stand-in for llama-server exposing /props and /apply-template.
 * The supervisor's verifier only reads `chat_template` and `.prompt`, so the
 * fixture returns whatever those fields are configured to be.
 */
const startTemplateServer = (b: FakeBehaviour): Promise<TemplateServer> =>
  new Promise((resolve) => {
    const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const send = (status: number, body: unknown) => {
        res.statusCode = status;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(body));
      };
      if (req.method === "GET" && req.url === "/props") {
        send(200, b.props);
        return;
      }
      if (req.method === "POST" && req.url === "/apply-template") {
        // Drain the request body, then respond.
        req.on("data", () => {});
        req.on("end", () => send(200, b.applyTemplate));
        return;
      }
      send(404, { error: "not found" });
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        port,
        close: () =>
          new Promise<void>((r) => {
            server.close(() => r());
          }),
      });
    });
  });

const SENTINEL = "PROBE_TEMPLATE_CHECK_XYZZY";

const runVerify = (effect: Effect.Effect<void, unknown, never>) =>
  Effect.runPromiseExit(effect.pipe(Effect.provide(FetchHttpClient.layer)));

describe("verifyTemplate — llamacpp", () => {
  let ts: TemplateServer | null = null;

  afterEach(async () => {
    if (ts) {
      await ts.close();
      ts = null;
    }
  });

  it("passes when /props has a template AND /apply-template renders cleanly", async () => {
    ts = await startTemplateServer({
      props: { chat_template: "<|im_start|>{{ messages }}<|im_end|>" },
      applyTemplate: {
        prompt: `<|im_start|>system\nYou are a helpful assistant.\n<|im_start|>user\n${SENTINEL}<|im_end|>`,
      },
    });

    const exit = await runVerify(
      verifyTemplate({ runtime: "llamacpp", port: ts.port }) as Effect.Effect<void, unknown, never>,
    );
    expect(exit._tag).toBe("Success");
  });

  it("fails when chat_template is empty (ChatML fallback)", async () => {
    ts = await startTemplateServer({
      props: { chat_template: "" },
      applyTemplate: { prompt: `rendered ${SENTINEL}` },
    });

    const exit = await runVerify(
      verifyTemplate({ runtime: "llamacpp", port: ts.port }) as Effect.Effect<void, unknown, never>,
    );
    expect(exit._tag).toBe("Failure");
    expect(JSON.stringify(exit)).toContain("TemplateVerificationError");
    expect(JSON.stringify(exit)).toContain("chat_template");
  });

  it("fails when chat_template is missing entirely from /props", async () => {
    ts = await startTemplateServer({
      props: { some_other_field: 1 },
      applyTemplate: { prompt: `rendered ${SENTINEL}` },
    });

    const exit = await runVerify(
      verifyTemplate({ runtime: "llamacpp", port: ts.port }) as Effect.Effect<void, unknown, never>,
    );
    expect(exit._tag).toBe("Failure");
    expect(JSON.stringify(exit)).toContain("TemplateVerificationError");
  });

  it("fails when the rendered prompt contains unrendered Jinja ({{ )", async () => {
    ts = await startTemplateServer({
      props: { chat_template: "{{ broken" },
      applyTemplate: { prompt: `<|im_start|>user {{ messages[0].content }} ${SENTINEL}` },
    });

    const exit = await runVerify(
      verifyTemplate({ runtime: "llamacpp", port: ts.port }) as Effect.Effect<void, unknown, never>,
    );
    expect(exit._tag).toBe("Failure");
    expect(JSON.stringify(exit)).toContain("TemplateVerificationError");
    expect(JSON.stringify(exit)).toContain("Jinja");
  });

  it("fails when the rendered prompt contains an unrendered Jinja statement ({% )", async () => {
    ts = await startTemplateServer({
      props: { chat_template: "ok" },
      applyTemplate: { prompt: `{% for m in messages %} ${SENTINEL}` },
    });

    const exit = await runVerify(
      verifyTemplate({ runtime: "llamacpp", port: ts.port }) as Effect.Effect<void, unknown, never>,
    );
    expect(exit._tag).toBe("Failure");
    expect(JSON.stringify(exit)).toContain("TemplateVerificationError");
  });

  it("fails when the probe sentinel is missing from the rendered prompt", async () => {
    ts = await startTemplateServer({
      props: { chat_template: "ok" },
      applyTemplate: { prompt: "<|im_start|>user lost the content<|im_end|>" },
    });

    const exit = await runVerify(
      verifyTemplate({ runtime: "llamacpp", port: ts.port }) as Effect.Effect<void, unknown, never>,
    );
    expect(exit._tag).toBe("Failure");
    expect(JSON.stringify(exit)).toContain("TemplateVerificationError");
    expect(JSON.stringify(exit)).toContain(SENTINEL);
  });

  it("does NOT require a separate system slot (Gemma/Mistral merge it)", async () => {
    // The probe user content survives and no Jinja leaks; system merged into
    // the first turn. This must PASS.
    ts = await startTemplateServer({
      props: { chat_template: "[INST]...[/INST]" },
      applyTemplate: {
        prompt: `[INST] You are a helpful assistant.\n\n${SENTINEL}[/INST]`,
      },
    });

    const exit = await runVerify(
      verifyTemplate({ runtime: "llamacpp", port: ts.port }) as Effect.Effect<void, unknown, never>,
    );
    expect(exit._tag).toBe("Success");
  });

  it("fails with TemplateVerificationError when /props is unreachable", async () => {
    // Port 1 is never bound — the GET should error and map to a typed failure,
    // not crash the process.
    const exit = await runVerify(
      verifyTemplate({ runtime: "llamacpp", port: 1 }) as Effect.Effect<void, unknown, never>,
    );
    expect(exit._tag).toBe("Failure");
    expect(JSON.stringify(exit)).toContain("TemplateVerificationError");
  });
});

// ── mlx offline fixture ──────────────────────────────────────────────────────

describe("verifyTemplate — mlx", () => {
  const tmpDirs: string[] = [];

  const makeModelDir = (): string => {
    const dir = mkdtempSync(path.join(tmpdir(), "mlx-tpl-"));
    tmpDirs.push(dir);
    return dir;
  };

  afterEach(() => {
    while (tmpDirs.length > 0) {
      const d = tmpDirs.pop();
      if (d) rmSync(d, { recursive: true, force: true });
    }
  });

  it("passes when tokenizer_config.json has a non-empty chat_template", async () => {
    const dir = makeModelDir();
    writeFileSync(
      path.join(dir, "tokenizer_config.json"),
      JSON.stringify({ chat_template: "{% for m in messages %}...{% endfor %}" }),
    );

    const exit = await runVerify(
      verifyTemplate({ runtime: "mlx", modelDir: dir }) as Effect.Effect<void, unknown, never>,
    );
    expect(exit._tag).toBe("Success");
  });

  it("passes when a sibling chat_template.jinja exists and is non-empty", async () => {
    const dir = makeModelDir();
    writeFileSync(path.join(dir, "tokenizer_config.json"), JSON.stringify({ model_max_length: 1 }));
    writeFileSync(path.join(dir, "chat_template.jinja"), "{% for m in messages %}...{% endfor %}");

    const exit = await runVerify(
      verifyTemplate({ runtime: "mlx", modelDir: dir }) as Effect.Effect<void, unknown, never>,
    );
    expect(exit._tag).toBe("Success");
  });

  it("fails when tokenizer_config.json has no template and no sibling .jinja", async () => {
    const dir = makeModelDir();
    writeFileSync(
      path.join(dir, "tokenizer_config.json"),
      JSON.stringify({ model_max_length: 4096 }),
    );

    const exit = await runVerify(
      verifyTemplate({ runtime: "mlx", modelDir: dir }) as Effect.Effect<void, unknown, never>,
    );
    expect(exit._tag).toBe("Failure");
    expect(JSON.stringify(exit)).toContain("TemplateVerificationError");
  });

  it("fails when chat_template is present but empty", async () => {
    const dir = makeModelDir();
    writeFileSync(path.join(dir, "tokenizer_config.json"), JSON.stringify({ chat_template: "" }));

    const exit = await runVerify(
      verifyTemplate({ runtime: "mlx", modelDir: dir }) as Effect.Effect<void, unknown, never>,
    );
    expect(exit._tag).toBe("Failure");
    expect(JSON.stringify(exit)).toContain("TemplateVerificationError");
  });

  it("warns and skips (does NOT throw) when modelDir is undefined", async () => {
    const sink: string[] = [];
    const exit = await Effect.runPromiseExit(
      verifyTemplate({ runtime: "mlx" }).pipe(
        Effect.provide(FetchHttpClient.layer),
        Effect.provide(captureLogs(sink, LogLevel.Warning)),
      ),
    );
    expect(exit._tag).toBe("Success");
    expect(sink.some((l) => l.toLowerCase().includes("skip"))).toBe(true);
  });

  it("warns and skips when the model directory does not exist on disk", async () => {
    const sink: string[] = [];
    const exit = await Effect.runPromiseExit(
      verifyTemplate({ runtime: "mlx", modelDir: "/nonexistent/path/xyz" }).pipe(
        Effect.provide(FetchHttpClient.layer),
        Effect.provide(captureLogs(sink, LogLevel.Warning)),
      ),
    );
    expect(exit._tag).toBe("Success");
    expect(sink.some((l) => l.toLowerCase().includes("skip"))).toBe(true);
  });

  it("warns and skips when tokenizer_config.json is absent but the dir exists", async () => {
    const dir = makeModelDir();
    const sink: string[] = [];
    const exit = await Effect.runPromiseExit(
      verifyTemplate({ runtime: "mlx", modelDir: dir }).pipe(
        Effect.provide(FetchHttpClient.layer),
        Effect.provide(captureLogs(sink, LogLevel.Warning)),
      ),
    );
    // No tokenizer_config.json and no sibling .jinja — path is not locatable,
    // so per the documented asymmetry we warn-and-skip rather than hard-fail.
    expect(exit._tag).toBe("Success");
    expect(sink.some((l) => l.toLowerCase().includes("skip"))).toBe(true);
  });
});
