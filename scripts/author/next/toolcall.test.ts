import { describe, expect, it } from "vitest";
import {
  accepts,
  expectedCall,
  PROFILE,
  profileOf,
  screen,
  styleOf,
  type Tool,
  toolcallItems,
} from "./toolcall.js";

const tool = (name: string, props: Tool["parameters"]["properties"], required: string[]): Tool => ({
  name,
  description: name,
  parameters: { type: "object", properties: props, required },
});
const current = tool("get_current_weather", { city: { type: "string" } }, ["city"]);
const forecast = tool(
  "get_weather_forecast",
  { city: { type: "string" }, days: { type: "integer" } },
  ["city", "days"],
);
const airQuality = tool(
  "get_air_quality",
  { city: { type: "string" }, pollutant: { type: "string", enum: ["pm25", "ozone"] } },
  ["city"],
);
const units = tool(
  "get_current_weather",
  { city: { type: "string" }, units: { type: "string", enum: ["c", "f"], default: "c" } },
  ["city"],
);

describe("accepts (schema check used by the screen)", () => {
  it("requires required keys, rejects unknown keys, and compares types strictly", () => {
    expect(accepts(forecast.parameters, { city: "Oslo", days: 3 })).toBe(true);
    expect(accepts(forecast.parameters, { city: "Oslo", days: "3" })).toBe(false);
    expect(accepts(forecast.parameters, { city: "Oslo", days: 2.5 })).toBe(false);
    expect(accepts(forecast.parameters, { city: "Oslo" })).toBe(false);
    expect(accepts(current.parameters, { city: "Oslo", days: 3 })).toBe(false);
    expect(accepts(airQuality.parameters, { city: "Oslo", pollutant: "dust" })).toBe(false);
    expect(
      accepts(
        {
          type: "array",
          items: { type: "object", properties: { n: { type: "integer" } }, required: ["n"] },
        },
        [{ n: 1 }, { n: 2 }],
      ),
    ).toBe(true);
  });
});

describe("screen", () => {
  const text = "What's the weather in Oslo right now?";
  const c = (t: Tool, args: Record<string, unknown>) => ({ name: t.name, arguments: args });
  it("passes calls exactly one shown tool fits, with every argument stated", () => {
    expect(
      screen({ catalog: [current, forecast], calls: [c(current, { city: "Oslo" })], text }),
    ).toBeNull();
    expect(screen({ catalog: [current], calls: [], text })).toBeNull();
  });
  it("rejects a draw where a distractor would also accept a call", () => {
    expect(
      screen({ catalog: [current, airQuality], calls: [c(current, { city: "Oslo" })], text }),
    ).toMatch(/get_air_quality/);
  });
  it("rejects an argument value the request never states", () => {
    expect(
      screen({ catalog: [current, forecast], calls: [c(current, { city: "Bergen" })], text }),
    ).toMatch(/Bergen/);
  });
  it("rejects an optional argument set to its default", () => {
    expect(
      screen({
        catalog: [units, forecast],
        calls: [c(units, { city: "Oslo", units: "c" })],
        text: "Oslo weather in c",
      }),
    ).toMatch(/default/);
  });
  it("rejects two identical calls", () => {
    const call = c(current, { city: "Oslo" });
    expect(screen({ catalog: [current, forecast], calls: [call, call], text })).toMatch(
      /duplicate/,
    );
  });
});

describe("expectedCall", () => {
  it("lists unstated defaults as optional and 'in any order' arrays as unordered", () => {
    const t = tool(
      "invite",
      {
        to: { type: "array", description: "Emails, in any order.", items: { type: "string" } },
        units: { type: "string", enum: ["c", "f"], default: "c" },
      },
      ["to"],
    );
    expect(expectedCall({ name: "invite", arguments: { to: ["a", "b"] } }, [t])).toEqual({
      name: "invite",
      arguments: { to: ["a", "b"] },
      optional: { units: "c" },
      unordered: ["to"],
    });
  });
});

describe("generated suite", () => {
  const items = toolcallItems();
  const p = profileOf(items);
  const within = (v: number, [lo, hi]: readonly [number, number]) => v >= lo && v <= hi;

  it("has about 240 items in 60 families across the six behaviours", () => {
    expect(items).toHaveLength(240);
    const families = new Set(items.map((g) => g.authored.item["family"]));
    expect(families.size).toBe(60);
    const behaviours = new Set(items.map((g) => (g.authored.item["tags"] as string[])[0]));
    expect([...behaviours].sort()).toEqual([
      "abstain_missing",
      "abstain_nofit",
      "abstain_wrongop",
      "choice",
      "multi_turn",
      "parallel",
      "parallel_multiple",
      "single",
    ]);
  });

  it("keeps catalogs within the calibration bands", () => {
    expect(within(p.toolsMedian, PROFILE.toolsMedian), `tools median ${p.toolsMedian}`).toBe(true);
    expect(p.toolsP90).toBeGreaterThanOrEqual(PROFILE.toolsP90Min);
    expect(p.itemsWith12PlusTools).toBeGreaterThanOrEqual(PROFILE.itemsWith12PlusToolsMin);
    expect(p.paramsMax).toBeGreaterThanOrEqual(PROFILE.paramsMaxMin);
    expect(p.maxDepth).toBeLessThanOrEqual(PROFILE.maxDepth);
    for (const k of [
      "paramsPerFn",
      "requiredShare",
      "defaultShare",
      "enumShare",
      "booleanShare",
      "arrayShare",
      "objectShare",
      "fnDescMedian",
      "paramDescMedian",
      "nonEnglishShare",
    ] as const)
      expect(within(p[k], PROFILE[k]), `${k} ${p[k]} outside ${PROFILE[k]}`).toBe(true);
    for (const [style, share] of Object.entries(p.styleShares))
      expect(share, `${style} naming share`).toBeGreaterThanOrEqual(PROFILE.styleMin);
  });

  it("classifies naming styles", () => {
    expect(
      ["Weather_1_GetWeather", "calendar.list_events", "getUserById", "send_email"].map(styleOf),
    ).toEqual(["sgd", "dotted", "camel", "snake"]);
  });
});
