import { useEffect, useState } from "react";

export interface AttemptDetailItem {
  item_id: string;
  prompt_name: string;
  prompt_text: string;
  output: string;
  reasoning: string | null;
  score: number;
  error: string | null;
  scorer: unknown;
  // Per-check constraint breakdown (constraint scorer only). Absent on archives
  // written before breakdown existed → drilldown renders no ✓/✗ marks.
  breakdown?: { passed: string[]; failed: string[]; errored: string[] } | null;
}

export interface AttemptDetail {
  attempt_id: string;
  config_id: string;
  config_hash: string;
  artifact: string;
  challenge_id: string;
  challenge_version: number;
  system_prompt_text: string;
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
 * Classify a `details/<id>.json` response. A missing detail (404, or — under
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

    // Document-relative (not root-absolute) so it honors the deploy base path —
    // e.g. /benchmark-local-llms/details/... on GitHub Pages — matching how
    // index.html loads ./data.js. A root-absolute /details/ would resolve to
    // the domain root and 404 under GitHub Pages' project subpath.
    fetch(`./details/${attemptId}.json`)
      .then(classifyDetailResponse)
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
