import { useEffect, useState } from "react";
import { detailUrl, promptsUrl } from "./snapshots";

/** Per-item timing as `src/legacy/write-details.ts` emits it (archive field names in ARCHIVE-FORMAT.md). */
export interface ItemTimingDetail {
  wall_sec: number;
  prompt_tokens: number;
  generation_tokens: number;
  ttft_ms?: number;
  prefill_ms?: number;
  decode_ms?: number;
  source?: "server" | "client";
  prefill_tokens?: number;
  cached_prompt_tokens?: number;
  draft_tokens?: number;
  draft_accepted_tokens?: number;
}

export interface AttemptDetailItem {
  item_id: string;
  prompt_name: string;
  // Turn units of a multi-turn item only. For turn > 1, prompt_text is the
  // conversation JSON (gold history + this turn's prompt).
  parent_item_id?: string;
  turn?: number;
  // Whether the model's own answer to the previous turn passed; null on turn 1
  // and single-shot items.
  prior_turn_passed?: boolean | null;
  prompt_text: string;
  output: string;
  reasoning: string | null;
  score: number;
  // [passed, n] over the item's samples when it was resampled (n > 1); this
  // entry shows its first sample. Absent on single-sample items.
  samples?: [number, number];
  error: string | null;
  scorer: unknown;
  // Per-check constraint breakdown (constraint scorer only). Absent on archives
  // written before breakdown existed → drilldown renders no ✓/✗ marks.
  breakdown?: { passed: string[]; failed: string[]; errored: string[] } | null;
  // Cost of the shown sample. Absent in detail files built before the field;
  // its optional keys are absent on lines recorded before timing capture.
  timing?: ItemTimingDetail;
}

export interface AttemptDetail {
  attempt_id: string;
  config_id: string;
  config_hash: string;
  artifact: string;
  challenge_id: string;
  challenge_version: number;
  system_prompt_text: string;
  // Digest of the prompt pack (`snapshots/prompts/<digest>.json`, `{ item_id: text }`)
  // holding the items' prompt text. Absent in details built before packs, whose
  // items carry `prompt_text` inline.
  prompts?: string;
  items: AttemptDetailItem[];
}

export type DetailState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; detail: AttemptDetail }
  | { status: "not-found" }
  | { status: "error"; message: string };

type FetchResult =
  | { kind: "loaded"; detail: AttemptDetail }
  | { kind: "not-found" }
  | { kind: "error"; message: string };

/**
 * Classify a `snapshots/details/<id>.json` response. A missing detail (404, or — under
 * GitHub Pages' SPA fallback — a 200 serving index.html) and any body that
 * isn't valid JSON degrade to "not-found" rather than throwing: drilldown is
 * legitimately unavailable for v1 / non-reconstructible attempts. Only genuine
 * non-404 HTTP failures surface as "error".
 */
export const classifyDetailResponse = async (res: Response): Promise<FetchResult> => {
  if (res.status === 404) return { kind: "not-found" };
  if (!res.ok) return { kind: "error", message: `HTTP ${res.status}` };
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    // SPA-fallback HTML or any non-JSON payload — treat as unavailable.
    return { kind: "not-found" };
  }
  try {
    const detail = (await res.json()) as AttemptDetail;
    return { kind: "loaded", detail };
  } catch {
    // Body claimed JSON but didn't parse — corrupt/missing detail.
    return { kind: "not-found" };
  }
};

// In-memory cache so re-expanding an attempt doesn't re-fetch.
const cache = new Map<string, AttemptDetail>();
// One fetch per prompt pack: every config's detail for a challenge shares it.
const packs = new Map<string, Promise<Record<string, string>>>();

/** Fill each item's `prompt_text` from the detail's prompt pack, when it names one. */
export const withPrompts = async (detail: AttemptDetail): Promise<AttemptDetail> => {
  const digest = detail.prompts;
  if (digest === undefined) return detail;
  let pack = packs.get(digest);
  if (pack === undefined) {
    pack = fetch(promptsUrl(digest)).then((res) =>
      res.ok ? (res.json() as Promise<Record<string, string>>) : Promise.reject(new Error(`prompts ${digest}: HTTP ${res.status}`)),
    );
    packs.set(digest, pack);
    pack.catch(() => packs.delete(digest));
  }
  const texts = await pack;
  return { ...detail, items: detail.items.map((i) => ({ ...i, prompt_text: texts[i.item_id] ?? "" })) };
};

export const useAttemptDetail = (attemptId: string | undefined): DetailState => {
  const [state, setState] = useState<DetailState>({ status: "idle" });

  useEffect(() => {
    if (attemptId === undefined) {
      setState({ status: "idle" });
      return;
    }
    const cached = cache.get(attemptId);
    if (cached !== undefined) {
      setState({ status: "loaded", detail: cached });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });

    // Document-relative (see ./snapshots.ts) so it honors the deploy base path.
    fetch(detailUrl(attemptId))
      .then(classifyDetailResponse)
      .then(async (r): Promise<FetchResult> =>
        r.kind === "loaded" ? { kind: "loaded", detail: await withPrompts(r.detail) } : r,
      )
      .then((r) => {
        if (cancelled) return;
        if (r.kind === "loaded") {
          cache.set(attemptId, r.detail);
          setState({ status: "loaded", detail: r.detail });
        } else if (r.kind === "not-found") {
          setState({ status: "not-found" });
        } else {
          setState({ status: "error", message: r.message });
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ status: "error", message: String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  return state;
};
