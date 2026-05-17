#!/usr/bin/env tsx
/**
 * End-to-end sanity test for the LLM response parser against real servers.
 *
 * For every available runtime binary × locally-cached model we find, this
 * spawns the server, sends a fixed prompt ("What is 7+5?"), and asserts
 * that our output extraction produces a standardized, parseable answer —
 * regardless of how the server splits reasoning vs. visible content.
 *
 * The matrix is auto-inferred from what's on disk. We test mlx_lm.server
 * and llama-server by pointing them at cached HF snapshots; ollama is
 * included when its daemon is reachable and has a model loaded. Nothing
 * is downloaded — models that aren't already in the cache are skipped.
 *
 * Run: npm run test:e2e
 */
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { extractOutput } from "../src/llm/chat-completion.js";
import { stripThinkingTags } from "../src/scoring/strip-thinking.js";

const HF_CACHE = join(homedir(), ".cache", "huggingface", "hub");
const PROMPT = "What is 7+5? Respond with just the number.";
const EXPECTED_SUBSTRING = "12";
const MAX_TOKENS = 2048;
const HEALTH_TIMEOUT_MS = 120_000;
const REQUEST_TIMEOUT_MS = 180_000;

// Probe these in order; first hit wins.
const MLX_SERVER_CANDIDATES = [
  process.env["MLX_LM_SERVER_BIN"],
  "mlx_lm.server",
  join(homedir(), "llm-env/bin/mlx_lm.server"),
].filter((p): p is string => !!p);

const LLAMA_SERVER_CANDIDATES = [
  process.env["LLAMA_SERVER_BIN"],
  "llama-server",
  "/opt/homebrew/bin/llama-server",
].filter((p): p is string => !!p);

const MLX_PORT = 18090;
const LLAMACPP_PORT = 18091;
const OLLAMA_PORT = 11434;

// ── Family selection ───────────────────────────────────────────────────────
//
// One entry per family we care about. Picked to hit both reasoning and
// non-reasoning code paths. The script picks the smallest cached artifact
// per family per runtime — params are parsed out of the repo name.

interface Family {
  readonly name: string;
  readonly reasoning: boolean;
  /** Substring match against HF cache dir names (normalized lower). */
  readonly matchers: ReadonlyArray<string>;
}

const FAMILIES: ReadonlyArray<Family> = [
  { name: "deepseek-r1", reasoning: true, matchers: ["deepseek-r1-0528-qwen3"] },
  { name: "qwq", reasoning: true, matchers: ["qwq-32b"] },
  { name: "qwen3", reasoning: true, matchers: ["qwen3-32b", "qwen3-8b"] },
  { name: "magistral", reasoning: true, matchers: ["magistral-small"] },
  { name: "qwen2.5", reasoning: false, matchers: ["qwen2.5-7b", "qwen2.5-32b"] },
  { name: "llama", reasoning: false, matchers: ["meta-llama-3.1-8b", "llama-3.2"] },
  { name: "gemma-4", reasoning: false, matchers: ["gemma-4-e4b"] },
  { name: "phi", reasoning: false, matchers: ["phi-4"] },
];

// ── Types ──────────────────────────────────────────────────────────────────

type Runtime = "mlx" | "llamacpp" | "ollama";

interface CachedModel {
  readonly family: string;
  readonly reasoning: boolean;
  readonly runtime: Runtime;
  /** For mlx: HF repo id. For llamacpp: absolute path to .gguf. For ollama: ollama model name. */
  readonly artifact: string;
  /** Approximate params in billions, parsed from name (0 if unknown). */
  readonly paramsB: number;
  /** Display label for logs. */
  readonly label: string;
}

interface TestResult {
  readonly label: string;
  readonly runtime: Runtime;
  readonly passed: boolean;
  readonly reason?: string;
  readonly elapsedMs: number;
}

// ── Binary detection ───────────────────────────────────────────────────────

const which = (candidates: ReadonlyArray<string>): string | null => {
  for (const c of candidates) {
    // Absolute paths: test file existence. Names on PATH: use `command -v`.
    if (c.startsWith("/") || c.startsWith("~") || c.includes("/")) {
      if (existsSync(c)) return c;
      continue;
    }
    const r = spawnSync("command", ["-v", c], { encoding: "utf8", shell: "/bin/bash" });
    const found = r.stdout.trim();
    if (r.status === 0 && found.length > 0) return found;
  }
  return null;
};

// ── HF cache scanning ──────────────────────────────────────────────────────

// "Qwen2.5-7B" → 7, "gemma-4-e4b" → 4 (the "e4b" effective-4B convention)
const parseParams = (name: string): number => {
  const m = name.match(/(\d+(?:\.\d+)?)\s*[bB](?![a-zA-Z])/);
  if (!m) return 0;
  return Number.parseFloat(m[1] ?? "0");
};

