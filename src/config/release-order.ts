/**
 * Release order: `0` (alpha), then `YYYY.N` by year and number, then the draft
 * (the next release); null (no release) first. Dependency-free, so the webapp
 * imports it too.
 */
export const compareReleases = (a: string | null, b: string | null): number => {
  const key = (r: string | null) =>
    r === "draft" ? [Infinity] : r === null ? [-Infinity] : r.split(".").map(Number);
  const [x, y] = [key(a), key(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
};
