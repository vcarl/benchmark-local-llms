import type { ItemTimingDetail } from "./use-attempt-detail";

// Wall-time (seconds) → compact human string: "45s", "3m 12s", "2h 5m".
export const formatWallTime = (s: number): string => {
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const sec = Math.round(s - m * 60);
    return sec === 0 ? `${m}m` : `${m}m ${sec}s`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.round((s - h * 3600) / 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

const sec = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

// One item's cost line for the drilldown: wall time, TTFT, the prefill/decode
// split with decode rate, where the split came from, and cache/draft use.
// Parts whose fields the line lacks are left out.
export const formatItemTiming = (t: ItemTimingDetail): string =>
  [
    `${t.wall_sec.toFixed(1)}s wall`,
    t.ttft_ms !== undefined && `TTFT ${sec(t.ttft_ms)}`,
    t.prefill_ms !== undefined && `prefill ${sec(t.prefill_ms)}`,
    t.decode_ms !== undefined &&
      `decode ${(t.decode_ms / 1000).toFixed(1)}s` +
        (t.decode_ms > 0 && t.generation_tokens > 0
          ? ` (${((t.generation_tokens * 1000) / t.decode_ms).toFixed(1)} tok/s)`
          : ""),
    t.source !== undefined && `${t.source} timings`,
    `${t.prompt_tokens} prompt tok` +
      (t.cached_prompt_tokens ? ` (${t.cached_prompt_tokens} cached)` : ""),
    `${t.generation_tokens} gen tok`,
    t.draft_tokens !== undefined && `draft ${t.draft_accepted_tokens ?? 0}/${t.draft_tokens} accepted`,
  ]
    .filter(Boolean)
    .join(" · ");

// An item count that may be fractional (resampled items count their pass
// fraction): whole numbers print as-is, others to one decimal.
export const formatCount = (n: number): string => String(Number(n.toFixed(1)));
