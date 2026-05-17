import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ScenarioWebappRecord, WebappRecord } from "./webapp-contract.js";
import { eventFileName, writeEventFiles } from "./write-events.js";

describe("eventFileName", () => {
  it("joins archive id and prompt name with double underscore + .json", () => {
    expect(
      eventFileName("2026-05-06_qwen-2-5-32b-instruct_4bit_52fbd6", "code_caesar_cipher_bugfix"),
    ).toBe("2026-05-06_qwen-2-5-32b-instruct_4bit_52fbd6__code_caesar_cipher_bugfix.json");
  });
});

const baseScenario = (overrides: Partial<ScenarioWebappRecord> = {}): ScenarioWebappRecord => ({
  kind: "scenario",
  is_scenario: true,
  model: "M",
  runtime: "mlx",
  quant: "4bit",
  prompt_name: overrides.prompt_name ?? "scn_one",
  category: "game",
  tier: 2,
  temperature: 0.3,
  tags: [],
  score_details: "ok",
  prompt_tokens: 1,
  generation_tokens: 1,
  prompt_tps: 1,
  generation_tps: 1,
  wall_time_sec: 1,
  peak_memory_gb: 1,
  output: "",
  prompt_text: "",
  run_id: "r1",
  archive_id: overrides.archive_id ?? "arc_one",
  executed_at: "2026-01-01T00:00:00Z",
  value: 0,
  score_field: "x",
  scenario_name: overrides.scenario_name ?? "scn_one",
  termination_reason: null,
  tool_call_count: null,
  final_player_stats: null,
  events:
    "events" in overrides
      ? (overrides.events ?? null)
      : [{ event: "tool_call", tick: 1, ts: "1", data: {} }],
  has_events: "has_events" in overrides ? (overrides.has_events ?? false) : true,
  blob_pool: "blob_pool" in overrides ? (overrides.blob_pool ?? null) : null,
});

describe("writeEventFiles", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), `events-${randomUUID()}-`));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes one file per scenario record with non-empty events", async () => {
    const records: WebappRecord[] = [
      baseScenario({ archive_id: "a1", prompt_name: "p1" }),
      baseScenario({
        archive_id: "a2",
        prompt_name: "p2",
        events: [
          { event: "tool_call", tick: 1, ts: "1", data: {} },
          { event: "turn_end", tick: 2, ts: "2", data: {} },
        ],
      }),
    ];
    await Effect.runPromise(
      writeEventFiles(dir, records).pipe(Effect.provide(NodeFileSystem.layer)),
    );
    const files = readdirSync(dir).sort();
    expect(files).toEqual(["a1__p1.json", "a2__p2.json"]);
    const a2 = JSON.parse(readFileSync(path.join(dir, "a2__p2.json"), "utf-8"));
    expect(a2.events).toHaveLength(2);
    expect(a2.events[0].event).toBe("tool_call");
    expect(a2.blobPool).toEqual({});
  });

  it("includes the row's blob_pool in the sidecar payload", async () => {
    const pool = { somehash: { role: "user", content: "hi" } };
    const records: WebappRecord[] = [
      baseScenario({
        archive_id: "a1",
        prompt_name: "p1",
        events: [
          {
            event: "turn_end",
            tick: 1,
            ts: "1",
            data: {
              context: { messageCount: 1, messagesRef: ["somehash"] },
              totalTokensIn: 1,
              totalTokensOut: 1,
            },
          },
        ],
        blob_pool: pool,
      }),
    ];
    await Effect.runPromise(
      writeEventFiles(dir, records).pipe(Effect.provide(NodeFileSystem.layer)),
    );
    const a1 = JSON.parse(readFileSync(path.join(dir, "a1__p1.json"), "utf-8"));
    expect(a1.blobPool).toEqual(pool);
    expect(a1.events[0].data.context.messagesRef).toEqual(["somehash"]);
  });

  it("skips scenarios with null events", async () => {
    const records: WebappRecord[] = [
      baseScenario({ archive_id: "a1", prompt_name: "p1", events: null, has_events: false }),
    ];
    await Effect.runPromise(
      writeEventFiles(dir, records).pipe(Effect.provide(NodeFileSystem.layer)),
    );
    expect(readdirSync(dir)).toEqual([]);
  });

  it("skips scenarios with empty events array", async () => {
    const records: WebappRecord[] = [
      baseScenario({ archive_id: "a1", prompt_name: "p1", events: [], has_events: false }),
    ];
    await Effect.runPromise(
      writeEventFiles(dir, records).pipe(Effect.provide(NodeFileSystem.layer)),
    );
    expect(readdirSync(dir)).toEqual([]);
  });

  it("creates the events directory when missing", async () => {
    const subDir = path.join(dir, "nested", "events");
    expect(existsSync(subDir)).toBe(false);
    await Effect.runPromise(
      writeEventFiles(subDir, [baseScenario()]).pipe(Effect.provide(NodeFileSystem.layer)),
    );
    expect(existsSync(subDir)).toBe(true);
    expect(readdirSync(subDir)).toHaveLength(1);
  });
});
