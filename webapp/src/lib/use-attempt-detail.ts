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
    type FetchResult =
      | { kind: "loaded"; detail: AttemptDetail }
      | { kind: "not-found" }
      | { kind: "error"; message: string };

    fetch(`/details/${attemptId}.json`)
      .then((res): Promise<FetchResult> => {
        if (res.status === 404) return Promise.resolve({ kind: "not-found" });
        if (!res.ok) return Promise.resolve({ kind: "error", message: `HTTP ${res.status}` });
        return res.json().then((detail: AttemptDetail) => ({ kind: "loaded" as const, detail }));
      })
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
