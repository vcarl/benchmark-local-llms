import { starPointsForTokens } from "../lib/pipeline";

interface Props {
  families: Array<{ name: string; color: string }>;
}

const starPath = (cx: number, cy: number, n: number, outerR: number, innerR: number): string => {
  let d = "";
  for (let i = 0; i < 2 * n; i += 1) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (Math.PI / n) * i - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    d += (i === 0 ? "M" : "L") + x.toFixed(2) + "," + y.toFixed(2);
  }
  return `${d}Z`;
};

const TOKEN_REFS: Array<{ tokens: number; label: string }> = [
  { tokens: 500, label: "500" },
  { tokens: 1000, label: "1k" },
  { tokens: 2000, label: "2k" },
  { tokens: 4000, label: "4k" },
  { tokens: 8000, label: "8k" },
  { tokens: 16000, label: "16k+" },
];

export function ScatterLegend({ families }: Props) {
  return (
    <div className="scatter-legend">
      <div className="scatter-legend-row">
        <span className="scatter-legend-group">family:</span>
        {families.map((f) => (
          <span key={f.name} className="scatter-legend-family">
            <span className="scatter-legend-swatch" style={{ background: f.color }} />
            {f.name}
          </span>
        ))}
      </div>
      <div className="scatter-legend-row">
        <span className="scatter-legend-group">memory (area):</span>
        <svg width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="4" fill="currentColor" /></svg>
        <span>1 GB</span>
        <svg width="24" height="24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="currentColor" /></svg>
        <span>5 GB</span>
        <svg width="32" height="32" aria-hidden="true"><circle cx="16" cy="16" r="13" fill="currentColor" /></svg>
        <span>15 GB</span>
      </div>
      <div className="scatter-legend-row">
        <span className="scatter-legend-group">tokens (bumps):</span>
        {TOKEN_REFS.map(({ tokens, label }) => {
          const n = starPointsForTokens(tokens);
          return (
            <span key={tokens} className="scatter-legend-star">
              <svg width="22" height="22" aria-hidden="true">
                <path d={starPath(11, 11, n, 10, 10 * 0.75)} fill="currentColor" />
              </svg>
              <span>{label}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
