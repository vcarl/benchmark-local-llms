import { useRef, useState } from "react";
import type { ListRow } from "../lib/pipeline";
import { scoreBand } from "../lib/constants";
import { CapabilityHoverCard } from "./CapabilityHoverCard";
import { setHoveredModel, clearHoveredModel } from "../lib/hover-store";
import { familyColor } from "../lib/colors";

interface Props {
  row: ListRow;
  rank: number;
  onClick: () => void;
}

const abbrevRuntime = (runtime: string): string =>
  runtime === "llamacpp" ? "lcpp" : runtime;

export function ResultRow({ row, rank, onClick }: Props) {
  const [capTip, setCapTip] = useState<{ x: number; y: number } | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const rowColor = familyColor(row.family);
  const maxVariantTokens = Math.max(1, ...row.variants.map((v) => v.tokens));
  const anyBrokenTokens = row.variants.some((v) => v.tokens === 0 && v.score > 0);
  const brokenTitle = "Some variants ran without recording token counts — aggregate is unreliable.";

  const handleMouseEnter = () => {
    if (row.baseModel !== null) setHoveredModel(row.baseModel);
  };
  const handleMouseLeave = () => {
    if (row.baseModel !== null) clearHoveredModel();
  };

  return (
    <div
      ref={rowRef}
      className="result-row"
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="button"
    >
      <div className="result-row-breakdown">
        <div className="result-variants">
          {row.variants.map((v, i) => {
            const opacity = 0.55 + 0.45 * (1 - i / Math.max(1, row.variants.length - 1));
            const tokenPct = Math.max(0, Math.min(100, (v.tokens / maxVariantTokens) * 100));
            const variantTitle = `${Math.round(v.tokens).toLocaleString()} tokens/run`;
            return (
              <div key={`${v.runtime}|${v.quant}|${v.temperature}`} className="result-variant">
                <span className="result-variant-label">{abbrevRuntime(v.runtime)} {v.quant} t{v.temperature}</span>
                <span className="result-variant-track" title={variantTitle}>
                  <span
                    className="result-variant-fill"
                    style={{ width: `${Math.max(0, Math.min(100, v.score))}%`, background: rowColor, opacity }}
                  />
                  <span
                    className="result-variant-tokens"
                    style={{ width: `${tokenPct}%`, background: rowColor, boxShadow: `0 0 6px ${rowColor}` }}
                  />
                </span>
                <span className="result-variant-score">{v.score.toFixed(0)}%</span>
              </div>
            );
          })}
        </div>

        <div
          className="result-capability"
          onMouseEnter={(ev) => {
            const rect = rowRef.current?.getBoundingClientRect();
            if (rect) setCapTip({ x: ev.clientX - rect.left, y: ev.clientY - rect.top });
          }}
          onMouseMove={(ev) => {
            const rect = rowRef.current?.getBoundingClientRect();
            if (rect) setCapTip({ x: ev.clientX - rect.left, y: ev.clientY - rect.top });
          }}
          onMouseLeave={() => setCapTip(null)}
        >
          {row.capability.map((c) => (
            <div
              key={c.tag}
              className={c.pass === null ? "result-cap-cell cap-absent" : `result-cap-cell cap-${scoreBand(c.pass)}`}
              title={c.pass === null ? `${c.tag}: no runs` : `${c.tag}: ${Math.round(c.pass * 100)}%`}
            />
          ))}
          {capTip !== null && (
            <div style={{ position: "absolute", left: capTip.x + 12, top: capTip.y + 12, pointerEvents: "none" }}>
              <CapabilityHoverCard title={row.key} capability={row.capability} />
            </div>
          )}
        </div>
      </div>

      <div className="result-row-always">
        <div className="result-rank">{rank}</div>
        <div className="result-model">
          <div className="result-model-name">{row.key}</div>
          {row.family !== null && <div className="result-model-family">{row.family}</div>}
        </div>
        <div className="result-score-cell">
          <div className={`result-score cap-${scoreBand(row.bestScore / 100)}`}>
            {row.bestScore.toFixed(0)}%
          </div>
          <div
            className={`result-efficiency${anyBrokenTokens ? " result-efficiency--broken" : ""}`}
            title={anyBrokenTokens ? brokenTitle : undefined}
          >
            {row.efficiency} tok/pt
          </div>
        </div>
        <div className="result-numeric">
          <span>{row.mem.toFixed(1)} GB</span>
          <span className="result-numeric-sub">{row.bestVariant.quant}</span>
        </div>
        <div
          className={`result-numeric${anyBrokenTokens ? " result-numeric--broken" : ""}`}
          title={anyBrokenTokens ? brokenTitle : undefined}
        >
          <span>{Math.round(row.avgTokens).toLocaleString()}</span>
          <span className="result-numeric-sub">avg/run</span>
        </div>
      </div>
    </div>
  );
}
