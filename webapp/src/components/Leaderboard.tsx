import { useRef, useEffect } from "react";
import * as d3 from "d3";
import type { BenchmarkResult } from "../lib/data";
import { scoreColor, RUNTIME_COLORS } from "../lib/colors";

interface LeaderboardProps {
  data: BenchmarkResult[];
}

interface ModelAgg {
  model: string;
  score: number;
  wallLlama: number;
  wallMlx: number;
  wallTotal: number;
  mem: number;
}

export function Leaderboard({ data }: LeaderboardProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = d3.select(containerRef.current);
    el.selectAll("*").remove();

    // Aggregate per model
    const agg: Record<
      string,
      {
        model: string;
        scores: number[];
        wall: Record<string, number>;
        mem: number[];
      }
    > = {};
    data.forEach((d) => {
      if (!agg[d.model])
        agg[d.model] = { model: d.model, scores: [], wall: {}, mem: [] };
      agg[d.model].scores.push(d.score);
      if (!agg[d.model].wall[d.runtime]) agg[d.model].wall[d.runtime] = 0;
      agg[d.model].wall[d.runtime] += d.wall_time_sec;
      if (d.peak_memory_gb > 0) agg[d.model].mem.push(d.peak_memory_gb);
    });

    const models: ModelAgg[] = Object.values(agg)
      .map((a) => ({
        model: a.model,
        score: a.scores.reduce((s, v) => s + v, 0) / a.scores.length,
        wallLlama: a.wall.llamacpp || 0,
        wallMlx: a.wall.mlx || 0,
        wallTotal: (a.wall.llamacpp || 0) + (a.wall.mlx || 0),
        mem: a.mem.length ? Math.max(...a.mem) : 0,
      }))
      .sort((a, b) => b.score - a.score);

    if (models.length === 0) return;

    const maxWall = Math.max(...models.map((m) => m.wallTotal));
    const maxMem = Math.max(...models.map((m) => m.mem), 1);
    const minBarH = 10;
    const maxBarH = 40;

    models.forEach((m) => {
      const row = el.append("div").attr("class", "leaderboard-row");

      // Name
      row
        .append("div")
        .attr("class", "leaderboard-name")
        .attr("title", m.model)
        .text(m.model);

      // Bars
      const bars = row.append("div").attr("class", "leaderboard-bars");
      const barH =
        m.mem > 0
          ? Math.round(minBarH + (m.mem / maxMem) * (maxBarH - minBarH))
          : minBarH;
      const widthPct = maxWall > 0 ? (m.wallTotal / maxWall) * 90 : 0;
      const llamaPct = m.wallTotal > 0 ? m.wallLlama / m.wallTotal : 0.5;

      if (m.wallLlama > 0) {
        bars
          .append("div")
          .style("height", barH + "px")
          .style("width", (widthPct * llamaPct).toFixed(1) + "%")
          .style("background", RUNTIME_COLORS.llamacpp)
          .style("border-radius", "3px 0 0 3px");
      }
      if (m.wallMlx > 0) {
        const hasLlama = m.wallLlama > 0;
        bars
          .append("div")
          .style("height", barH + "px")
          .style("width", (widthPct * (1 - llamaPct)).toFixed(1) + "%")
          .style("background", RUNTIME_COLORS.mlx)
          .style(
            "border-radius",
            hasLlama ? "0 3px 3px 0" : "3px",
          );
      }

      // Stats
      const pct = Math.round(m.score * 100);
      const totalSec = Math.round(m.wallTotal);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      const timeStr = min > 0 ? `${min}m ${sec}s` : `${sec}s`;
      const memStr = m.mem > 0 ? `${m.mem.toFixed(0)}G` : "";

      const stats = row.append("div").attr("class", "leaderboard-stats");
      stats
        .append("div")
        .attr("class", "score")
        .style("color", scoreColor(pct))
        .text(pct + "%");
      stats
        .append("div")
        .attr("class", "meta")
        .text(timeStr + (memStr ? ` \u00b7 ${memStr}` : ""));
    });
  }, [data]);

  return (
    <div className="chart-card">
      <h3>Model Leaderboard</h3>
      <div className="chart-subtitle">
        Ranked by avg score. Width = duration. Height = peak memory.
      </div>
      <div ref={containerRef} />
    </div>
  );
}