const findGgufs = (repoDir: string): string[] => {
  const snapDir = join(repoDir, "snapshots");
  if (!existsSync(snapDir)) return [];
  const out: string[] = [];
  for (const snap of readdirSync(snapDir)) {
    const dir = join(snapDir, snap);
    if (!statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir)) {
      if (f.endsWith(".gguf")) out.push(join(dir, f));
    }
  }
  // Prefer the smallest gguf (lower-bit quant for quickest load).
  return out.sort((a, b) => statSync(a).size - statSync(b).size);
};

const mlxSnapshotIsComplete = (repoDir: string): boolean => {
  const snapDir = join(repoDir, "snapshots");
  if (!existsSync(snapDir)) return false;
  for (const snap of readdirSync(snapDir)) {
    const dir = join(snapDir, snap);
    if (!statSync(dir).isDirectory()) continue;
    const files = readdirSync(dir);
    // Needs the config + at least one weight shard.
    const hasConfig = files.includes("config.json");
    const hasWeights = files.some((f) => f.endsWith(".safetensors"));
    if (hasConfig && hasWeights) return true;
  }
  return false;
};

const matchFamily = (repoName: string): Family | null => {
  const lower = repoName.toLowerCase();
  for (const fam of FAMILIES) {
    if (fam.matchers.some((m) => lower.includes(m))) return fam;
  }
  return null;
};

const scanCache = (): CachedModel[] => {
  if (!existsSync(HF_CACHE)) return [];
  const out: CachedModel[] = [];
  for (const entry of readdirSync(HF_CACHE)) {
    if (!entry.startsWith("models--")) continue;
    const repoPath = join(HF_CACHE, entry);
    // "models--org--repo" → "org/repo"
    const repoId = entry.slice("models--".length).replace(/--/g, "/");
    const fam = matchFamily(repoId);
    if (!fam) continue;
    const paramsB = parseParams(repoId);

    // MLX: repos under mlx-community/* (or lmstudio-community/*-MLX-*) with
    // complete safetensors snapshots.
    const isMlxRepo =
      repoId.startsWith("mlx-community/") || /\bmlx\b/i.test(repoId) || /-4bit$/i.test(repoId);
    if (isMlxRepo && mlxSnapshotIsComplete(repoPath)) {
      out.push({
        family: fam.name,
        reasoning: fam.reasoning,
        runtime: "mlx",
        artifact: repoId,
        paramsB,
        label: `${fam.name} ${paramsB || "?"}B [mlx]`,
      });
    }

    // llamacpp: GGUF snapshots (any org).
    const ggufs = findGgufs(repoPath);
    if (ggufs.length > 0) {
      const firstGguf = ggufs[0];
      if (firstGguf === undefined) continue;
      out.push({
        family: fam.name,
        reasoning: fam.reasoning,
        runtime: "llamacpp",
        artifact: firstGguf,
        paramsB,
        label: `${fam.name} ${paramsB || "?"}B [llamacpp]`,
      });
    }
  }
  return out;
};

// Pick the smallest cached entry per (family, runtime) pair.
const pickMatrix = (models: CachedModel[]): CachedModel[] => {
  const best = new Map<string, CachedModel>();
  for (const m of models) {
    const key = `${m.family}::${m.runtime}`;
    const prev = best.get(key);
    if (prev === undefined) {
      best.set(key, m);
      continue;
    }
    // Lower paramsB wins; unknown (0) loses to known.
    const prevEff = prev.paramsB === 0 ? Number.POSITIVE_INFINITY : prev.paramsB;
    const curEff = m.paramsB === 0 ? Number.POSITIVE_INFINITY : m.paramsB;
    if (curEff < prevEff) best.set(key, m);
  }
  return [...best.values()];
};

// ── Server lifecycle ───────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const waitForHealth = async (url: string, deadlineMs: number): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < deadlineMs) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.status === 200) return true;
    } catch {
      // retry
    }
    await sleep(1000);
  }
  return false;
};

const killChild = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null || child.killed) return;
  child.kill("SIGTERM");
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) return;
    await sleep(200);
  }
  child.kill("SIGKILL");
  await sleep(500);
};

const activeChildren = new Set<ChildProcess>();

const spawnServer = (
  bin: string,
  args: ReadonlyArray<string>,
  label: string,
): ChildProcess => {
  const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
  activeChildren.add(child);
  child.on("exit", () => activeChildren.delete(child));
  // Capture output silently; surface only on failure (kept on disk for debug).
  child.stderr?.on("data", () => {});
  child.stdout?.on("data", () => {});
  child.on("error", (err) => {
    process.stderr.write(`[${label}] spawn error: ${err.message}\n`);
  });
  return child;
};

