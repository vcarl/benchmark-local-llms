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
