import { describe, expect, it, vi } from "vitest";
import { promptsUrl } from "./snapshots";
import { type AttemptDetail, classifyDetailResponse, withPrompts } from "./use-attempt-detail";

const jsonHeaders = { "content-type": "application/json" };
const htmlHeaders = { "content-type": "text/html" };

describe("classifyDetailResponse", () => {
  it("loads a valid JSON detail body", async () => {
    const detail = { attempt_id: "a1", items: [] };
    const res = new Response(JSON.stringify(detail), { status: 200, headers: jsonHeaders });
    const r = await classifyDetailResponse(res);
    expect(r).toEqual({ kind: "loaded", detail });
  });

  it("treats a 404 as not-found", async () => {
    const res = new Response("", { status: 404 });
    expect(await classifyDetailResponse(res)).toEqual({ kind: "not-found" });
  });

  it("treats a 200 SPA-fallback HTML body as not-found (missing detail)", async () => {
    const res = new Response("<!doctype html><html></html>", { status: 200, headers: htmlHeaders });
    expect(await classifyDetailResponse(res)).toEqual({ kind: "not-found" });
  });

  it("treats a JSON content-type that fails to parse as not-found", async () => {
    const res = new Response("not json{", { status: 200, headers: jsonHeaders });
    expect(await classifyDetailResponse(res)).toEqual({ kind: "not-found" });
  });

  it("surfaces a non-404 HTTP failure as error", async () => {
    const res = new Response("boom", { status: 500 });
    expect(await classifyDetailResponse(res)).toEqual({ kind: "error", message: "HTTP 500" });
  });
});

describe("withPrompts", () => {
  const item = (item_id: string, prompt_text?: string) =>
    ({ item_id, prompt_name: item_id, output: "", ...(prompt_text === undefined ? {} : { prompt_text }) }) as AttemptDetail["items"][number];
  const detail = (over: Partial<AttemptDetail>) =>
    ({ attempt_id: "a", items: [item("x"), item("y")], ...over }) as AttemptDetail;

  it("leaves a detail with inline prompt text alone", async () => {
    const d = detail({ items: [item("x", "inline")] });
    expect(await withPrompts(d)).toBe(d);
  });

  it("fills prompt text from the named pack, fetching each pack once", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ x: "px", y: "py" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const a = await withPrompts(detail({ prompts: "d1" }));
      await withPrompts(detail({ prompts: "d1" }));
      expect(a.items.map((i) => i.prompt_text)).toEqual(["px", "py"]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(promptsUrl("d1"));
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