process.on("SIGINT", () => {
  for (const c of activeChildren) c.kill("SIGKILL");
  process.exit(130);
});

// ── Probe + assert ─────────────────────────────────────────────────────────

interface RawMessage {
  readonly role?: string;
  readonly content?: string | null;
  readonly reasoning_content?: string | null;
  readonly reasoning?: string | null;
}
interface RawResponse {
  readonly choices: ReadonlyArray<{ readonly message: RawMessage }>;
  readonly usage?: { readonly completion_tokens?: number; readonly prompt_tokens?: number };
}

const probeAndAssert = async (
  baseUrl: string,
  modelName: string,
  label: string,
): Promise<{ passed: boolean; reason?: string }> => {
  const body = {
    model: modelName,
    messages: [{ role: "user", content: PROMPT }],
    temperature: 0.1,
    max_tokens: MAX_TOKENS,
    stream: false,
  };

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    return { passed: false, reason: `request failed: ${(e as Error).message}` };
  }

  if (res.status !== 200) {
    return { passed: false, reason: `HTTP ${res.status}` };
  }

  let json: RawResponse;
  try {
    json = (await res.json()) as RawResponse;
  } catch (e) {
    return { passed: false, reason: `JSON parse failed: ${(e as Error).message}` };
  }

  const completionTokens = json.usage?.completion_tokens ?? 0;
  if (completionTokens <= 0) {
    return { passed: false, reason: `completion_tokens=${completionTokens} (expected > 0)` };
  }

  const output = extractOutput(json.choices);
  if (output.length === 0) {
    return {
      passed: false,
      reason: `extractOutput returned empty; keys=${Object.keys(json.choices[0]?.message ?? {}).join(",")}`,
    };
  }

  const stripped = stripThinkingTags(output);
  if (stripped.length === 0) {
    return { passed: false, reason: "stripThinkingTags yielded empty string" };
  }
  if (!stripped.includes(EXPECTED_SUBSTRING)) {
    const preview = stripped.slice(0, 80).replace(/\n/g, "\\n");
    return {
      passed: false,
      reason: `stripped output missing "${EXPECTED_SUBSTRING}": "${preview}"`,
    };
  }

  process.stdout.write(
    `  ✓ ${label}: tokens=${completionTokens}, output=${JSON.stringify(stripped.slice(0, 40))}\n`,
  );
  return { passed: true };
};

// ── Cell runners ───────────────────────────────────────────────────────────

const runMlxCell = async (
  bin: string,
  model: CachedModel,
  reasoningFormat?: "deepseek" | "none",
): Promise<TestResult> => {
  const suffix = reasoningFormat ? ` (--reasoning-format ${reasoningFormat})` : "";
  const label = `${model.label}${suffix}`;
  const start = Date.now();
  // mlx_lm.server has no reasoning-format flag; we ignore `reasoningFormat`.
  const child = spawnServer(
    bin,
    ["--model", model.artifact, "--host", "127.0.0.1", "--port", String(MLX_PORT)],
    label,
  );
  try {
    const healthy = await waitForHealth(
      `http://127.0.0.1:${MLX_PORT}/v1/models`,
      HEALTH_TIMEOUT_MS,
    );
    if (!healthy) return { label, runtime: "mlx", passed: false, reason: "health timeout", elapsedMs: Date.now() - start };
    const out = await probeAndAssert(`http://127.0.0.1:${MLX_PORT}`, model.artifact, label);
    return { label, runtime: "mlx", ...out, elapsedMs: Date.now() - start };
  } finally {
    await killChild(child);
  }
};

const runLlamacppCell = async (
  bin: string,
  model: CachedModel,
  reasoningFormat: "deepseek" | "none",
): Promise<TestResult> => {
  const label = `${model.label} (--reasoning-format ${reasoningFormat})`;
  const start = Date.now();
  const child = spawnServer(
    bin,
    [
      "-m", model.artifact,
      "--host", "127.0.0.1",
      "--port", String(LLAMACPP_PORT),
      "-c", "4096",
      "--cache-type-k", "q8_0",
      "--cache-type-v", "q8_0",
      "--reasoning-format", reasoningFormat,
    ],
    label,
  );
  try {
    const healthy = await waitForHealth(
      `http://127.0.0.1:${LLAMACPP_PORT}/health`,
      HEALTH_TIMEOUT_MS,
    );
    if (!healthy) return { label, runtime: "llamacpp", passed: false, reason: "health timeout", elapsedMs: Date.now() - start };
    const out = await probeAndAssert(`http://127.0.0.1:${LLAMACPP_PORT}`, model.family, label);
    return { label, runtime: "llamacpp", ...out, elapsedMs: Date.now() - start };
  } finally {
    await killChild(child);
  }
};

