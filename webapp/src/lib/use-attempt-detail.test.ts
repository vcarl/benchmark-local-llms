import { describe, expect, it } from "vitest";
import { classifyDetailResponse } from "./use-attempt-detail";

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
