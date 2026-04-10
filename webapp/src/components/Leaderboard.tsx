import { useMemo, useState } from "react";
import type { BenchmarkResult, QuantInfo } from "../lib/data";
import { scoreColor, RUNTIME_COLORS } from "../lib/colors";

interface LeaderboardProps {
  data: BenchmarkResult[];
  hoveredModel: string | null;
  onHoverModel: (model: string | null) => void;
  bestQuantMap?: Map<string, string>;
  quantSummary?: Record<string, Record<string, QuantInfo[]>>;
}

interface ModelAgg {
  model: string;
  scoreBest: number;
  scoreLlama: number;
  scoreMlx: number;
  wallLlama: number;
  wallMlx: number;
  wallTotal: number;
  mem: number;
  tokens: number;
}

type SortKey = "best" | "llamacpp" | "mlx";

export function Leaderboard({ data, hoveredModel, onHoverModel, bestQuantMap: bestQMap, quantSummary: qSummary }: LeaderboardProps) {
  const [sortBy, setSortBy] = useState<SortKey>("best");

  const models = useMemo(() => {
    const agg: Record<
      string,
      {
        model: string;
        scores: number[];
        llamaScores: number[];
        mlxScores: number[];
        wall: Record<string, number>;
        mem: number[];
        tokens: number;
      }
    > = {};
    data.forEach((d) => {
      if (!agg[d.model])
        agg[d.model] = {
          model: d.model,
          scores: [],
          llamaScores: [],
          mlxScores: [],
          wall: {},
          mem: [],
          tokens: 0,
        };
      agg[d.model].scores.push(d.score);
      if (d.runtime === "llamacpp") agg[d.model].llamaScores.push(d.score);
      if (d.runtime === "mlx") agg[d.model].mlxScores.push(d.score);
      if (!agg[d.model].wall[d.runtime]) agg[d.model].wall[d.runtime] = 0;
      agg[d.model].wall[d.runtime] += d.wall_time_sec;
      if (d.peak_memory_gb > 0) agg[d.model].mem.push(d.peak_memory_gb);
      agg[d.model].tokens += (d.prompt_tokens || 0) + (d.generation_tokens || 0);
    });

    const avg = (arr: number[]) =>
      arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : -1;

    return Object.values(agg).map((a) => {
      const ll = avg(a.llamaScores);
      const ml = avg(a.mlxScores);
      return {
      model: a.model,
      scoreBest: Math.max(ll, ml),
      scoreLlama: ll,
      scoreMlx: ml,
      wallLlama: a.wall.llamacpp || 0,
      wallMlx: a.wall.mlx || 0,
      wallTotal: (a.wall.llamacpp || 0) + (a.wall.mlx || 0),
      mem: a.mem.length ? Math.max(...a.mem) : 0,
      tokens: a.tokens,
    };});
  }, [data]);

  const sorted = useMemo(() => {
    const key =
      sortBy === "llamacpp"
        ? "scoreLlama"
        : sortBy === "mlx"
          ? "scoreMlx"
          : "scoreBest";
    return [...models].sort((a, b) => b[key] - a[key]);
  }, [models, sortBy]);

  const maxWallLlama = Math.max(...models.map((m) => m.wallLlama), 1);
  const maxWallMlx = Math.max(...models.map((m) => m.wallMlx), 1);
  const maxMem = Math.max(...models.map((m) => m.mem), 1);
  const maxTokens = Math.max(...models.map((m) => m.tokens), 1);
  const minBarH = 4;
  const maxBarH = 32;

  function formatScore(score: number): string {
    return score < 0 ? "—" : Math.round(score * 100) + "%";
  }

  function formatTime(sec: number): string {
    const total = Math.round(sec);
    const hrs = Math.floor(total / 3600);
    const min = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (hrs > 0) return `${hrs}h ${min}m`;
    if (min > 0) return `${min}m ${s}s`;
    return `${s}s`;
  }

  return (
    <div className="chart-card">
      <h3>Model Leaderboard</h3>
      <div
        className="chart-subtitle"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>Width = duration. Height = memory. Opacity = tokens.</span>
        <span style={{ fontSize: "11px", color: "#6b7280" }}>
          Sort:{" "}
          {(["best", "llamacpp", "mlx"] as SortKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              style={{
                fontSize: "11px",
                padding: "1px 6px",
                marginLeft: "4px",
                border: "1px solid",
                borderColor: sortBy === key ? "#3b82f6" : "#d1d5db",
                borderRadius: "4px",
                background: sortBy === key ? "#dbeafe" : "transparent",
                color: sortBy === key ? "#1d4ed8" : "#6b7280",
                cursor: "pointer",
              }}
            >
              {key === "best" ? "Best" : key}
            </button>
          ))}
        </span>
      </div>
      <div>
        {sorted.map((m) => {
          const llamaW = m.wallLlama > 0 ? (m.wallLlama / maxWallLlama) * 90 : 0;
          const mlxW = m.wallMlx > 0 ? (m.wallMlx / maxWallMlx) * 90 : 0;
          const barH =
            m.mem > 0
              ? Math.round(minBarH + (m.mem / maxMem) * (maxBarH - minBarH))
              : minBarH;
          const tokenOpacity = 0.25 + 0.65 * (m.tokens / maxTokens);

          return (
            <div
              className="leaderboard-row"
              key={m.model}
              onMouseEnter={() => onHoverModel(m.model)}
              onMouseLeave={() => onHoverModel(null)}
              style={{
                opacity: hoveredModel && hoveredModel !== m.model ? 0.3 : 1,
                transition: "opacity 0.15s",
              }}
            >
              <div className="leaderboard-name" title={m.model}>
                {m.model}
                {bestQMap && (() => {
                  const quants = new Set<string>();
                  for (const [key, q] of bestQMap) {
                    if (key.startsWith(m.model + "|") && q) quants.add(q);
                  }
                  if (quants.size === 0) return null;
                  return (
                    <span style={{ color: "#9ca3af", fontSize: "0.8em", marginLeft: "4px" }}>
                      {[...quants].join("/")}
                    </span>
                  );
                })()}
              </div>
              <div className="leaderboard-bars stacked">
                {m.wallLlama > 0 && (
                  <div
                    style={{
                      height: barH,
                      width: `${llamaW.toFixed(1)}%`,
                      background: RUNTIME_COLORS.llamacpp,
                      opacity: tokenOpacity,
                      border: `1px solid ${RUNTIME_COLORS.llamacpp}`,
                      borderRadius: "3px 3px 0 0",
                    }}
                  />
                )}
                {m.wallMlx > 0 && (
                  <div
                    style={{
                      height: barH,
                      width: `${mlxW.toFixed(1)}%`,
                      background: RUNTIME_COLORS.mlx,
                      opacity: tokenOpacity,
                      border: `1px solid ${RUNTIME_COLORS.mlx}`,
                      borderRadius: "0 0 3px 3px",
                    }}
                  />
                )}
              </div>
              <div className="leaderboard-scores">
                <div
                  className="score"
                  style={{ color: scoreColor(Math.round(m.scoreBest * 100)) }}
                  title="best"
                >
                  {formatScore(m.scoreBest)}
                </div>
                <div
                  className="score"
                  style={{ color: RUNTIME_COLORS.llamacpp }}
                  title="llamacpp"
                >
                  {formatScore(m.scoreLlama)}
                </div>
                <div
                  className="score"
                  style={{ color: RUNTIME_COLORS.mlx }}
                  title="mlx"
                >
                  {formatScore(m.scoreMlx)}
                </div>
              </div>
              <div className="leaderboard-meta">
                <span>
                  {formatTime(m.wallTotal)}
                  {m.mem > 0 ? ` · ${m.mem.toFixed(0)}G` : ""}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