const runOllamaCell = async (modelName: string): Promise<TestResult> => {
  const label = `${modelName} [ollama]`;
  const start = Date.now();
  // Ollama auto-loads on first request; no spawn needed.
  const out = await probeAndAssert(`http://127.0.0.1:${OLLAMA_PORT}`, modelName, label);
  return { label, runtime: "ollama", ...out, elapsedMs: Date.now() - start };
};

const detectOllamaModel = (): string | null => {
  const r = spawnSync("ollama", ["list"], { encoding: "utf8" });
  if (r.status !== 0) return null;
  // Skip header line; pick smallest first column by the SIZE column.
  const lines = r.stdout.split("\n").slice(1).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return null;
  const parsed = lines
    .map((l) => {
      const parts = l.trim().split(/\s+/);
      // Columns: NAME ID SIZE UNIT MODIFIED...
      const name = parts[0];
      const sizeNum = Number.parseFloat(parts[2] ?? "0");
      const unit = (parts[3] ?? "").toUpperCase();
      const gb = unit.startsWith("G") ? sizeNum : unit.startsWith("M") ? sizeNum / 1024 : sizeNum;
      return { name, gb };
    })
    .filter((x): x is { name: string; gb: number } => !!x.name)
    .sort((a, b) => a.gb - b.gb);
  const smallest = parsed[0];
  // Skip anything > 20GB; that's not a quick-startup test.
  if (!smallest || smallest.gb > 20) return null;
  return smallest.name;
};

// ── Main ───────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  process.stdout.write("e2e-llm-parse — probing real LLM servers\n\n");

  const mlxBin = which(MLX_SERVER_CANDIDATES);
  const llamaBin = which(LLAMA_SERVER_CANDIDATES);
  const ollamaReachable = await (async () => {
    try {
      const r = await fetch(`http://127.0.0.1:${OLLAMA_PORT}/api/tags`, {
        signal: AbortSignal.timeout(1000),
      });
      return r.status === 200;
    } catch {
      return false;
    }
  })();

  process.stdout.write(`  mlx_lm.server: ${mlxBin ?? "(not found)"}\n`);
  process.stdout.write(`  llama-server:  ${llamaBin ?? "(not found)"}\n`);
  process.stdout.write(`  ollama daemon: ${ollamaReachable ? "reachable" : "(not reachable)"}\n\n`);

  const cached = scanCache();
  const matrix = pickMatrix(cached);
  process.stdout.write(`  HF cache: ${cached.length} matching snapshots, ${matrix.length} after dedup\n\n`);

  const cells: Array<() => Promise<TestResult>> = [];

  // Pick one reasoning + one non-reasoning per runtime, to keep this "tiny".
  const pick = (runtime: Runtime, reasoning: boolean): CachedModel | undefined =>
    matrix.find((m) => m.runtime === runtime && m.reasoning === reasoning);

  if (mlxBin) {
    const r = pick("mlx", true);
    const nr = pick("mlx", false);
    if (r) cells.push(() => runMlxCell(mlxBin, r));
    if (nr) cells.push(() => runMlxCell(mlxBin, nr));
  }
  if (llamaBin) {
    const r = pick("llamacpp", true);
    const nr = pick("llamacpp", false);
    if (r) {
      cells.push(() => runLlamacppCell(llamaBin, r, "none"));
      cells.push(() => runLlamacppCell(llamaBin, r, "deepseek"));
    }
    if (nr) cells.push(() => runLlamacppCell(llamaBin, nr, "none"));
  }
  if (ollamaReachable) {
    const m = detectOllamaModel();
    if (m) cells.push(() => runOllamaCell(m));
  }

  if (cells.length === 0) {
    process.stderr.write("no test cells — no runtimes+models found\n");
    process.exit(2);
  }

  const results: TestResult[] = [];
  for (const run of cells) {
    const r = await run();
    results.push(r);
    const mark = r.passed ? "PASS" : "FAIL";
    const secs = (r.elapsedMs / 1000).toFixed(1);
    process.stdout.write(`  ${mark} ${r.label} (${secs}s)${r.reason ? ` — ${r.reason}` : ""}\n`);
  }

  const failed = results.filter((r) => !r.passed);
  process.stdout.write(`\n${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length === 0 ? 0 : 1);
};

main().catch((e) => {
  process.stderr.write(`fatal: ${(e as Error).stack ?? String(e)}\n`);
  for (const c of activeChildren) c.kill("SIGKILL");
  process.exit(2);
});
